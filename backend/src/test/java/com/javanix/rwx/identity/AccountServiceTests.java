package com.javanix.rwx.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.javanix.rwx.identity.internal.AccountService;
import com.javanix.rwx.identity.internal.ExternalProfile;
import com.javanix.rwx.identity.internal.exception.AccountDisabledException;
import com.javanix.rwx.identity.internal.persistence.CredentialRepository;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

@IntegrationTest
class AccountServiceTests {

    private static final AtomicLong IDS = new AtomicLong(System.nanoTime());

    @Autowired AccountService accounts;
    @Autowired CredentialRepository credentials;
    @Autowired TestUsers users;
    @Autowired JdbcClient jdbc;

    @Test
    void firstLoginCreatesUserAndCredential() {
        var ext = newExternalId();
        var userId = login(profile(ext, "alice", "Alice", "http://a/1.png"));

        assertThat(credentials.findByUserId(userId)).singleElement()
                .satisfies(c -> assertThat(c.getType() + "|" + c.getExternalId()).isEqualTo("github|" + ext));
    }

    @Test
    void firstLoginStoresTheConfiguredDefaultSourceOfEachType() {
        var userId = login(profile(newExternalId(), "dora", "Dora", null));

        assertThat(jdbc.sql("select resource_type || '/' || source from user_default_sources where user_id = ? "
                + "order by resource_type").param(userId).query(String.class).list())
                .containsExactly("book/open_library", "movie/tmdb");
        assertThat(jdbc.sql("select count(*) from user_source_keys where user_id = ?").param(userId)
                .query(Integer.class).single()).isZero();
    }

    @Test
    void aSecondLoginAddsNoRows() {
        var ext = newExternalId();
        var userId = login(profile(ext, "eve", "Eve", null));
        login(profile(ext, "eve", "Eve", null));

        assertThat(jdbc.sql("select count(*) from user_default_sources where user_id = ?").param(userId)
                .query(Integer.class).single()).isEqualTo(2);
    }

    @Test
    void renamedLoginKeepsUserAndRefreshesMetadata() {
        var ext = newExternalId();
        var userId = login(profile(ext, "old-name", "Old", "http://a/1.png"));
        users.backdateLastUsed(userId);
        var before = lastUsed(userId);

        assertThat(login(profile(ext, "new-name", "New", "http://a/2.png"))).isEqualTo(userId);

        assertThat(credentials.findByUserId(userId)).singleElement().satisfies(c ->
                assertThat(c.login() + "|" + c.name() + "|" + c.avatarUrl()).isEqualTo("new-name|New|http://a/2.png"));
        assertThat(lastUsed(userId)).isAfter(before);
    }

    @Test
    void concurrentFirstLoginsOfOneGithubIdCreateOneUser() {
        var ext = newExternalId();
        var pool = Executors.newFixedThreadPool(8);
        try {
            var ids = IntStream.range(0, 8)
                    .mapToObj(i -> pool.submit(() -> login(profile(ext, "racer", "Racer", null))))
                    .toList().stream().map(f -> {
                        try {
                            return f.get();
                        } catch (Exception e) {
                            throw new AssertionError(e);
                        }
                    }).toList();

            assertThat(ids).containsOnly(ids.getFirst());
            assertThat(credentials.findByTypeAndExternalId("github", ext)).isPresent();
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void disabledUserIsRefused() {
        var ext = newExternalId();
        var userId = login(profile(ext, "bob", null, null));
        users.setDisabled(userId, true);

        assertThatThrownBy(() -> login(profile(ext, "bob", null, null)))
                .isInstanceOf(AccountDisabledException.class);
    }

    @Test
    void displayNameIsTheGithubNameElseTheLogin() {
        var named = login(profile(newExternalId(), "octo", "Octo Cat", null));
        var unnamed = login(profile(newExternalId(), "ghost", null, null));

        assertThat(accounts.profile(named).displayName()).isEqualTo("Octo Cat");
        assertThat(accounts.profile(unnamed).displayName()).isEqualTo("ghost");
    }

    @Test
    void firstLoginFixesTheLocaleFromTheSignUpLocaleAndLaterLoginsDoNotChangeIt() {
        var ext = newExternalId();
        var userId = accounts.loginOrCreate(profile(ext, "ivan", null, null), "ru");
        accounts.loginOrCreate(profile(ext, "ivan", null, null), "uk");

        assertThat(storedLocale(userId)).isEqualTo("ru");
    }

    private String storedLocale(UUID userId) {
        return jdbc.sql("select locale from user_settings where user_id = ?").param(userId).query(String.class).single();
    }

    private UUID login(ExternalProfile profile) {
        return accounts.loginOrCreate(profile, "en");
    }

    private static String newExternalId() {
        return Long.toString(IDS.incrementAndGet());
    }

    private static ExternalProfile profile(String ext, String login, String name, String avatar) {
        return new ExternalProfile("github", ext, login, name, avatar);
    }

    private Instant lastUsed(UUID userId) {
        return credentials.findByUserId(userId).getFirst().getLastUsedAt();
    }
}
