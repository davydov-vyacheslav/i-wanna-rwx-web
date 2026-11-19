package com.javanix.rwx.datasource.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.javanix.rwx.api.model.BookSourceId;
import com.javanix.rwx.api.model.MovieSourceId;
import com.javanix.rwx.datasource.BookRef;
import com.javanix.rwx.datasource.MovieRef;
import com.javanix.rwx.datasource.MovieType;
import com.javanix.rwx.datasource.internal.book.BookDraftResolver;
import com.javanix.rwx.datasource.internal.movie.MovieDraftResolver;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DraftResolverTests {

    private static final String LINK = "https://www.google.com/search?q=The%20Dune";

    private final BookDraftResolver books = new BookDraftResolver();
    private final MovieDraftResolver movies = new MovieDraftResolver();

    @Test
    void identifyReturnsADraftRefWhoseExternalIdIsTheTextWithCasePreserved() {
        var book = books.identify(LINK).orElseThrow();
        assertThat(book.source()).isEqualTo(BookSourceId.DRAFT);
        assertThat(book.externalId()).isEqualTo("The Dune");

        var movie = movies.identify(LINK).orElseThrow();
        assertThat(movie.source()).isEqualTo(MovieSourceId.DRAFT);
        assertThat(movie.type()).isEqualTo(MovieType.MOVIE);
        assertThat(movie.externalId()).isEqualTo("The Dune");
    }

    @Test
    void anythingElseIsNotADraft() {
        assertThat(books.identify("https://openlibrary.org/works/OL1W")).isEmpty();
        assertThat(movies.identify("not a url")).isEmpty();
    }

    @Test
    void resolveBuildsTheItemFromTheRefAlone() {
        var ref = books.identify(LINK).orElseThrow();
        var item = books.resolve(null, ref);

        assertThat(item.title()).isEqualTo("The Dune");
        assertThat(item.externalLink()).isEqualTo(LINK);
        assertThat(item.ref()).isSameAs(ref);

        var movie = movies.resolve(UUID.randomUUID(), movies.identify(LINK).orElseThrow());
        assertThat(movie.title()).isEqualTo("The Dune");
        assertThat(movie.externalLink()).isEqualTo(LINK);
    }

    @Test
    void resolveRejectsAnInvalidTextOrAForeignSource() {
        assertThatThrownBy(() -> books.resolve(null, new BookRef(BookSourceId.DRAFT, " ")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> books.resolve(null, new BookRef(BookSourceId.DRAFT, "a\nb")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> books.resolve(null, new BookRef(BookSourceId.DRAFT, "x".repeat(201))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> books.resolve(null, new BookRef(BookSourceId.OPEN_LIBRARY, "OL1W")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> movies.resolve(null, new MovieRef(MovieSourceId.TMDB, MovieType.MOVIE, "1396")))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
