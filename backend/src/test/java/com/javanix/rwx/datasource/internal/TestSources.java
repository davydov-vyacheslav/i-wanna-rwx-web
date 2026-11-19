package com.javanix.rwx.datasource.internal;

import com.javanix.rwx.datasource.internal.book.BookSource;
import com.javanix.rwx.datasource.internal.book.BookCatalogService;
import com.javanix.rwx.datasource.internal.movie.MovieSource;
import com.javanix.rwx.datasource.internal.movie.MovieCatalogService;
import com.javanix.rwx.datasource.internal.provider.RateLimiter;
import com.javanix.rwx.datasource.internal.provider.SourceDirectory;
import com.javanix.rwx.datasource.internal.provider.SourceInfo;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;

/** Builds the catalogs over a {@link SourceDirectory} the way the application does, from fake sources. */
final class TestSources {

    // shared: the catalogs built here only identify; tests that resolve build their own
    private static final RateLimiter LIMITER = new RateLimiter(Clock.systemUTC());

    private TestSources() {}

    static SourceDirectory directory(List<? extends SourceInfo> beans, String bookDefault, String movieDefault) {
        return new SourceDirectory(new ArrayList<SourceInfo>(beans), bookDefault, movieDefault);
    }

    /** The first bean is the default of its type. */
    static BookCatalogService books(List<? extends BookSource> beans) {
        return new BookCatalogService(directory(beans, beans.isEmpty() ? null : beans.getFirst().id(), null), LIMITER);
    }

    static MovieCatalogService movies(List<? extends MovieSource> beans) {
        return new MovieCatalogService(directory(beans, null, beans.isEmpty() ? null : beans.getFirst().id()), LIMITER);
    }
}
