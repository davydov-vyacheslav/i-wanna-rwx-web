package com.javanix.rwx.datasource.internal.web;

import static com.javanix.rwx.testkit.ProviderStubs.json;
import static com.github.tomakehurst.wiremock.client.WireMock.anyUrl;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.client.WireMock;
import com.javanix.rwx.datasource.internal.provider.Fixtures;
import com.javanix.rwx.datasource.internal.provider.persistence.UserSourceKeyRepository;
import com.javanix.rwx.testkit.Api;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestKeys;
import com.javanix.rwx.testkit.TestUsers;
import com.javanix.rwx.testkit.TestUsers.TestUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * {@code GET /api/v1/search/books|movies/details} over HTTP on real Postgres, providers stubbed by WireMock. The
 * provider result cache is shared across tests (keyed by item), so a test that needs a fresh provider call uses an id
 * no other test uses.
 */
@IntegrationTest
class SearchDetailsApiTests {

    private static final String BOOKS = "/api/v1/search/books/details";
    private static final String MOVIES = "/api/v1/search/movies/details";
    private static final String HOBBIT = "OL27482W";

    @Autowired Api api;
    @Autowired TestUsers users;
    @Autowired WireMockServer provider;
    @Autowired UserSourceKeyRepository keys;

    @BeforeEach
    void resetProvider() {
        provider.resetAll();
    }

    private Api.Res details(TestUser user, String path, String url) {
        return api.as(user).get(path + "?sourceUrl={u}", url);
    }

    private void openLibrary(String id) {
        json(provider, "/works/" + id + ".json", 200, Fixtures.read("open_library/work-" + id + ".json"));
        json(provider, "/search.json", 200, Fixtures.read("open_library/lookup-" + id + ".json"));
    }

    private TestUser userWithTmdbKey() {
        return TestKeys.userWithTmdbKey(users, keys);
    }

    private void tmdb() {
        json(provider, "/3/configuration", 200, Fixtures.read("tmdb/synthetic/configuration.json"));
        json(provider, "/3/movie/603", 200, Fixtures.read("tmdb/synthetic/movie-603.json"));
        json(provider, "/3/tv/1396", 200, Fixtures.read("tmdb/synthetic/tv-1396.json"));
    }

    @Test
    void aBookUrlWithSlugAndQueryGivesTheDetailsWithTheCanonicalLink() {
        openLibrary(HOBBIT);

        var res = details(users.create(), BOOKS, "http://openlibrary.org/works/" + HOBBIT + "/The_Hobbit?edition=x#top")
                .expect(200);

        assertThat(res.<String>json("$.externalLink")).isEqualTo("https://openlibrary.org/works/" + HOBBIT);
        assertThat(res.<String>json("$.title")).isEqualTo("The Hobbit");
        assertThat(res.<String>json("$.author")).isEqualTo("J.R.R. Tolkien");
        assertThat(res.<Integer>json("$.year")).isEqualTo(1937);
        assertThat(res.<String>json("$.isbn")).as("as the provider gives it").isEqualTo("9788422615866");
    }

    @Test
    void aMovieAndATvSeriesWithTheSameNumberAreTwoDifferentDetails() {
        tmdb();
        var user = userWithTmdbKey();

        var movie = details(user, MOVIES, "https://www.themoviedb.org/movie/603-the-matrix").expect(200);
        var tv = details(userWithTmdbKey(), MOVIES, "https://www.themoviedb.org/tv/1396").expect(200);

        assertThat(movie.<String>json("$.type")).isEqualTo("movie");
        assertThat(movie.<String>json("$.externalLink")).isEqualTo("https://www.themoviedb.org/movie/603");
        assertThat(movie.<Object>json("$.seasonCount")).isNull();
        assertThat(tv.<String>json("$.type")).isEqualTo("tv");
        assertThat(tv.<String>json("$.externalLink")).isEqualTo("https://www.themoviedb.org/tv/1396");
        assertThat(tv.<String>json("$.title")).isEqualTo("Breaking Bad");
        assertThat(tv.<Integer>json("$.seasonCount")).isEqualTo(5);
        assertThat(tv.<String>json("$.tvStatus")).isEqualTo("ended");
    }

    @Test
    void aDraftOrForeignOrUnknownLinkIsUnsupportedWithoutAnyProviderCall() {
        var user = userWithTmdbKey();

        for (var url : new String[] {"https://www.google.com/search?q=dune", "https://openlibrary.org/books/OL1M",
                "https://example.com/x"}) {
            var res = details(user, BOOKS, url).expectProblem(400, "validation");
            assertThat(res.<String>json("$.errors[0].field")).isEqualTo("sourceUrl");
        }
        details(user, MOVIES, "https://openlibrary.org/works/" + HOBBIT).expectProblem(400, "validation");
        details(user, MOVIES, "https://www.google.com/search?q=matrix").expectProblem(400, "validation");
        provider.verify(0, WireMock.anyRequestedFor(anyUrl()));
    }

    @Test
    void aNonHttpOrTooLongOrEmptyUrlIsRejected() {
        var user = users.create();

        for (var url : new String[] {"ftp://openlibrary.org/works/OL1W", "javascript:alert(1)", "not a url", "",
                "https://openlibrary.org/works/OL1W?" + "x".repeat(4100)}) {
            details(user, BOOKS, url).expectProblem(400, "validation");
        }
        api.as(user).get(BOOKS).expectProblem(400, null);
        provider.verify(0, WireMock.anyRequestedFor(anyUrl()));
    }

    @Test
    void aProviderNotFoundIsNotFoundHere() {
        json(provider, "/works/OL99999998W.json", 404, "{}");
        json(provider, "/search.json", 200, "{\"numFound\":0,\"docs\":[]}");

        details(users.create(), BOOKS, "https://openlibrary.org/works/OL99999998W").expectProblem(404, "not_found");
    }

    @Test
    void aMovieWithoutAKeyIsConflictAndOtherFailuresKeepTheirCodes() {
        var user = users.create();
        var res = details(user, MOVIES, "https://www.themoviedb.org/movie/603").expectProblem(409, "source_key_missing");
        assertThat(res.<String>json("$.source")).isEqualTo("tmdb");

        json(provider, "/works/OL99999997W.json", 500, "{}");
        json(provider, "/search.json", 500, "{}");
        details(user, BOOKS, "https://openlibrary.org/works/OL99999997W").expectProblem(502, "provider_error");
    }

    @Test
    void detailsNeedASession() {
        api.get(BOOKS + "?sourceUrl=https://openlibrary.org/works/OL1W").expectProblem(401, "unauthorized");
        api.get(MOVIES + "?sourceUrl=https://www.themoviedb.org/movie/1").expectProblem(401, "unauthorized");
    }

    @Test
    void theBurstLimitIsPerUserSharedByBothEndpointsAndIdentifySpendsNothing() {
        openLibrary(HOBBIT);
        var user = users.create();
        for (var i = 0; i < 20; i++) {
            details(user, BOOKS, "https://openlibrary.org/works/" + HOBBIT).expect(200);
            details(user, MOVIES, "https://openlibrary.org/works/" + HOBBIT).expectProblem(400, "validation");
        }

        var res = details(user, BOOKS, "https://openlibrary.org/works/" + HOBBIT).expectProblem(429, "rate_limited");

        assertThat(Integer.parseInt(res.header("Retry-After"))).isPositive();
        details(users.create(), BOOKS, "https://openlibrary.org/works/" + HOBBIT).expect(200);
    }

    @Test
    void theSameNormalizedItemIsServedFromTheCacheToAnotherUser() {
        openLibrary("OL893414W");

        var first = details(users.create(), BOOKS, "https://openlibrary.org/works/OL893414W").expect(200);
        var second = details(users.create(), BOOKS, "https://openlibrary.org/works/OL893414W/Dune").expect(200);

        assertThat(second.body()).isEqualTo(first.body());
        provider.verify(1, getRequestedFor(urlPathEqualTo("/works/OL893414W.json")));
    }
}
