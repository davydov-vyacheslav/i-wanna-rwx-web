package com.javanix.rwx.datasource.internal.movie;

import com.javanix.rwx.api.model.ResourceType;
import com.javanix.rwx.datasource.MovieItem;
import com.javanix.rwx.datasource.MovieRef;
import com.javanix.rwx.datasource.internal.provider.CatalogService;
import com.javanix.rwx.datasource.internal.provider.RateLimiter;
import com.javanix.rwx.datasource.internal.provider.SourceDirectory;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

@Component
@Primary
public class MovieCatalogService extends CatalogService<MovieRef, MovieItem, MovieSource> {

    public MovieCatalogService(SourceDirectory directory, RateLimiter limiter) {
        super(directory.of(ResourceType.MOVIE, MovieSource.class), limiter);
    }
}
