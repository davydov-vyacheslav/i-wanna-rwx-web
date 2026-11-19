package com.javanix.rwx.media.movie;

import com.javanix.rwx.api.model.Movie;
import com.javanix.rwx.identity.AccountExportContributor;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** The movies block of {@code GET /me/export}: live items only. */
@Component
class MovieExport implements AccountExportContributor {

    private final MovieService movies;
    private final MovieApiMapper mapper;

    MovieExport(MovieService movies, MovieApiMapper mapper) {
        this.movies = movies;
        this.mapper = mapper;
    }

    @Override
    public List<Movie> movies(UUID userId) {
        return movies.list(userId).stream().map(mapper::toApi).toList();
    }
}
