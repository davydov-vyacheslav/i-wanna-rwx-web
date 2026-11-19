package com.javanix.rwx.datasource.internal.movie.tmdb;

import static com.javanix.rwx.testkit.TestKeys.TMDB_KEY;
import com.javanix.rwx.common.validators.HttpUrls;
import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathMatching;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.github.tomakehurst.wiremock.http.Fault;
import com.github.tomakehurst.wiremock.junit5.WireMockExtension;
import com.javanix.rwx.api.model.MovieSourceId;
import com.javanix.rwx.testkit.TestKeys;
import com.javanix.rwx.datasource.CatalogException.ProviderRateLimited;
import com.javanix.rwx.datasource.CatalogException.ProviderTimeout;
import com.javanix.rwx.datasource.CatalogException.SourceNotFound;
import com.javanix.rwx.datasource.CatalogException;
import com.javanix.rwx.datasource.CatalogException.SourceKeyInvalid;
import com.javanix.rwx.datasource.CatalogException.SourceKeyMissing;
import com.javanix.rwx.datasource.MovieItem;
import com.javanix.rwx.datasource.MovieRef;
import com.javanix.rwx.datasource.MovieType;
import com.javanix.rwx.datasource.TvStatus;
import com.javanix.rwx.datasource.internal.provider.Fixtures;
import com.javanix.rwx.datasource.internal.provider.UserDataSourceService;
import com.javanix.rwx.datasource.internal.provider.persistence.UserSourceKeyRepository;
import com.javanix.rwx.datasource.internal.provider.TestClients;
import com.javanix.rwx.datasource.internal.provider.TestProps;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.web.service.registry.ImportHttpServices;
import com.javanix.rwx.settings.SettingsService;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers.TestUser;
import com.javanix.rwx.testkit.TestUsers;
import java.math.BigDecimal;
import java.time.Duration;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * The TMDb source against WireMock serving the SYNTHETIC fixtures in {@code providers/tmdb/synthetic} (hand-written
 * from the API docs, not recorded). Keys, locales and users are real (Postgres through the real key store).
 */
@IntegrationTest
class TmdbSourceTests {

    @RegisterExtension
    static WireMockExtension wm = WireMockExtension.newInstance().options(wireMockConfig().dynamicPort()).build();

    private static final String SYN = "tmdb/synthetic/";

    @Autowired TestUsers users;
    @Autowired UserDataSourceService keys;
    @Autowired UserSourceKeyRepository repository;
    @Autowired SettingsService settings;

    @TestConfiguration(proxyBeanMethods = false)
    @ImportHttpServices(group = "tmdb", types = TmdbApi.class)
    static class Clients {
    }

    private TmdbSource source() {
        var api = TestClients.client(TmdbApi.class, Clients.class, "rwx.datasource.movies.tmdb.base-url=" + wm.baseUrl() + "/3");
        return new TmdbSource(api, TestProps.cache(true), keys, settings);
    }

    private TestUser userWithKey(String key) {
        var user = users.create();
        TestKeys.save(repository, user.id(), "tmdb", key);
        return user;
    }

    private static void json(String path, int status, String body) {
        wm.stubFor(get(urlPathEqualTo("/3" + path)).willReturn(
                aResponse().withStatus(status).withHeader("Content-Type", "application/json").withBody(body)));
    }

    private static void ok(String path, String fixture) {
        json(path, 200, Fixtures.read(SYN + fixture));
    }

    private static MovieRef movie(String id) {
        return new MovieRef(MovieSourceId.TMDB, MovieType.MOVIE, id);
    }

    private static MovieRef tv(String id) {
        return new MovieRef(MovieSourceId.TMDB, MovieType.TV, id);
    }

    // ---- search

    @Test
    void searchDropsPersonsAndMapsMoviesAndSeries() {
        ok("/configuration", "configuration.json");
        ok("/search/multi", "search-multi.json");
        var user = userWithKey(TMDB_KEY);

        var hits = source().search(user.id(), "matrix");

        assertThat(hits).extracting(MovieItem::externalLink).containsExactly("https://www.themoviedb.org/movie/603",
                "https://www.themoviedb.org/tv/1396", "https://www.themoviedb.org/movie/4242");
        var matrix = hits.get(0);
        assertThat(matrix.ref()).isEqualTo(movie("603"));
        assertThat(matrix.title()).isEqualTo("The Matrix");
        assertThat(matrix.originalTitle()).isEqualTo("The Matrix");
        assertThat(matrix.description()).startsWith("Set in the 22nd century");
        assertThat(matrix.year()).isEqualTo(1999);
        assertThat(matrix.rating()).isEqualByComparingTo(new BigDecimal("8.2"));
        assertThat(matrix.posterUrl()).isEqualTo("https://image.tmdb.org/t/p/w342/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg");
        assertThat(matrix.tvStatus()).isNull();
        assertThat(matrix.seasonCount()).isNull();
        var series = hits.get(1);
        assertThat(series.ref()).isEqualTo(tv("1396"));
        assertThat(series.title()).isEqualTo("Breaking Bad");
        assertThat(series.year()).isEqualTo(2008);
        // missing poster, empty overview and unknown date are absent, not errors
        var bare = hits.get(2);
        assertThat(bare.posterUrl()).isNull();
        assertThat(bare.description()).isNull();
        assertThat(bare.year()).isNull();
    }

    @Test
    void searchSendsQueryLanguageAndBearerAndKeepsAtMostTenHits() {
        ok("/configuration", "configuration.json");
        var results = new StringBuilder();
        for (var i = 1; i <= 13; i++) {
            results.append(i > 1 ? "," : "").append("{\"id\":").append(i).append(",\"media_type\":\"movie\",\"title\":\"M")
                    .append(i).append("\"}");
        }
        json("/search/multi", 200, "{\"page\":1,\"results\":[" + results + "]}");
        var user = userWithKey(TMDB_KEY);

        var hits = source().search(user.id(), "a&b c");

        assertThat(hits).hasSize(10);
        wm.verify(getRequestedFor(urlPathEqualTo("/3/search/multi")).withQueryParam("query", equalTo("a&b c"))
                .withQueryParam("language", equalTo("en")).withQueryParam("include_adult", equalTo("false"))
                .withHeader("Authorization", equalTo("Bearer " + TMDB_KEY)).withHeader("User-Agent", equalTo("RWX/1.0 (ops@example.com)")));
    }

    @Test
    void aV3KeyIsSentAsAQueryParameter() {
        ok("/configuration", "configuration.json");
        ok("/search/multi", "search-multi.json");
        var v3 = "0123456789abcdef0123456789abcdef";
        var user = userWithKey(v3);

        source().search(user.id(), "matrix");

        wm.verify(getRequestedFor(urlPathEqualTo("/3/search/multi")).withQueryParam("api_key", equalTo(v3)));
        assertThat(wm.findAll(getRequestedFor(urlPathEqualTo("/3/search/multi"))).getFirst().getHeader("Authorization")).isNull();
    }

    @Test
    void theLanguageIsTheUsersStoredLocale() {
        ok("/configuration", "configuration.json");
        ok("/search/multi", "search-multi.json");
        var ru = userWithKey(TMDB_KEY);
        users.setLocale(ru.id(), "ru");
        var uk = userWithKey(TMDB_KEY);
        users.setLocale(uk.id(), "uk");
        var none = userWithKey(TMDB_KEY);
        var source = source();

        source.search(ru.id(), "dune");
        source.search(uk.id(), "dune");
        source.search(none.id(), "dune");

        wm.verify(1, getRequestedFor(urlPathEqualTo("/3/search/multi")).withQueryParam("language", equalTo("ru")));
        wm.verify(1, getRequestedFor(urlPathEqualTo("/3/search/multi")).withQueryParam("language", equalTo("uk")));
        wm.verify(1, getRequestedFor(urlPathEqualTo("/3/search/multi")).withQueryParam("language", equalTo("en")));
    }

    @Test
    void theSameQueryForRuAndEnUsersDoesNotShareACacheEntryButSameLocaleDoes() {
        ok("/configuration", "configuration.json");
        ok("/search/multi", "search-multi.json");
        ok("/movie/603", "movie-603.json");
        var ru = userWithKey(TMDB_KEY);
        users.setLocale(ru.id(), "ru");
        var en = userWithKey(TMDB_KEY);
        var enToo = userWithKey(TMDB_KEY);
        var source = source();

        source.search(ru.id(), "matrix");
        source.search(en.id(), "matrix");
        source.search(enToo.id(), "matrix");
        source.resolve(ru.id(), movie("603"));
        source.resolve(en.id(), movie("603"));
        source.resolve(enToo.id(), movie("603"));

        // 2 searches and 2 resolves (ru, en), not 6 calls
        wm.verify(2, getRequestedFor(urlPathEqualTo("/3/search/multi")));
        wm.verify(2, getRequestedFor(urlPathEqualTo("/3/movie/603")));
    }

    @Test
    void imageSizeComesFromTheCachedConfigurationAndFallsBackWhenItFails() {
        json("/configuration", 200, """
                {"images":{"secure_base_url":"https://image.tmdb.org/t/p/","poster_sizes":["w92","w154","w500","w185","original"]}}""");
        ok("/search/multi", "search-multi.json");
        var user = userWithKey(TMDB_KEY);
        var source = source();

        // smallest size of at least 250 px, whatever the list order
        assertThat(source.search(user.id(), "one").getFirst().posterUrl()).startsWith("https://image.tmdb.org/t/p/w500/");
        source.search(user.id(), "two");
        wm.verify(1, getRequestedFor(urlPathEqualTo("/3/configuration")));

        wm.resetAll();
        json("/configuration", 500, "{}");
        ok("/search/multi", "search-multi.json");
        assertThat(source().search(user.id(), "three").getFirst().posterUrl())
                .isEqualTo("https://image.tmdb.org/t/p/w342/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg");
    }

    @Test
    void anImageBaseOnAnotherHostIsNotTrusted() {
        json("/configuration", 200, "{\"images\":{\"secure_base_url\":\"https://evil.example/t/p/\",\"poster_sizes\":[\"w342\"]}}");
        ok("/search/multi", "search-multi.json");
        var user = userWithKey(TMDB_KEY);

        assertThat(source().search(user.id(), "x").getFirst().posterUrl()).startsWith("https://image.tmdb.org/t/p/w342/");
    }

    // ---- resolve

    @Test
    void aMovieResolvesWithItsOriginalTitleAndNoTvFields() {
        ok("/configuration", "configuration.json");
        ok("/movie/603", "movie-603.json");
        var user = userWithKey(TMDB_KEY);

        var item = source().resolve(user.id(), movie("603"));

        assertThat(item.externalLink()).isEqualTo("https://www.themoviedb.org/movie/603");
        assertThat(item.title()).isEqualTo("The Matrix");
        assertThat(item.originalTitle()).isEqualTo("The Matrix");
        assertThat(item.description()).startsWith("Set in the 22nd century");
        assertThat(item.year()).isEqualTo(1999);
        assertThat(item.rating()).isEqualByComparingTo(new BigDecimal("8.2"));
        assertThat(item.posterUrl()).endsWith("/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg");
        assertThat(item.tvStatus()).isNull();
        assertThat(item.seasonCount()).isNull();
        // no credits calls: nothing stored needs them
        assertThat(wm.findAll(getRequestedFor(urlPathMatching(".*credits.*")))).isEmpty();
    }

    @Test
    void aSeriesResolvesWithOriginalNameStatusAndSeasons() {
        ok("/configuration", "configuration.json");
        ok("/tv/1396", "tv-1396.json");
        var user = userWithKey(TMDB_KEY);

        var item = source().resolve(user.id(), tv("1396"));

        assertThat(item.title()).isEqualTo("Breaking Bad");
        assertThat(item.originalTitle()).isEqualTo("Breaking Bad");
        assertThat(item.year()).isEqualTo(2008);
        assertThat(item.tvStatus()).isEqualTo(TvStatus.ENDED);
        assertThat(item.seasonCount()).isEqualTo(5);
        assertThat(wm.findAll(getRequestedFor(urlPathMatching(".*credits.*")))).isEmpty();
    }

    @Test
    void tvStatusMapsEndedCanceledOngoingAndNull() {
        ok("/configuration", "configuration.json");
        ok("/tv/1396", "tv-1396.json");
        ok("/tv/61889", "tv-61889-canceled.json");
        ok("/tv/76479", "tv-76479-returning.json");
        ok("/tv/4242", "tv-4242-null-status.json");
        var user = userWithKey(TMDB_KEY);
        var source = source();

        assertThat(source.resolve(user.id(), tv("1396")).tvStatus()).isEqualTo(TvStatus.ENDED);
        assertThat(source.resolve(user.id(), tv("61889")).tvStatus()).isEqualTo(TvStatus.ENDED);
        assertThat(source.resolve(user.id(), tv("76479")).tvStatus()).isEqualTo(TvStatus.ONGOING);
        var unknown = source.resolve(user.id(), tv("4242"));
        assertThat(unknown.tvStatus()).isNull();
        assertThat(unknown.seasonCount()).isNull();
        assertThat(unknown.posterUrl()).isNull();
        assertThat(unknown.description()).isNull();
    }

    @Test
    void movie1396AndTv1396AreDifferentItems() {
        ok("/configuration", "configuration.json");
        ok("/tv/1396", "tv-1396.json");
        json("/movie/1396", 404, Fixtures.read(SYN + "error-404.json"));
        var user = userWithKey(TMDB_KEY);
        var source = source();

        assertThat(source.resolve(user.id(), tv("1396")).title()).isEqualTo("Breaking Bad");
        assertThatThrownBy(() -> source.resolve(user.id(), movie("1396"))).isInstanceOf(SourceNotFound.class);
        assertThat(movie("1396")).isNotEqualTo(tv("1396"));
        assertThat(source().canonicalUrl(movie("1396"))).isNotEqualTo(source().canonicalUrl(tv("1396")));
    }

    @Test
    void aMovieWithoutPosterOrOverviewHasNeither() {
        ok("/configuration", "configuration.json");
        ok("/movie/4242", "movie-missing-poster.json");
        var user = userWithKey(TMDB_KEY);

        var item = source().resolve(user.id(), movie("4242"));

        assertThat(item.title()).isEqualTo("Zeit der Stille");
        assertThat(item.posterUrl()).isNull();
        assertThat(item.description()).isNull();
        assertThat(item.year()).isNull();
    }

    @Test
    void anEmptySuccessBodyIsAProviderErrorOfTmdbNotANullPointer() {
        ok("/configuration", "configuration.json");
        wm.stubFor(get(urlPathEqualTo("/3/search/multi")).willReturn(aResponse().withStatus(200)));
        wm.stubFor(get(urlPathEqualTo("/3/movie/9")).willReturn(aResponse().withStatus(200)));
        var user = userWithKey(TMDB_KEY);
        var source = source();

        assertThatThrownBy(() -> source.search(user.id(), "empty")).isInstanceOfSatisfying(CatalogException.ProviderError.class,
                e -> assertThat(e.source()).isEqualTo("tmdb"));
        assertThatThrownBy(() -> source.resolve(user.id(), movie("9"))).isInstanceOfSatisfying(CatalogException.ProviderError.class,
                e -> assertThat(e.source()).isEqualTo("tmdb"));
    }

    @Test
    void aBlankTitleIsAProviderErrorOfTmdbAndANegativeSeasonCountIsDropped() {
        ok("/configuration", "configuration.json");
        json("/tv/7", 200, "{\"name\":\"  \",\"number_of_seasons\":2}");
        json("/tv/8", 200, "{\"name\":\"X\",\"number_of_seasons\":-1,\"status\":\"Ended\"}");
        var user = userWithKey(TMDB_KEY);
        var source = source();

        assertThatThrownBy(() -> source.resolve(user.id(), tv("7"))).isInstanceOfSatisfying(CatalogException.ProviderError.class,
                e -> assertThat(e.source()).isEqualTo("tmdb"));
        assertThat(source.resolve(user.id(), tv("8")).seasonCount()).isNull();
    }

    @Test
    void posterIsBuiltFromATrustedBaseAndAFilePath() {
        var base = "https://image.tmdb.org/t/p/w342";
        assertThat(TmdbSource.posterUrl(base, "/abc.jpg")).isEqualTo(base + "/abc.jpg");
        assertThat(TmdbSource.posterUrl(base + "/", "/abc.jpg")).isEqualTo(base + "/abc.jpg");
        for (var path : new String[] {"https://evil.com/x.jpg", "//evil.com/x", "/../x", "/a/b.jpg", "abc.jpg", "", null}) {
            assertThat(TmdbSource.posterUrl(base, path)).as(String.valueOf(path)).isNull();
        }
        assertThat(TmdbSource.posterUrl("http://image.tmdb.org/t/p/w342", "/a.jpg")).isNull();
        assertThat(TmdbSource.posterUrl(null, "/a.jpg")).isNull();
    }

    @ParameterizedTest
    @CsvSource({"11,10.0", "8.46,8.5", "-3,0.0", "NaN,0.0", "Infinity,0.0"})
    void ratingIsClampedToTenAtOneDecimal(double raw, String expected) {
        assertThat(TmdbSource.rating(raw)).isEqualByComparingTo(new BigDecimal(expected));
        assertThat(TmdbSource.rating(null)).isNull();
    }

    // ---- key and provider failures

    @Test
    void withoutAKeyEverythingIsSourceKeyMissingAndNoCallIsMade() {
        var user = users.create();
        var source = source();

        assertThat(source.isAvailable(user.id())).isFalse();
        assertThatThrownBy(() -> source.search(user.id(), "matrix")).isInstanceOf(SourceKeyMissing.class)
                .satisfies(e -> assertThat(((CatalogException) e).source()).isEqualTo("tmdb"));
        assertThatThrownBy(() -> source.resolve(user.id(), movie("603"))).isInstanceOf(SourceKeyMissing.class);
        assertThat(wm.getAllServeEvents()).isEmpty();
    }

    @Test
    void aKeyMakesTheSourceAvailableForThatUserOnly() {
        var f = users.two();
        TestKeys.save(repository, f.a().id(), "tmdb", TMDB_KEY);
        ok("/configuration", "configuration.json");
        ok("/search/multi", "search-multi.json");
        var source = source();

        assertThat(source.isAvailable(f.a().id())).isTrue();
        assertThat(source.isAvailable(f.b().id())).isFalse();
        assertThat(source.search(f.a().id(), "matrix")).isNotEmpty();
        assertThatThrownBy(() -> source.search(f.b().id(), "matrix")).isInstanceOf(SourceKeyMissing.class);
    }

    @Test
    void a401IsSourceKeyInvalidAndKeepsTheKey() {
        json("/configuration", 401, Fixtures.read(SYN + "error-401.json"));
        json("/search/multi", 401, Fixtures.read(SYN + "error-401.json"));
        json("/movie/603", 401, Fixtures.read(SYN + "error-401.json"));
        var user = userWithKey(TMDB_KEY);
        var source = source();

        assertThatThrownBy(() -> source.search(user.id(), "matrix")).isInstanceOf(SourceKeyInvalid.class)
                .hasMessageNotContaining("Invalid API key")
                .satisfies(e -> assertThat(((CatalogException) e).source()).isEqualTo("tmdb"));
        assertThat(keys.keyOf(user.id(), source)).contains(TMDB_KEY);
        assertThatThrownBy(() -> source.resolve(user.id(), movie("603"))).isInstanceOf(SourceKeyInvalid.class);
        assertThat(keys.keyOf(user.id(), source)).as("a 401 never deletes the key").contains(TMDB_KEY);
    }

    @Test
    void aNetworkErrorIsATimeoutAndKeepsTheKey() {
        wm.stubFor(get(urlPathMatching("/3/.*")).willReturn(aResponse().withFault(Fault.CONNECTION_RESET_BY_PEER)));
        var user = userWithKey(TMDB_KEY);

        assertThatThrownBy(() -> source().search(user.id(), "matrix")).isInstanceOf(ProviderTimeout.class);
        assertThatThrownBy(() -> source().resolve(user.id(), movie("603"))).isInstanceOf(ProviderTimeout.class);

        assertThat(keys.keyOf(user.id(), source())).contains(TMDB_KEY);
    }

    @Test
    void a429CarriesRetryAfterAndANotFoundIsSourceNotFound() {
        ok("/configuration", "configuration.json");
        wm.stubFor(get(urlPathEqualTo("/3/search/multi")).willReturn(aResponse().withStatus(429).withHeader("Retry-After", "7")));
        json("/movie/999", 404, Fixtures.read(SYN + "error-404.json"));
        var user = userWithKey(TMDB_KEY);

        assertThatThrownBy(() -> source().search(user.id(), "matrix")).isInstanceOfSatisfying(ProviderRateLimited.class,
                e -> assertThat(e.retryAfter()).isEqualTo(Duration.ofSeconds(7)));
        assertThatThrownBy(() -> source().resolve(user.id(), movie("999"))).isInstanceOf(SourceNotFound.class);
    }

    // ---- recognize

    private static Optional<MovieRef> recognize(TmdbSource source, String url) {
        return HttpUrls.parse(url).flatMap(source::recognize);
    }

    @Test
    void recognizeTakesTheTypeFromTheUrlAndCanonicalizes() {
        var source = source();

        assertThat(recognize(source, "https://www.themoviedb.org/movie/603")).contains(movie("603"));
        assertThat(recognize(source, "https://www.themoviedb.org/movie/603-the-matrix")).contains(movie("603"));
        assertThat(recognize(source, "http://themoviedb.org/tv/1396-breaking-bad/season/1?language=ru-RU#x")).contains(tv("1396"));
        assertThat(recognize(source, "https://www.themoviedb.org/tv/1396/season/1")).contains(tv("1396"));
        assertThat(recognize(source, "https://www.themoviedb.org/movie/1396")).contains(movie("1396"))
                .isNotEqualTo(recognize(source, "https://www.themoviedb.org/tv/1396"));
        var canonical = recognize(source, "https://themoviedb.org/movie/27205-inception").orElseThrow();
        assertThat(source.canonicalUrl(canonical)).isEqualTo("https://www.themoviedb.org/movie/27205");
        assertThat(recognize(source, source.canonicalUrl(canonical))).contains(canonical);
    }

    @Test
    void recognizeRejectsLookalikesAndNeverCallsTheProvider() {
        var source = source();
        for (var url : new String[] {"https://www.themoviedb.org/movie/603abc", "https://www.themoviedb.org/movie/0603",
                "https://www.themoviedb.org/person/1", "https://www.themoviedb.org/movie/12345678901",
                "https://www.themoviedb.org.evil.com/movie/603", "https://themoviedb.org.evil.com/movie/603",
                "https://www.themoviedb.org@evil.com/movie/603", "https://www.themoviedb.org:8443/movie/603",
                "https://www.themoviedb.org./movie/603", "ftp://www.themoviedb.org/movie/603",
                "https://www.themoviedb.org/movie/", "https://www.themoviedb.org/movies/603",
                "https://openlibrary.org/movie/603", "https://api.themoviedb.org/3/movie/603"}) {
            assertThat(recognize(source, url)).as(url).isEmpty();
        }
        assertThat(wm.getAllServeEvents()).isEmpty();
    }
}
