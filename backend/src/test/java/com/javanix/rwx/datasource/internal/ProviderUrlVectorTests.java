package com.javanix.rwx.datasource.internal;

import static org.assertj.core.api.Assertions.assertThat;

import com.javanix.rwx.common.validators.HttpUrls;
import com.javanix.rwx.datasource.internal.book.BookCatalogService;
import com.javanix.rwx.datasource.internal.book.openlibrary.OpenLibrarySource;
import com.javanix.rwx.datasource.internal.movie.MovieCatalogService;
import com.javanix.rwx.datasource.internal.movie.tmdb.TmdbSource;
import com.javanix.rwx.datasource.internal.provider.TestProps;
import com.javanix.rwx.settings.SettingsService;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.Mockito;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The real recognizers against {@code providerUrls} of the vector file shared with media and the client. Neither
 * recognizer touches its collaborators, so none is wired to anything.
 */
class ProviderUrlVectorTests {

    private static final JsonNode VECTORS = load();
    private static final OpenLibrarySource OPEN_LIBRARY = new OpenLibrarySource(null, TestProps.cache(false));
    private static final TmdbSource TMDB = new TmdbSource(null, TestProps.cache(false), (userId, source) -> {
        throw new AssertionError("recognize must not look up a key");
    }, Mockito.mock(SettingsService.class, invocation -> {
        throw new AssertionError("recognize must not look up a locale");
    }));
    private static final BookCatalogService BOOKS = TestSources.books(List.of(OPEN_LIBRARY));
    private static final MovieCatalogService MOVIES = TestSources.movies(List.of(TMDB));

    private static JsonNode load() {
        try {
            return JsonMapper.builder().build().readTree(
                    Files.readString(Path.of("..", "api", "test-vectors", "source-urls.json")));
        } catch (Exception e) {
            throw new IllegalStateException("api/test-vectors/source-urls.json must be readable from backend/", e);
        }
    }

    @AfterAll
    static void close() {
        OPEN_LIBRARY.destroy();
    }

    private static Stream<Arguments> accepted(String source) {
        return VECTORS.get("providerUrls").get(source).get("accept").valueStream()
                .map(n -> Arguments.of(n.get("url").asString(), n.get("canonical").asString()));
    }

    private static Stream<String> rejected(String source) {
        return VECTORS.get("providerUrls").get(source).get("reject").valueStream().map(JsonNode::asString);
    }

    static Stream<Arguments> openLibraryAccepted() {
        return accepted("open_library");
    }

    static Stream<Arguments> tmdbAccepted() {
        return accepted("tmdb");
    }

    static Stream<String> allRejected() {
        return Stream.concat(rejected("open_library"), rejected("tmdb"));
    }

    @ParameterizedTest
    @MethodSource("openLibraryAccepted")
    void openLibraryUrlsAreCanonicalizedAsInTheVectors(String url, String canonical) {
        var ref = BOOKS.identify(url).orElseThrow();

        assertThat(OPEN_LIBRARY.canonicalUrl(ref)).isEqualTo(canonical);
        assertThat(BOOKS.identify(canonical)).contains(ref);
        // TMDb does not recognize it
        assertThat(MOVIES.identify(url)).isEmpty();
    }

    @ParameterizedTest
    @MethodSource("tmdbAccepted")
    void tmdbUrlsAreCanonicalizedAsInTheVectors(String url, String canonical) {
        var ref = MOVIES.identify(url).orElseThrow();

        assertThat(TMDB.canonicalUrl(ref)).isEqualTo(canonical);
        assertThat(MOVIES.identify(canonical)).contains(ref);
        assertThat(BOOKS.identify(url)).isEmpty();
    }

    @ParameterizedTest
    @MethodSource("allRejected")
    void rejectedUrlsAreRecognizedByNoSource(String url) {
        
        assertThat(BOOKS.identify(url)).as("open_library: " + url).isEmpty();
        assertThat(MOVIES.identify(url)).as("tmdb: " + url).isEmpty();
    }

    @Test
    void noUrlOfTheVectorsIsRecognizedByTwoRealSources() {
        var all = new ArrayList<String>();
        for (var source : new String[] {"open_library", "tmdb"}) {
            accepted(source).forEach(a -> all.add((String) a.get()[0]));
            accepted(source).forEach(a -> all.add((String) a.get()[1]));
            rejected(source).forEach(all::add);
        }
        // hosts swapped between the sources, and the draft host
        all.add("https://openlibrary.org/movie/603");
        all.add("https://www.themoviedb.org/works/OL1W");
        all.add("https://www.google.com/search?q=Dune");

        for (var url : all) {
            var parsed = HttpUrls.parse(url);
            var recognizers = (parsed.flatMap(OPEN_LIBRARY::recognize).isPresent() ? 1 : 0)
                    + (parsed.flatMap(TMDB::recognize).isPresent() ? 1 : 0);
            assertThat(recognizers).as(url).isLessThanOrEqualTo(1);
        }
    }
}
