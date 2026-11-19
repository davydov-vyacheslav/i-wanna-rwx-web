package com.javanix.rwx.datasource.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.javanix.rwx.api.model.BookSourceId;
import com.javanix.rwx.api.model.MovieSourceId;
import com.javanix.rwx.api.model.ResourceType;
import com.javanix.rwx.datasource.internal.book.FakeBookSource;
import com.javanix.rwx.datasource.internal.movie.FakeMovieSource;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SourceDirectoryTests {

    private final FakeBookSource openLibrary = new FakeBookSource(BookSourceId.OPEN_LIBRARY, "openlibrary.test");
    private final FakeMovieSource tmdb = new FakeMovieSource(MovieSourceId.TMDB, "tmdb.test");

    @Test
    void theSourcesOfATypeAreRegisteredInBeanOrderAndTheDefaultIsTheConfiguredOne() {
        var sources = TestSources.books(List.of(openLibrary));

        assertThat(sources.sources()).containsExactly(openLibrary);
        assertThat(sources.source("open_library")).containsSame(openLibrary);
        assertThat(sources.source("draft")).isEmpty();
    }

    @Test
    void aTypeWithoutSourcesHasNoneAndNoDefault() {
        var directory = TestSources.directory(List.of(openLibrary), "open_library", null);

        assertThat(directory.of(ResourceType.MOVIE)).isEmpty();
        assertThat(directory.defaultOf(ResourceType.MOVIE)).isNull();
        assertThat(TestSources.movies(List.of()).identify("https://tmdb.test/movie/603")).isEmpty();
    }

    @Test
    void sourcesAreGroupedByTheirResourceType() {
        var directory = TestSources.directory(List.of(openLibrary, tmdb), "open_library", "tmdb");

        assertThat(directory.of(ResourceType.BOOK)).containsExactly(openLibrary);
        assertThat(directory.of(ResourceType.MOVIE)).containsExactly(tmdb);
        assertThat(directory.defaultOf(ResourceType.BOOK)).isSameAs(openLibrary);
        assertThat(directory.defaultOf(ResourceType.MOVIE)).isSameAs(tmdb);
    }

    @Test
    void aDefaultThatIsNotARegisteredSourceOfTheTypeFailsStartupNamingThePropertyAndTheId() {
        assertThatThrownBy(() -> TestSources.directory(List.of(openLibrary), "other", null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("rwx.datasource.books.default").hasMessageContaining("'other'");
        // a movie id is no book source
        assertThatThrownBy(() -> TestSources.directory(List.of(openLibrary), "tmdb", null))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("'tmdb'");
        assertThatThrownBy(() -> TestSources.directory(List.of(openLibrary), null, null))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("rwx.datasource.books.default");
    }

    @Test
    void identifyReturnsTheFirstMatchInListOrder() {
        // both fakes claim the same host (a configuration the real sources avoid): order decides
        var first = new FakeBookSource(BookSourceId.OPEN_LIBRARY, "same.test");
        var sources = TestSources.books(List.of(first));

        var ref = sources.identify("https://same.test/works/OL1W").orElseThrow();

        assertThat(ref.source()).isEqualTo(BookSourceId.OPEN_LIBRARY);
        assertThat(first.canonicalUrl(ref)).isEqualTo("https://same.test/works/OL1W");
        assertThat(sources.identify("https://other.test/works/OL1W")).isEmpty();
    }

    @Test
    void identifyIgnoresAvailabilityAndDoesNoIo() {
        tmdb.available = false;
        var sources = TestSources.movies(List.of(tmdb));

        var ref = sources.identify("https://tmdb.test/tv/1396").orElseThrow();

        assertThat(ref.externalId()).isEqualTo("1396");
        assertThat(tmdb.isAvailable(UUID.randomUUID())).isFalse();
        assertThat(tmdb.calls).isEmpty();
    }

    @Test
    void sameNumberAsMovieAndTvAreDifferentRefs() {
        var sources = TestSources.movies(List.of(tmdb));

        var movie = sources.identify("https://tmdb.test/movie/1396").orElseThrow();
        var tv = sources.identify("https://tmdb.test/tv/1396").orElseThrow();

        assertThat(movie).isNotEqualTo(tv);
        assertThat(tmdb.canonicalUrl(movie)).isNotEqualTo(tmdb.canonicalUrl(tv));
    }
}
