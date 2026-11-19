package com.javanix.rwx.datasource.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.javanix.rwx.api.model.BookSourceId;
import com.javanix.rwx.api.model.MovieSourceId;
import com.javanix.rwx.datasource.BookRef;
import com.javanix.rwx.datasource.CatalogException.RateLimited;
import com.javanix.rwx.datasource.CatalogException.SourceKeyMissing;
import com.javanix.rwx.datasource.internal.book.BookCatalogService;
import com.javanix.rwx.datasource.internal.book.FakeBookSource;
import com.javanix.rwx.datasource.internal.movie.FakeMovieSource;
import com.javanix.rwx.datasource.internal.movie.MovieCatalogService;
import com.javanix.rwx.datasource.internal.provider.RateLimiter;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class CatalogServiceTests {

    private final FakeBookSource books = new FakeBookSource(BookSourceId.OPEN_LIBRARY, "openlibrary.test");
    private final FakeMovieSource movies = new FakeMovieSource(MovieSourceId.TMDB, "tmdb.test");
    private final RateLimiter limiter = new RateLimiter(Clock.systemUTC());
    private final BookCatalogService bookCatalog =
            new BookCatalogService(TestSources.directory(List.of(books), "open_library", null), limiter);
    private final MovieCatalogService movieCatalog =
            new MovieCatalogService(TestSources.directory(List.of(movies), null, "tmdb"), limiter);
    private final UUID user = UUID.randomUUID();

    @Test
    void identifyParsesStrictlyAndNeverCallsASource() {
        assertThat(bookCatalog.identify("https://openlibrary.test/works/OL1W"))
                .contains(new BookRef(BookSourceId.OPEN_LIBRARY, "OL1W"));
        for (var bad : new String[] {null, "", "ftp://openlibrary.test/works/OL1W", "https://u@openlibrary.test/works/OL1W",
                "https://openlibrary.test:8443/works/OL1W", "https://openlibrary.test./works/OL1W", "not a url",
                "https://www.google.com/search?q=Dune"}) {
            assertThat(bookCatalog.identify(bad)).as(String.valueOf(bad)).isEmpty();
        }
        assertThat(books.calls).isEmpty();
    }

    @Test
    void resolveDelegatesToTheSourceOfTheRef() {
        var ref = bookCatalog.identify("https://openlibrary.test/works/OL1W").orElseThrow();

        var item = bookCatalog.resolve(user, ref);

        assertThat(item.ref()).isEqualTo(ref);
        assertThat(item.title()).isEqualTo("Title OL1W");
        assertThat(item.externalLink()).isEqualTo("https://openlibrary.test/works/OL1W");
        assertThat(books.calls).containsExactly("resolve");
    }

    @Test
    void aCatalogExceptionFromTheSourcePropagatesAsIs() {
        movies.resolver = (u, r) -> {
            throw new SourceKeyMissing("tmdb");
        };
        var ref = movieCatalog.identify("https://tmdb.test/movie/603").orElseThrow();

        assertThatThrownBy(() -> movieCatalog.resolve(user, ref)).isInstanceOf(SourceKeyMissing.class)
                .satisfies(e -> assertThat(((SourceKeyMissing) e).source()).isEqualTo("tmdb"));
    }

    @Test
    void resolveSpendsOneDetailsTokenPerCallAndIdentifySpendsNone() {
        var ref = bookCatalog.identify("https://openlibrary.test/works/OL1W").orElseThrow();
        for (var i = 0; i < 100; i++) {
            bookCatalog.identify("https://openlibrary.test/works/OL1W");
        }
        for (var i = 0; i < 20; i++) {
            bookCatalog.resolve(user, ref);
        }

        assertThatThrownBy(() -> bookCatalog.resolve(user, ref)).isInstanceOf(RateLimited.class);
        // another user is unaffected, and the same bucket serves movies
        bookCatalog.resolve(UUID.randomUUID(), ref);
        assertThatThrownBy(() -> movieCatalog.resolve(user, movieCatalog.identify("https://tmdb.test/tv/1").orElseThrow()))
                .isInstanceOf(RateLimited.class);
        assertThat(books.calls).hasSize(21);
    }
}
