package com.javanix.rwx.datasource.internal.web;

import static com.javanix.rwx.testkit.ProviderStubs.json;
import static com.github.tomakehurst.wiremock.client.WireMock.anyUrl;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.client.WireMock;
import com.github.tomakehurst.wiremock.matching.RequestPatternBuilder;
import com.javanix.rwx.datasource.internal.provider.Fixtures;
import com.javanix.rwx.datasource.internal.provider.persistence.UserSourceKeyRepository;
import com.javanix.rwx.testkit.Api;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestKeys;
import com.javanix.rwx.testkit.TestUsers;
import com.javanix.rwx.testkit.TestUsers.TestUser;
import com.javanix.rwx.testkit.Vectors;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

/**
 * {@code GET /api/v1/search/books|movies} over HTTP on real Postgres with the providers stubbed by WireMock. The app
 * registers one source per type, so the choice between several sources is proved on the derivation
 * ({@code UserDataSourceDerivationTests}); here: the endpoint rules, the draft entry, the limiter and the failures.
 * Provider results are cached per query, so every test that needs a fresh provider call uses its own query text.
 */
@IntegrationTest
@ExtendWith(OutputCaptureExtension.class)
class SearchApiTests {

    private static final String BOOKS = "/api/v1/search/books";
    private static final String MOVIES = "/api/v1/search/movies";

    @Autowired Api api;
    @Autowired TestUsers users;
    @Autowired WireMockServer provider;
    @Autowired UserSourceKeyRepository keys;

    @BeforeEach
    void resetProvider() {
        provider.resetAll();
    }

    private Api.Res search(TestUser user, String path, String q) {
        return api.as(user).get(path + "?q={q}", q);
    }

    private void openLibrary(String body) {
        json(provider, "/search.json", 200, body);
    }

    private TestUser userWithTmdbKey() {
        return TestKeys.userWithTmdbKey(users, keys);
    }

    private void tmdbSearch() {
        json(provider, "/3/configuration", 200, Fixtures.read("tmdb/synthetic/configuration.json"));
        json(provider, "/3/search/multi", 200, Fixtures.read("tmdb/synthetic/search-multi.json"));
    }

    // ---- results

    @Test
    void bookHitsAreProviderEntriesAndTheListEndsWithTheDraft() {
        openLibrary(Fixtures.read("open_library/search-dune.json"));

        var res = search(users.create(), BOOKS, "dune frank herbert").expect(200);

        assertThat(res.<List<?>>json("$")).hasSize(11);
        assertThat(res.<String>json("$[0].kind")).isEqualTo("provider");
        assertThat(res.<String>json("$[0].sourceUrl")).isEqualTo("https://openlibrary.org/works/OL893414W");
        assertThat(res.<String>json("$[0].title")).isEqualTo("Dune");
        assertThat(res.<String>json("$[0].author")).isEqualTo("Frank Herbert");
        assertThat(res.<Integer>json("$[0].year")).isEqualTo(1965);
        assertThat(res.<String>json("$[0].isbn")).as("as the fixture gives it").isEqualTo("9780450000898");
        assertThat(res.<List<String>>json("$[?(@.kind == 'draft')].title")).containsExactly("dune frank herbert");
        assertThat(res.<String>json("$[10].kind")).isEqualTo("draft");
        assertThat(res.<String>json("$[10].sourceUrl"))
                .isEqualTo("https://www.google.com/search?q=dune%20frank%20herbert");
        assertThat(res.<Object>json("$[10].isbn")).isNull();
        assertThat(res.<Object>json("$[10].author")).isNull();
    }

    @Test
    void anEmptyResultIsTheDraftEntryAlone() {
        openLibrary("{\"numFound\":0,\"docs\":[]}");

        var res = search(users.create(), BOOKS, "  nothing here  ").expect(200);

        assertThat(res.<List<?>>json("$")).hasSize(1);
        assertThat(res.<String>json("$[0].kind")).isEqualTo("draft");
        assertThat(res.<String>json("$[0].title")).as("trimmed").isEqualTo("nothing here");
    }

    @Test
    void theDraftLinkOfTypedTextIsTheSharedVector() {
        openLibrary("{\"numFound\":0,\"docs\":[]}");
        var user = users.create();
        var checked = 0;
        for (var v : Vectors.sourceUrls().get("draftLinks").get("accept")) {
            var title = v.get("title").asString();
            if (title.codePointCount(0, title.length()) < 3) {
                continue;
            }
            var res = search(user, BOOKS, title).expect(200);
            assertThat(res.<String>json("$[0].sourceUrl")).as(v.get("name").asString()).isEqualTo(v.get("link").asString());
            assertThat(res.<String>json("$[0].title")).isEqualTo(title);
            if (++checked % 8 == 0) {
                user = users.create(); // the burst limit is 10 searches per user
            }
        }
        assertThat(checked).isGreaterThan(10);
    }

    @Test
    void movieAndTvHitsCarryTheTypeAndTheDraftEntryHasNone() {
        tmdbSearch();
        var user = userWithTmdbKey();

        var res = search(user, MOVIES, "matrix").expect(200);

        assertThat(res.<List<String>>json("$[*].kind")).containsExactly("provider", "provider", "provider", "draft");
        assertThat(res.<List<String>>json("$[*].sourceUrl")).containsExactly("https://www.themoviedb.org/movie/603",
                "https://www.themoviedb.org/tv/1396", "https://www.themoviedb.org/movie/4242",
                "https://www.google.com/search?q=matrix");
        assertThat(res.<String>json("$[0].type")).isEqualTo("movie");
        assertThat(res.<String>json("$[1].type")).isEqualTo("tv");
        assertThat(res.<Object>json("$[3].type")).isNull();
        assertThat(res.<String>json("$[3].title")).isEqualTo("matrix");
        provider.verify(getRequestedFor(urlPathEqualTo("/3/search/multi")).withQueryParam("query", equalTo("matrix")));
    }

    // ---- input

    @Test
    void anUnknownDraftOrForeignSourceIsRejected() {
        var user = users.create();
        for (var source : List.of("nope", "draft", "tmdb")) {
            api.as(user).get(BOOKS + "?q=dune&source={s}", source).expectProblem(400, "validation");
        }
        for (var source : List.of("open_library", "draft")) {
            api.as(user).get(MOVIES + "?q=dune&source={s}", source).expectProblem(400, "validation");
        }
        provider.verify(0, anyRequest());
    }

    @Test
    void aQueryOutsideThreeToTwoHundredCharactersOrWithAControlCharacterIsRejected() {
        var user = users.create();

        for (var q : List.of("ab", "  ab  ", "x".repeat(201), "du\u0001ne", "   ")) {
            search(user, BOOKS, q).expectProblem(400, "validation");
        }
        api.as(user).get(BOOKS).expectProblem(400, null);
        provider.verify(0, anyRequest());
    }

    @Test
    void twoHundredCodePointsOfEmojiAreAccepted() {
        openLibrary("{\"numFound\":0,\"docs\":[]}");

        search(users.create(), BOOKS, "😀".repeat(200)).expect(200);
        search(users.create(), BOOKS, "😀".repeat(201)).expectProblem(400, "validation");
    }

    @Test
    void searchNeedsASession() {
        api.get(BOOKS + "?q=dune").expectProblem(401, "unauthorized");
        api.get(MOVIES + "?q=dune").expectProblem(401, "unauthorized");
    }

    // ---- sources and keys

    @Test
    void theOnlyMovieSourceWithoutAKeyIsConflictWhetherChosenOrNot() {
        var user = users.create();

        search(user, MOVIES, "matrix").expectProblem(409, "source_key_missing");
        var res = api.as(user).get(MOVIES + "?q=matrix&source=tmdb").expectProblem(409, "source_key_missing");

        assertThat(res.<String>json("$.source")).isEqualTo("tmdb");
        provider.verify(0, anyRequest());
    }

    @Test
    void aKeyBelongsToItsUser() {
        tmdbSearch();
        var withKey = userWithTmdbKey();
        var without = users.create();

        search(withKey, MOVIES, "matrix").expect(200);
        search(without, MOVIES, "matrix").expectProblem(409, "source_key_missing");
    }

    @Test
    void aRejectedSavedKeyIsConflictNamingTheSource() {
        json(provider, "/3/configuration", 401, "");
        json(provider, "/3/search/multi", 401, "");

        var res = search(userWithTmdbKey(), MOVIES, "rejected key").expectProblem(409, "source_key_invalid");

        assertThat(res.<String>json("$.source")).isEqualTo("tmdb");
    }

    // ---- failures and limits

    @Test
    void aProviderErrorIsAProblemAndNoPartialList() {
        json(provider, "/search.json", 500, "");

        var res = search(users.create(), BOOKS, "provider is down").expectProblem(502, "provider_error");

        assertThat(res.<String>json("$.source")).isEqualTo("open_library");
        assertThat(res.body()).doesNotContain("draft");
    }

    @Test
    void theEleventhSearchWithinTenSecondsIsRateLimitedPerUser() {
        openLibrary("{\"numFound\":0,\"docs\":[]}");
        var user = users.create();
        for (var i = 0; i < 10; i++) {
            search(user, BOOKS, "burst " + i).expect(200);
        }

        var res = search(user, BOOKS, "burst 10").expectProblem(429, "rate_limited");

        assertThat(Integer.parseInt(res.header("Retry-After"))).isPositive();
        assertThat(search(users.create(), BOOKS, "burst 10").expect(200).<List<?>>json("$")).hasSize(1);
        // the movie search of the same user shares the SEARCH bucket
        search(user, MOVIES, "burst 11").expectProblem(429, "rate_limited");
    }

    @Test
    void noInfoLogLineContainsTheQuery(CapturedOutput output) {
        openLibrary("{\"numFound\":0,\"docs\":[]}");

        search(users.create(), BOOKS, "zq-secret-query-text").expect(200);

        assertThat(output.getAll()).doesNotContain("zq-secret-query-text");
    }

    private static RequestPatternBuilder anyRequest() {
        return WireMock.anyRequestedFor(anyUrl());
    }
}
