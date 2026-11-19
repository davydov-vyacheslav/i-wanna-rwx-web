package com.javanix.rwx.testkit;

import com.javanix.rwx.identity.UserCreatedEvent;
import com.javanix.rwx.identity.internal.ExternalProfile;
import com.javanix.rwx.identity.internal.persistence.CredentialEntity;
import com.javanix.rwx.identity.internal.persistence.CredentialRepository;
import com.javanix.rwx.identity.internal.persistence.UserEntity;
import com.javanix.rwx.identity.internal.persistence.UserRepository;
import com.javanix.rwx.settings.internal.UserSettingsRepository;
import com.javanix.rwx.identity.security.UserPrincipal;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.session.Session;
import org.springframework.session.SessionRepository;

/**
 * Test-only user factory (production cannot log in without GitHub). Writes the user, a github credential,
 * the sign-up defaults (settings, data sources) and a real JDBC session, so requests pass the same filter chain as a browser's.
 */
public class TestUsers {

    private final SessionRepository<?> sessions;
    private final UserRepository users;
    private final CredentialRepository credentials;
    private final UserSettingsRepository settings;
    private final ApplicationEventPublisher events;

    TestUsers(SessionRepository<?> sessions, UserRepository users, CredentialRepository credentials,
            UserSettingsRepository settings, ApplicationEventPublisher events) {
        this.sessions = sessions;
        this.users = users;
        this.credentials = credentials;
        this.settings = settings;
        this.events = events;
    }

    public TestUser create() {
        return create("UTC");
    }

    public TestUser create(String timezone) {
        return create(timezone, "en");
    }

    /** Signs up with the given locale (what identity derives from Accept-Language). */
    public TestUser create(String timezone, String locale) {
        // like a real sign-up: the event gives the user its settings record and data source rows
        var user = createWithoutDefaults();
        events.publishEvent(new UserCreatedEvent(user.id(), locale));
        if (!"UTC".equals(timezone)) {
            var row = settings.findByUserId(user.id()).orElseThrow();
            row.apply(timezone, null, Instant.now());
            settings.save(row);
        }
        return user;
    }

    /** A user with neither a settings record nor data source rows: for tests that bring their own. */
    public TestUser createWithoutDefaults() {
        var id = UUID.randomUUID();
        var now = Instant.now();
        users.save(new UserEntity(id, now));
        credentials.save(new CredentialEntity(UUID.randomUUID(), id,
                new ExternalProfile("github", id.toString(), "gh-" + id, "Name " + id, null), now));
        return sessionFor(id);
    }

    /** Users A (Europe/Berlin) and B (Asia/Tokyo) for isolation tests. */
    public TwoUsers two() {
        return new TwoUsers(create("Europe/Berlin"), create("Asia/Tokyo"));
    }

    /** Another session (device) for an existing user. */
    public TestUser sessionFor(UUID userId) {
        var context = new SecurityContextImpl(UsernamePasswordAuthenticationToken.authenticated(
                new UserPrincipal(userId), null, List.of(new SimpleGrantedAuthority("ROLE_USER"))));
        return new TestUser(userId, save(sessions, context));
    }

    /** Sets the UI locale (en, ru or uk) the way the settings endpoint would. */
    public void setLocale(UUID userId, String locale) {
        var row = settings.findByUserId(userId).orElseThrow();
        row.apply(null, locale, Instant.now());
        settings.save(row);
    }

    // UserEntity has no mutator (production never needs one), hence the reflection.
    public void setDisabled(UUID userId, boolean disabled) {
        var user = users.findById(userId).orElseThrow();
        ReflectionTestUtils.setField(user, "disabledAt", disabled ? Instant.now() : null);
        users.save(user);
    }

    /** Pushes last_used_at of the user's credentials a day back so a later login visibly refreshes it. */
    public void backdateLastUsed(UUID userId) {
        var yesterday = Instant.now().minus(1, ChronoUnit.DAYS);
        for (var c : credentials.findByUserId(userId)) {
            c.refresh(new ExternalProfile(c.getType(), c.getExternalId(), c.login(), c.name(), c.avatarUrl()), yesterday);
            credentials.save(c);
        }
    }

    public record TwoUsers(TestUser a, TestUser b) {
    }

    public record TestUser(UUID id, String sessionId) {

        /** DefaultCookieSerializer base64-encodes the session id. */
        Cookie cookie() {
            return new Cookie("SESSION", Base64.getEncoder().encodeToString(sessionId.getBytes(StandardCharsets.UTF_8)));
        }
    }

    private static <S extends Session> String save(SessionRepository<S> repository, SecurityContextImpl context) {
        S session = repository.createSession();
        session.setAttribute("SPRING_SECURITY_CONTEXT", context);
        repository.save(session);
        return session.getId();
    }
}
