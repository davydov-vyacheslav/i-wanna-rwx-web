package com.javanix.rwx.identity.internal;

import com.javanix.rwx.identity.UserCreatedEvent;
import com.javanix.rwx.identity.internal.exception.AccountDisabledException;
import com.javanix.rwx.identity.internal.persistence.CredentialEntity;
import com.javanix.rwx.identity.internal.persistence.CredentialRepository;
import com.javanix.rwx.identity.internal.persistence.UserEntity;
import com.javanix.rwx.identity.internal.persistence.UserRepository;
import java.time.Clock;
import java.util.Comparator;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.resilience.annotation.Retryable;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Everything identity does to an account: login-or-create, profile, delete. */
@Service
public class AccountService {

    private final UserRepository users;
    private final CredentialRepository credentials;
    private final FindByIndexNameSessionRepository<?> sessions;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    AccountService(UserRepository users, CredentialRepository credentials,
            FindByIndexNameSessionRepository<?> sessions, ApplicationEventPublisher events, Clock clock) {
        this.users = users;
        this.credentials = credentials;
        this.sessions = sessions;
        this.events = events;
        this.clock = clock;
    }

    /**
     * Known credential: refresh its metadata and return the user. Unknown: create user and credential
     * in one transaction. Concurrent first logins of one identity race on the unique (type, external_id); the loser's
     * transaction is rolled back and the retry (a fresh transaction, the retry advice wraps the transactional one)
     * finds the winner's credential. {@code locale} (en, ru or uk, see {@link com.javanix.rwx.identity.internal.github.GithubOAuth2UserService}) only matters for a new
     * user: it fixes the account's locale.
     */
    @Retryable(includes = DataIntegrityViolationException.class, maxRetries = 3, delay = 20, jitter = 20)
    @Transactional
    public UUID loginOrCreate(ExternalProfile profile, String locale) {
        var now = clock.instant();
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
        events.publishEvent(new UserCreatedEvent(userId, locale));
        return userId;
    }

    @Transactional(readOnly = true)
    public Profile profile(UUID userId) {
        return credentials.findByUserId(userId).stream()
                .max(Comparator.comparing(CredentialEntity::getLastUsedAt))
                .map(c -> new Profile(firstNonNull(c.name(), c.login(), "user"), c.avatarUrl()))
                .orElse(new Profile("user", null));
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

    private static String firstNonNull(String first, String second, String fallback) {
        return first != null ? first : second != null ? second : fallback;
    }

    public record Profile(String displayName, String avatarUrl) {
    }
}
