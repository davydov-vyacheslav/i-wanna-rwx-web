package com.javanix.rwx.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.javanix.rwx.identity.internal.persistence.CredentialRepository;
import com.javanix.rwx.identity.internal.persistence.UserRepository;
import com.javanix.rwx.identity.internal.persistence.UserSettingsRepository;
import com.javanix.rwx.identity.security.UserPrincipal;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

@IntegrationTest
class CurrentUserProviderTests {

    @Autowired CurrentUserProvider provider;
    @Autowired CredentialRepository credentials;
    @Autowired TestUsers users;
    @Autowired UserRepository userRepository;
    @Autowired UserSettingsRepository settings;

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void returnsPrincipalIdAndStoredTimezoneAndSeesChangesImmediately() {
        var f = users.two();
        signIn(f.a().id());
        assertThat(provider.current()).isEqualTo(new CurrentUser(f.a().id(), ZoneId.of("Europe/Berlin")));
        signIn(f.b().id());
        assertThat(provider.current()).isEqualTo(new CurrentUser(f.b().id(), ZoneId.of("Asia/Tokyo")));

        var row = settings.findByUserId(f.b().id()).orElseThrow();
        row.update("America/Denver", row.getLocale(), Instant.now());
        settings.save(row);
        assertThat(provider.current().timezone()).isEqualTo(ZoneId.of("America/Denver"));
    }

    @Test
    void noOrAnonymousAuthenticationIsRejected() {
        assertThatThrownBy(provider::current).isInstanceOf(NotAuthenticatedException.class);
        SecurityContextHolder.getContext().setAuthentication(new AnonymousAuthenticationToken("k", "anonymousUser",
                List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS"))));
        assertThatThrownBy(provider::current).isInstanceOf(NotAuthenticatedException.class);
    }

    @Test
    void sessionOfDeletedOrDisabledUserIsRejected() {
        var deleted = users.create().id();
        var disabled = users.create().id();
        userRepository.deleteById(deleted);
        users.setDisabled(disabled, true);

        for (var id : List.of(deleted, disabled)) {
            signIn(id);
            assertThatThrownBy(provider::current).isInstanceOf(NotAuthenticatedException.class);
        }
    }

    @Test
    void credentialFinderIsScopedToTheUser() {
        var f = users.two();
        for (var user : List.of(f.a(), f.b())) {
            assertThat(credentials.findByUserId(user.id())).hasSize(1).allMatch(c -> c.getUserId().equals(user.id()))
                    .first().satisfies(c -> assertThat(c.getData()).containsEntry("login", "gh-" + user.id()));
        }
    }

    private static void signIn(UUID id) {
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                new UserPrincipal(id), null, List.of(new SimpleGrantedAuthority("ROLE_USER"))));
    }
}
