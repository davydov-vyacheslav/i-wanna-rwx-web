package com.javanix.rwx.datasource.internal;

import static org.assertj.core.api.Assertions.assertThat;

import com.javanix.rwx.api.model.ResourceType;
import com.javanix.rwx.datasource.BookItem;
import com.javanix.rwx.datasource.BookRef;
import com.javanix.rwx.datasource.MediaResolver;
import com.javanix.rwx.datasource.MovieItem;
import com.javanix.rwx.datasource.MovieRef;
import com.javanix.rwx.datasource.internal.book.BookCatalogService;
import com.javanix.rwx.datasource.internal.book.BookDraftResolver;
import com.javanix.rwx.datasource.internal.movie.MovieCatalogService;
import com.javanix.rwx.datasource.internal.movie.MovieDraftResolver;
import com.javanix.rwx.datasource.internal.provider.SourceDirectory;
import com.javanix.rwx.datasource.internal.provider.SourceInfo;
import com.javanix.rwx.testkit.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.ApplicationContext;

/** Drafts and provider catalogs share the generic MediaResolver type: the draft qualifier selects the drafts, an unqualified injection gets the primary provider catalog. */
@IntegrationTest
class DraftWiringTests {

    @Autowired @Qualifier(MediaResolver.DRAFT) MediaResolver<BookRef, BookItem> bookDrafts;
    @Autowired @Qualifier(MediaResolver.DRAFT) MediaResolver<MovieRef, MovieItem> movieDrafts;
    @Autowired MediaResolver<BookRef, BookItem> books;
    @Autowired MediaResolver<MovieRef, MovieItem> movies;
    @Autowired SourceDirectory directory;
    @Autowired ApplicationContext context;

    @Test
    void bothDraftInjectionsResolveToTheirOwnBean() {
        assertThat(bookDrafts).isInstanceOf(BookDraftResolver.class);
        assertThat(movieDrafts).isInstanceOf(MovieDraftResolver.class);
    }

    @Test
    void providerResolversStayTheCatalogs() {
        assertThat(books).isInstanceOf(BookCatalogService.class);
        assertThat(movies).isInstanceOf(MovieCatalogService.class);
    }

    @Test
    void draftsAreNotInTheSourceDirectory() {
        for (var type : ResourceType.values()) {
            assertThat(directory.of(type)).extracting(SourceInfo::id).doesNotContain("draft");
        }
        assertThat(context.getBeansOfType(SourceInfo.class).values()).extracting(SourceInfo::id)
                .doesNotContain("draft");
    }
}
