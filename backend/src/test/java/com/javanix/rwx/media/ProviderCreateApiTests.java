package com.javanix.rwx.media;

import static com.javanix.rwx.testkit.ProviderStubs.json;
import static com.javanix.rwx.testkit.TestKeys.TMDB_KEY;
import static com.github.tomakehurst.wiremock.client.WireMock.anyRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.anyUrl;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.client.WireMock;
import com.javanix.rwx.datasource.internal.provider.Fixtures;
import com.javanix.rwx.datasource.internal.provider.persistence.UserSourceKeyRepository;
import com.javanix.rwx.media.common.MediaUrls;
import com.javanix.rwx.testkit.Api;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestKeys;
import com.javanix.rwx.testkit.TestUsers;
import com.javanix.rwx.testkit.TestUsers.TestUser;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

/**
 * Create from a provider URL over HTTP on real Postgres, providers stubbed by WireMock. The provider cache is shared
 * across the whole test context, so every test that needs a provider call uses ids no other test uses.
 */
@IntegrationTest
@ExtendWith(OutputCaptureExtension.class)
class ProviderCreateApiTests {

    private static final String BOOKS = "/api/v1/books";
    private static final String MOVIES = "/api/v1/movies";
    private static final String HOBBIT = "OL27482W";

    @Autowired Api api;
    @Autowired TestUsers users;
    @Autowired WireMockServer provider;
    @Autowired UserSourceKeyRepository keys;

    @BeforeEach
    void resetProvider() {
        provider.resetAll();
    }

    private Api.Res post(TestUser user, String path, UUID id, String url) {
        return api.as(user).postItem(path, id, url);
    }

    private static String freshWork() {
        return "OL" + ThreadLocalRandom.current().nextLong(100_000_000L, 999_999_999L) + "W";
    }

    private static String freshTmdbId() {
        return Long.toString(ThreadLocalRandom.current().nextLong(100_000_000L, 999_999_999L));
    }

    private static String olUrl(String work) {
        return "https://openlibrary.org/works/" + work;
    }

    /** A work with the Hobbit's content under a new id; every work therefore shares the Hobbit's ISBN. */
    private String work(String id, int delayMillis) {
        json(provider, "/works/" + id + ".json", 200, Fixtures.read("open_library/work-" + HOBBIT + ".json"), delayMillis);
        json(provider, "/search.json", 200, Fixtures.read("open_library/lookup-" + HOBBIT + ".json").replace(HOBBIT, id),
                delayMillis);
        return id;
    }

    private String work() {
        return work(freshWork(), 0);
    }

    /** Stubs the lookup per work, so concurrent works do not overwrite each other. */
    private void tmdb(String id) {
        json(provider, "/3/configuration", 200, Fixtures.read("tmdb/synthetic/configuration.json"));
        json(provider, "/3/movie/" + id, 200, Fixtures.read("tmdb/synthetic/movie-603.json"));
        json(provider, "/3/tv/" + id, 200, Fixtures.read("tmdb/synthetic/tv-1396.json"));
    }

    private TestUser userWithKey() {
        return TestKeys.userWithTmdbKey(users, keys);
    }

    private int requests() {
        return provider.getAllServeEvents().size();
    }

    @Test
    void aBookUrlStoresTheProviderItemUnderTheCanonicalLink() {
        var work = work();
        var user = users.create();

        var res = post(user, BOOKS, UUID.randomUUID(), "http://openlibrary.org/works/" + work + "/The_Hobbit?edition=x#top")
                .expect(201);

        assertThat(res.<String>json("$.source")).isEqualTo("open_library");
        assertThat(res.<String>json("$.externalLink")).isEqualTo(olUrl(work));
        assertThat(res.<String>json("$.title")).isEqualTo("The Hobbit");
        assertThat(res.<String>json("$.author")).isEqualTo("J.R.R. Tolkien");
        assertThat(res.<Integer>json("$.year")).isEqualTo(1937);
        assertThat(res.<Object>json("$.rating")).isNotNull();
        assertThat(res.<String>json("$.description")).startsWith("The Hobbit is a tale");
        assertThat(res.<String>json("$.coverUrl")).startsWith("https://");
        assertThat(res.<String>json("$.isbn")).matches("[0-9X]{10,13}");
        assertThat(res.<String>json("$.status")).isEqualTo("planned");
        assertThat(res.<Boolean>json("$.isFavorite")).isFalse();
    }

    @Test
    void aMovieAndATvUrlWithTheSameNumberAreTwoItems() {
        var n = freshTmdbId();
        tmdb(n);
        var user = userWithKey();

        var movie = post(user, MOVIES, UUID.randomUUID(), "https://www.themoviedb.org/movie/" + n + "-the-matrix?language=ru")
                .expect(201);
        var tv = post(user, MOVIES, UUID.randomUUID(), "http://www.themoviedb.org/tv/" + n + "/seasons").expect(201);

        assertThat(movie.<String>json("$.externalLink")).isEqualTo("https://www.themoviedb.org/movie/" + n);
        assertThat(movie.<String>json("$.type")).isEqualTo("movie");
        assertThat(movie.<Object>json("$.seasonCount")).isNull();
        assertThat(movie.<String>json("$.source")).isEqualTo("tmdb");
        assertThat(tv.<String>json("$.externalLink")).isEqualTo("https://www.themoviedb.org/tv/" + n);
        assertThat(tv.<String>json("$.type")).isEqualTo("tv");
        assertThat(tv.<Integer>json("$.seasonCount")).isEqualTo(5);
        assertThat(tv.<String>json("$.tvStatus")).isEqualTo("ended");
        assertThat(tv.<String>json("$.status")).isEqualTo("planned");
        assertThat(api.as(user).get(MOVIES).<List<?>>json("$")).hasSize(2);
    }

    @Test
    void aRePostOfTheSameIdIsAnswered200WithoutAnyProviderCallWhateverTheUrl() {
        var user = userWithKey();
        var id = UUID.randomUUID();
        var work = work();
        post(user, BOOKS, id, olUrl(work)).expect(201);
        var before = requests();

        var again = post(user, BOOKS, id, olUrl(work)).expect(200);
        post(user, BOOKS, id, olUrl(work())).expect(200);

        assertThat(again.<String>json("$.externalLink")).isEqualTo(olUrl(work));
        // work() only stubs; nothing was requested by the re-POSTs
        assertThat(requests()).isEqualTo(before);
    }

    @Test
    void theSameWorkInAnotherUrlFormUnderANewIdIsADuplicateWithoutAProviderCall() {
        var user = users.create();
        var work = work();
        var first = UUID.randomUUID();
        post(user, BOOKS, first, olUrl(work)).expect(201);
        var before = requests();

        var res = post(user, BOOKS, UUID.randomUUID(), "http://openlibrary.org/works/" + work + "/Slug?x=1")
                .expectProblem(409, "duplicate");

        assertThat(res.<String>json("$.existingId")).isEqualTo(first.toString());
        assertThat(requests()).isEqualTo(before);
    }

    @Test
    void anIsbnHeldUnderAnotherWorkIsADuplicateAfterTheResolve() {
        var user = users.create();
        var first = UUID.randomUUID();
        post(user, BOOKS, first, olUrl(work())).expect(201);
        var other = work();

        var res = post(user, BOOKS, UUID.randomUUID(), olUrl(other)).expectProblem(409, "duplicate");

        assertThat(res.<String>json("$.existingId")).isEqualTo(first.toString());
        provider.verify(anyRequestedFor(urlPathEqualTo("/works/" + other + ".json")));
        assertThat(api.as(user).get(BOOKS).<List<?>>json("$")).hasSize(1);
    }

    @Test
    void twoConcurrentPostsOfTheSameItemGiveOneCreatedAndOneDuplicate() throws Exception {
        var user = users.create();
        var work = work(freshWork(), 300);

        var codes = concurrently(() -> post(user, BOOKS, UUID.randomUUID(), olUrl(work)).raw().getStatus(),
                () -> post(user, BOOKS, UUID.randomUUID(), olUrl(work)).raw().getStatus());

        assertThat(codes).containsExactlyInAnyOrder(201, 409);
        assertThat(api.as(user).get(BOOKS).<List<?>>json("$")).hasSize(1);
    }

    @Test
    void twoConcurrentPostsOfTheSameIdGiveOneCreatedAndOneOk() throws Exception {
        var user = users.create();
        var work = work(freshWork(), 300);
        var id = UUID.randomUUID();

        var codes = concurrently(() -> post(user, BOOKS, id, olUrl(work)).raw().getStatus(),
                () -> post(user, BOOKS, id, olUrl(work)).raw().getStatus());

        assertThat(codes).containsExactlyInAnyOrder(201, 200);
        assertThat(api.as(user).get(BOOKS).<List<?>>json("$")).hasSize(1);
    }

    @Test
    void theUserLockIsNotHeldWhileTheProviderIsSlow() throws Exception {
        var user = users.create();
        var kept = UUID.randomUUID();
        post(user, BOOKS, kept, MediaUrls.draft("Dune")).expect(201);
        var slow = work(freshWork(), 600);

        var pending = CompletableFuture.supplyAsync(() -> post(user, BOOKS, UUID.randomUUID(), olUrl(slow)).raw().getStatus());
        Thread.sleep(200); // the create is now waiting for the provider
        api.as(user).patch(BOOKS + "/" + kept, "{\"isFavorite\":true}").expect(200);

        assertThat(pending).as("the slow create is still running").isNotDone();
        assertThat(pending.get()).isEqualTo(201);
    }

    @Test
    void providerFailuresLeaveNoRowAndTheSameIdSucceedsOnRetry() {
        var user = userWithKey();
        var id = UUID.randomUUID();
        var work = freshWork();

        json(provider, "/works/" + work + ".json", 500, "{}");
        json(provider, "/search.json", 500, "{}");
        post(user, BOOKS, id, olUrl(work)).expectProblem(502, "provider_error");
        json(provider, "/works/" + work + ".json", 429, "{}");
        var limited = post(user, BOOKS, id, olUrl(work)).expectProblem(503, "provider_rate_limited");
        assertThat(limited.header("Retry-After")).isNotNull();
        json(provider, "/works/" + work + ".json", 404, "{}");
        json(provider, "/search.json", 200, "{\"numFound\":0,\"docs\":[]}");
        post(user, BOOKS, id, olUrl(work)).expectProblem(422, "source_not_found");
        assertThat(api.as(user).get(BOOKS).<List<?>>json("$")).isEmpty();

        work(work, 0);
        post(user, BOOKS, id, olUrl(work)).expect(201);
    }

    @Test
    void aProviderTimeoutIs504AndStoresNothing() {
        var user = users.create();
        var work = work(freshWork(), 1500);

        post(user, BOOKS, UUID.randomUUID(), olUrl(work)).expectProblem(504, "provider_timeout");

        assertThat(api.as(user).get(BOOKS).<List<?>>json("$")).isEmpty();
    }

    @Test
    void tmdbNeedsTheUsersKeyButAnExistingIdDoesNot() {
        var n = freshTmdbId();
        tmdb(n);
        var user = userWithKey();
        var id = UUID.randomUUID();
        post(user, MOVIES, id, "https://www.themoviedb.org/movie/" + n).expect(201);
        keys.deleteAll(keys.findByIdUserId(user.id()));

        post(user, MOVIES, id, "https://www.themoviedb.org/movie/" + n).expect(200);
        var res = post(user, MOVIES, UUID.randomUUID(), "https://www.themoviedb.org/tv/" + n)
                .expectProblem(409, "source_key_missing");
        assertThat(res.<String>json("$.source")).isEqualTo("tmdb");
        assertThat(api.as(user).get(MOVIES).<List<?>>json("$")).hasSize(1);
    }

    @Test
    void aRejectedTmdbKeyIs409AndTheSameIdWorksOnceFixed() {
        var n = freshTmdbId();
        tmdb(n);
        json(provider, "/3/movie/" + n, 401, Fixtures.read("tmdb/synthetic/error-401.json"));
        var user = userWithKey();
        var id = UUID.randomUUID();

        var res = post(user, MOVIES, id, "https://www.themoviedb.org/movie/" + n).expectProblem(409, "source_key_invalid");

        assertThat(res.<String>json("$.source")).isEqualTo("tmdb");
        assertThat(api.as(user).get(MOVIES).<List<?>>json("$")).isEmpty();
        tmdb(n);
        post(user, MOVIES, id, "https://www.themoviedb.org/movie/" + n).expect(201);
    }

    @Test
    void aWrongTypeOrUnknownUrlIs400WithoutAnyRequestAndWithoutSpendingATokenOfTheLimiter() {
        var user = userWithKey();
        for (var i = 0; i < 30; i++) {
            post(user, BOOKS, UUID.randomUUID(), "https://www.themoviedb.org/movie/603").expectProblem(400, "validation");
            post(user, MOVIES, UUID.randomUUID(), olUrl(HOBBIT)).expectProblem(400, "validation");
        }
        post(user, BOOKS, UUID.randomUUID(), "https://example.com/book/1").expectProblem(400, "validation");

        provider.verify(0, anyRequestedFor(anyUrl()));
        post(user, BOOKS, UUID.randomUUID(), olUrl(work())).expect(201);
    }

    @Test
    void theDetailsLimiterIsPerUserAndAnsweredWith429() {
        var user = users.create();
        for (var i = 0; i < 20; i++) {
            var status = post(user, BOOKS, UUID.randomUUID(), olUrl(work())).raw().getStatus();
            assertThat(status).isIn(201, 409);
        }

        var res = post(user, BOOKS, UUID.randomUUID(), olUrl(work())).expectProblem(429, "rate_limited");

        assertThat(res.header("Retry-After")).isNotNull();
        post(users.create(), BOOKS, UUID.randomUUID(), olUrl(work())).expect(201);
    }

    @Test
    void extraFieldsInTheBodyAreIgnoredAndADraftLinkStillTakesTheDraftPath() {
        var user = users.create();
        var work = work();
        var res = api.as(user).send(HttpMethod.POST, BOOKS, "{\"id\":\"" + UUID.randomUUID() + "\",\"sourceUrl\":\""
                + olUrl(work) + "\",\"title\":\"Hacked\",\"source\":\"draft\",\"isbn\":\"1\"}").expect(201);
        assertThat(res.<String>json("$.title")).isEqualTo("The Hobbit");
        assertThat(res.<String>json("$.source")).isEqualTo("open_library");

        var before = requests();
        post(user, BOOKS, UUID.randomUUID(), MediaUrls.draft("Dune")).expect(201);
        post(user, MOVIES, UUID.randomUUID(), MediaUrls.draft("Solaris")).expect(201);
        assertThat(requests()).isEqualTo(before);
    }

    @Test
    void aSourceUrlHeldByAnotherUserIsMyOwnNewRowAndTheirRowIsUntouched() {
        var f = users.two();
        var work = work();
        var mine = UUID.randomUUID();
        var theirs = UUID.randomUUID();
        post(f.a(), BOOKS, theirs, olUrl(work)).expect(201);
        api.as(f.a()).patch(BOOKS + "/" + theirs, "{\"isFavorite\":true}").expect(200);

        var res = post(f.b(), BOOKS, mine, olUrl(work)).expect(201);

        assertThat(res.<String>json("$.userId")).isEqualTo(f.b().id().toString());
        assertThat(res.<String>json("$.externalLink")).isEqualTo(olUrl(work));
        var kept = api.as(f.a()).get(BOOKS + "/" + theirs).expect(200);
        assertThat(kept.<Boolean>json("$.isFavorite")).isTrue();
        assertThat(kept.<Integer>json("$.version")).isEqualTo(2);
        assertThat(api.as(f.a()).get(BOOKS).<List<String>>json("$[*].id")).containsExactly(theirs.toString());
        assertThat(api.as(f.b()).get(BOOKS).<List<String>>json("$[*].id")).containsExactly(mine.toString());
    }

    @Test
    void aTmdbKeyBelongsToItsUserWhenCreating() {
        var n = freshTmdbId();
        tmdb(n);
        var withKey = userWithKey();
        var without = users.create();
        post(withKey, MOVIES, UUID.randomUUID(), "https://www.themoviedb.org/movie/" + n).expect(201);

        var res = post(without, MOVIES, UUID.randomUUID(), "https://www.themoviedb.org/movie/" + n)
                .expectProblem(409, "source_key_missing");

        assertThat(res.<String>json("$.source")).isEqualTo("tmdb");
        assertThat(api.as(without).get(MOVIES).<List<?>>json("$")).isEmpty();
    }

    @Test
    void aTombstonedIdOfAnotherUserIsMyOwnNewRow() {
        var f = users.two();
        var id = UUID.randomUUID();
        var work = work();
        post(f.a(), BOOKS, id, olUrl(work)).expect(201);
        api.as(f.a()).delete(BOOKS + "/" + id).expect(204);
        post(f.a(), BOOKS, id, olUrl(work)).expectProblem(410, "gone");

        var res = post(f.b(), BOOKS, id, olUrl(work)).expect(201);

        assertThat(res.<String>json("$.userId")).isEqualTo(f.b().id().toString());
        assertThat(api.as(f.b()).get(BOOKS + "/" + id).expect(200).<String>json("$.externalLink")).isEqualTo(olUrl(work));
        post(f.a(), BOOKS, id, olUrl(work)).expectProblem(410, "gone");
    }

    @Test
    void noInfoLogLineContainsTheKeyTheQueryOrTheProviderBody(CapturedOutput output) {
        var n = freshTmdbId();
        tmdb(n);
        var work = work();
        var user = userWithKey();

        post(user, MOVIES, UUID.randomUUID(), "https://www.themoviedb.org/movie/" + n + "-zq-secret-slug?q=zq-secret-query")
                .expect(201);
        post(user, BOOKS, UUID.randomUUID(), olUrl(work)).expect(201);

        assertThat(output.getAll()).doesNotContain(TMDB_KEY, "zq-secret", "The Hobbit is a tale", "Tolkien", "The Matrix");
    }

    @SafeVarargs
    private static List<Integer> concurrently(java.util.function.Supplier<Integer>... calls) throws Exception {
        var start = new CountDownLatch(1);
        var futures = java.util.Arrays.stream(calls).map(call -> CompletableFuture.supplyAsync(() -> {
            try {
                start.await();
            } catch (InterruptedException e) {
                throw new IllegalStateException(e);
            }
            return call.get();
        })).toList();
        start.countDown();
        return futures.stream().map(CompletableFuture::join).toList();
    }
}
