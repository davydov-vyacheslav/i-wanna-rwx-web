package com.javanix.rwx.datasource.internal.provider;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.client.WireMock;
import com.javanix.rwx.api.model.ResourceType;
import com.javanix.rwx.common.NotFoundException;
import com.javanix.rwx.datasource.CatalogException.RateLimited;
import com.javanix.rwx.datasource.internal.provider.UserDataSourceService.SourceState;
import com.javanix.rwx.datasource.internal.provider.persistence.UserSourceKeyEntity;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * The service on real Postgres with the application's registry (Open Library for books, TMDb for movies, stubbed by
 * WireMock). The fallbacks between several sources are in {@code UserDataSourceDerivationTests}.
 */
@IntegrationTest
class UserDataSourceServiceTests {

    private static final String KEY_A = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJhIn0.service_fixture_token_a_0123456789";
    private static final String KEY_B = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJiIn0.service_fixture_token_b_0123456789";

    @Autowired UserDataSourceService service;
    @Autowired WireMockServer provider;
    @Autowired JdbcClient jdbc;
    @Autowired TestUsers users;

    @BeforeEach
    void tmdbAcceptsKeys() {
        provider.resetAll();
        provider.stubFor(WireMock.get(urlPathEqualTo("/3/authentication")).willReturn(aResponse().withStatus(200)
                .withHeader("Content-Type", "application/json").withBody("{\"success\":true}")));
    }

    private static SourceState movie(Map<ResourceType, List<SourceState>> lists) {
        return lists.get(ResourceType.MOVIE).getFirst();
    }

    private int keyRows(UUID user) {
        return jdbc.sql("select count(*) from user_source_keys where user_id = ?").param(user).query(Integer.class).single();
    }

    private List<String> defaultRows(UUID user) {
        return jdbc.sql("select resource_type || '/' || source from user_default_sources where user_id = ? "
                + "order by resource_type").param(user).query(String.class).list();
    }

    @Test
    void signUpStoresTheConfiguredDefaultOfEachType() {
        var user = users.create().id();

        assertThat(defaultRows(user)).containsExactly("book/open_library", "movie/tmdb");
        assertThat(keyRows(user)).isZero();
        var lists = service.list(user);
        assertThat(lists.get(ResourceType.BOOK).getFirst().isDefault()).isTrue();
        assertThat(movie(lists).isDefault()).isTrue();
        assertThat(service.dataSources(user)).extracting(d -> d.getResourceType() + "/" + d.getSource())
                .containsExactly("book/open_library", "movie/tmdb");
    }

    @Test
    void theDefaultSurvivesTheDeletionOfItsKeyAndTheSourceBecomesUnavailable() {
        var user = users.create().id();
        service.setDefault(user, ResourceType.MOVIE, "tmdb");
        assertThat(movie(service.saveKey(user, ResourceType.MOVIE, "tmdb", KEY_A)).available()).isTrue();

        var deleted = movie(service.deleteKey(user, ResourceType.MOVIE, "tmdb"));

        assertThat(deleted.isDefault()).isTrue();
        assertThat(deleted.available()).isFalse();
        assertThat(deleted.tokenSaved()).isFalse();
        assertThat(defaultRows(user)).containsExactly("book/open_library", "movie/tmdb");
        assertThat(keyRows(user)).isZero();
        service.deleteKey(user, ResourceType.MOVIE, "tmdb"); // idempotent
        assertThat(movie(service.saveKey(user, ResourceType.MOVIE, "tmdb", KEY_B)).available()).as("saving restores it").isTrue();
    }

    @Test
    void saveReplacesTheKey() {
        var user = users.create().id();
        service.saveKey(user, ResourceType.MOVIE, "tmdb", KEY_A);

        service.saveKey(user, ResourceType.MOVIE, "tmdb", KEY_B);

        assertThat(keyRows(user)).isEqualTo(1);
        assertThat(service.keyOf(user, new StubSource(ResourceType.MOVIE, "tmdb", true))).contains(KEY_B);
    }

    @Test
    void anUnregisteredPairAndAKeyOperationOnASourceWithoutAKeyAreNotFound() {
        var user = users.create().id();

        assertThatThrownBy(() -> service.setDefault(user, ResourceType.BOOK, "nope")).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.setDefault(user, ResourceType.MOVIE, "open_library")).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.saveKey(user, ResourceType.BOOK, "open_library", KEY_A)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.deleteKey(user, ResourceType.BOOK, "open_library")).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.saveKey(user, ResourceType.BOOK, "tmdb", KEY_A)).isInstanceOf(NotFoundException.class);
        assertThat(defaultRows(user)).containsExactly("book/open_library", "movie/tmdb");
        assertThat(keyRows(user)).isZero();
    }

    @Test
    void oneUsersOperationsNeverTouchAnotherUsersRows() {
        var f = users.two();
        var a = f.a().id();
        var b = f.b().id();
        var tmdb = new StubSource(ResourceType.MOVIE, "tmdb", true);
        service.saveKey(a, ResourceType.MOVIE, "tmdb", KEY_A);

        assertThat(movie(service.list(b)).tokenSaved()).isFalse();
        assertThat(service.keyOf(b, tmdb)).isEmpty();
        service.deleteKey(b, ResourceType.MOVIE, "tmdb");
        service.setDefault(b, ResourceType.BOOK, "open_library");
        service.saveKey(b, ResourceType.MOVIE, "tmdb", KEY_B);
        service.deleteKey(b, ResourceType.MOVIE, "tmdb");

        assertThat(service.keyOf(a, tmdb)).contains(KEY_A);
        assertThat(movie(service.list(a)).tokenSaved()).isTrue();
        assertThat(keyRows(b)).isZero();
        assertThat(service.dataSources(a)).hasSize(2);
    }

    @Test
    void theKeyIsNotPartOfTheEntityText() {
        assertThat(new UserSourceKeyEntity(UUID.randomUUID(), "tmdb", KEY_A).toString()).doesNotContain(KEY_A);
    }

    /**
     * Saves, deletes and default changes of one user in parallel never fail (our own save limit aside) and leave one
     * default per type. The one race the primary key can show is two first saves of a key; the loser is ignored.
     */
    @Test
    @Timeout(120)
    void parallelOperationsOfOneUserNeverFailAndLeaveAConsistentState() throws Exception {
        var user = users.create().id();
        var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(12)) {
            var futures = new ArrayList<CompletableFuture<Void>>();
            for (var i = 0; i < 60; i++) {
                var n = i;
                futures.add(CompletableFuture.runAsync(() -> {
                    try {
                        start.await();
                        switch (n % 4) {
                            case 0 -> service.saveKey(user, ResourceType.MOVIE, "tmdb", n % 8 == 0 ? KEY_A : KEY_B);
                            case 1 -> service.deleteKey(user, ResourceType.MOVIE, "tmdb");
                            case 2 -> service.setDefault(user, ResourceType.MOVIE, "tmdb");
                            default -> service.setDefault(user, ResourceType.BOOK, "open_library");
                        }
                    } catch (RateLimited e) {
                        // the per-user save limit (5 a minute) is an answer, not a failure
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                }, pool));
            }
            start.countDown();
            for (var f : futures) {
                f.get(90, TimeUnit.SECONDS);
            }
        }

        assertThat(defaultRows(user)).containsExactly("book/open_library", "movie/tmdb");
        assertThat(keyRows(user)).isLessThanOrEqualTo(1);
        var lists = service.list(user);
        assertThat(lists.get(ResourceType.BOOK)).filteredOn(SourceState::isDefault).hasSize(1);
        assertThat(lists.get(ResourceType.MOVIE)).filteredOn(SourceState::isDefault).hasSize(1);
        assertThat(movie(lists).tokenSaved()).isEqualTo(keyRows(user) == 1);
    }
}
