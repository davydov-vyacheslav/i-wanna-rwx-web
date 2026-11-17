package com.javanix.rwx.identity.internal;

import com.javanix.rwx.identity.NotAuthenticatedException;
import com.javanix.rwx.identity.UserTimezoneChangedEvent;
import com.javanix.rwx.identity.internal.exception.AccountDisabledException;
import com.javanix.rwx.identity.internal.exception.InvalidSettingsException;
import com.javanix.rwx.identity.internal.persistence.CredentialEntity;
import com.javanix.rwx.identity.internal.persistence.CredentialRepository;
import com.javanix.rwx.identity.internal.persistence.UserEntity;
import com.javanix.rwx.identity.internal.persistence.UserRepository;
import com.javanix.rwx.identity.internal.persistence.UserSettingsEntity;
import com.javanix.rwx.identity.internal.persistence.UserSettingsRepository;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.Set;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.resilience.annotation.Retryable;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Everything identity does to an account: login-or-create, profile, settings (shared by /me and /settings), delete. */
@Service
public class AccountService {

    private static final Set<String> LOCALES = Set.of("en", "ru", "uk");

    private final UserRepository users;
    private final UserSettingsRepository settings;
    private final CredentialRepository credentials;
    private final FindByIndexNameSessionRepository<?> sessions;
    private final ApplicationEventPublisher events;

    AccountService(UserRepository users, UserSettingsRepository settings, CredentialRepository credentials,
            FindByIndexNameSessionRepository<?> sessions, ApplicationEventPublisher events) {
        this.users = users;
        this.settings = settings;
        this.credentials = credentials;
        this.sessions = sessions;
        this.events = events;
    }

    /**
     * Known credential: refresh its metadata and return the user. Unknown: create user, credential and UTC settings
     * in one transaction. Concurrent first logins of one identity race on the unique (type, external_id); the loser's
     * transaction is rolled back and the retry (a fresh transaction, the retry advice wraps the transactional one)
     * finds the winner's credential.
     */
    @Retryable(includes = DataIntegrityViolationException.class, maxRetries = 3, delay = 20, jitter = 20)
    @Transactional
    public UUID loginOrCreate(ExternalProfile profile) {
        var now = Instant.now();
        var existing = credentials.findByTypeAndExternalId(profile.provider(), profile.externalId());
        if (existing.isPresent()) {
            var credential = existing.get();
            var user = users.findById(credential.getUserId()).orElseThrow();
            if (user.isDisabled()) {
                throw new AccountDisabledException();
            }
            credential.refresh(profile, now);
            return user.getId();
        }
        var userId = UUID.randomUUID();
        users.save(new UserEntity(userId, now));
        // flush surfaces the unique violation here, so the whole insert rolls back together
        credentials.saveAndFlush(new CredentialEntity(UUID.randomUUID(), userId, profile, now));
        settings.save(new UserSettingsEntity(UUID.randomUUID(), userId, "UTC", now));
        return userId;
    }

    @Transactional(readOnly = true)
    public UserSettingsEntity settings(UUID userId) {
        return settings.findByUserId(userId).orElseThrow(NotAuthenticatedException::new);
    }

    @Transactional(readOnly = true)
    public Profile profile(UUID userId) {
        return credentials.findByUserId(userId).stream()
                .max(Comparator.comparing(CredentialEntity::getLastUsedAt))
                .map(c -> new Profile(firstNonNull(c.name(), c.login(), "user"), c.avatarUrl()))
                .orElse(new Profile("user", null));
    }

    /** Nothing is written when validation fails; the event is published only if the zone really changed. */
    @Transactional
    public UserSettingsEntity update(UUID userId, String timeZone, String locale, Boolean pushEnabled) {
        if (timeZone == null && locale == null && pushEnabled == null) {
            throw new InvalidSettingsException("validation", "At least one property is required.");
        }
        if (locale != null && !LOCALES.contains(locale)) {
            throw new InvalidSettingsException("validation", "Unsupported locale.");
        }
        ZoneId newZone = null;
        if (timeZone != null) {
            newZone = parseZone(timeZone);
        }
        var row = settings.findByUserId(userId).orElseThrow(NotAuthenticatedException::new);
        var oldZone = ZoneId.of(row.getTimezone());
        row.apply(newZone == null ? null : newZone.getId(), locale, pushEnabled, Instant.now());
        settings.saveAndFlush(row);
        if (newZone != null && !newZone.equals(oldZone)) {
            events.publishEvent(new UserTimezoneChangedEvent(userId, oldZone, newZone));
        }
        return row;
    }

    /**
     * ON DELETE CASCADE covers every user-owned table. Sessions are not FK-linked to users, so every session of the
     * user (all devices) is removed by principal name first, in the same transaction (the JDBC session repository
     * joins it): a failure rolls both back.
     */
    @Transactional
    public void delete(UUID userId) {
        sessions.findByPrincipalName(userId.toString()).keySet().forEach(sessions::deleteById);
        users.deleteById(userId);
    }

    private static ZoneId parseZone(String id) {
        // getAvailableZoneIds is the IANA list; ZoneId.of alone would also accept offsets such as "+02:00".
        if (!ZoneId.getAvailableZoneIds().contains(id)) {
            throw new InvalidSettingsException("invalid_timezone", "Unknown IANA time zone.");
        }
        try {
            return ZoneId.of(id);
        } catch (DateTimeException e) {
            throw new InvalidSettingsException("invalid_timezone", "Unknown IANA time zone.");
        }
    }

    private static String firstNonNull(String first, String second, String fallback) {
        return first != null ? first : second != null ? second : fallback;
    }

    public record Profile(String displayName, String avatarUrl) {
    }
}
