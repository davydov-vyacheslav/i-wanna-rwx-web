package com.javanix.rwx.media.movie;

import com.javanix.rwx.api.MoviesApi;
import com.javanix.rwx.api.model.CreateMovieRequest;
import com.javanix.rwx.api.model.Movie;
import com.javanix.rwx.api.model.UpdateMovieRequest;
import com.javanix.rwx.identity.CurrentUserProvider;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
class MovieController implements MoviesApi {

    private final CurrentUserProvider currentUser;
    private final MovieService movies;
    private final MovieApiMapper mapper;

    MovieController(CurrentUserProvider currentUser, MovieService movies, MovieApiMapper mapper) {
        this.currentUser = currentUser;
        this.movies = movies;
        this.mapper = mapper;
    }

    @Override
    public ResponseEntity<List<Movie>> listMovies() {
        return ResponseEntity.ok(movies.list(currentUser.current().id()).stream().map(mapper::toApi).toList());
    }

    @Override
    public ResponseEntity<Movie> createMovie(CreateMovieRequest request) {
        var result = movies.create(currentUser.current().id(), request.getId(), request.getSourceUrl());
        var status = result.created() ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(mapper.toApi(result.entity()));
    }

    @Override
    public ResponseEntity<Movie> getMovie(UUID id) {
        return ResponseEntity.ok(mapper.toApi(movies.get(currentUser.current().id(), id)));
    }

    @Override
    public ResponseEntity<Movie> updateMovie(UUID id, UpdateMovieRequest request) {
        var status = request.getStatus() == null ? null : request.getStatus().getValue();
        var tvStatus = request.getTvStatus() == null ? null : request.getTvStatus().getValue();
        return ResponseEntity.ok(mapper.toApi(movies.patch(currentUser.current().id(), id, status,
                request.getIsFavorite(), request.getSeasonCount(), tvStatus)));
    }

    @Override
    public ResponseEntity<Void> deleteMovie(UUID id) {
        movies.delete(currentUser.current().id(), id);
        return ResponseEntity.noContent().build();
    }
}
