package com.javanix.rwx.media.movie;

import static com.javanix.rwx.testkit.TestKeys.TMDB_KEY;
import static com.javanix.rwx.testkit.ProviderStubs.json;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.javanix.rwx.api.model.MovieSourceId;
import com.javanix.rwx.datasource.MediaResolver;
import com.javanix.rwx.datasource.MovieItem;
import com.javanix.rwx.datasource.MovieRef;
import com.javanix.rwx.datasource.MovieType;
import com.javanix.rwx.datasource.internal.provider.Fixtures;
import com.javanix.rwx.datasource.internal.provider.persistence.UserSourceKeyRepository;
import com.javanix.rwx.identity.UserLock;
import com.javanix.rwx.media.common.MediaEntity;
import com.javanix.rwx.media.common.MediaKind;
import com.javanix.rwx.media.common.MediaSeed;
import com.javanix.rwx.media.common.MediaService;
import com.javanix.rwx.media.common.MediaUrls;
import com.javanix.rwx.testkit.TestKeys;
import java.time.Clock;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/** The movie side of the shared media tests, here because the service and repository are package-private. */
@Component
class MovieKind implements MediaKind {


    @Autowired MovieService service;
    @Autowired MovieRepository repository;
    @Autowired @Qualifier(MediaResolver.DRAFT) MediaResolver<MovieRef, MovieItem> drafts;
    @Autowired MediaResolver<MovieRef, MovieItem> catalog;
    @Autowired UserLock userLock;
    @Autowired Clock clock;
    @Autowired TransactionTemplate tx;
    @Autowired JdbcClient jdbc;
    @Autowired UserSourceKeyRepository keys;

    @Override
    public String name() {
        return "movie";
    }

    @Override
    public String path() {
        return "/api/v1/movies";
    }

    @Override
    public String table() {
        return "movies";
    }

    @Override
    public String exportKey() {
        return "movies";
    }

    @Override
    public String invalidStatus() {
        return "watching";
    }

    @Override
    public MediaService<?, ?, ?> service() {
        return service;
    }

    @Override
    public MediaResolver<?, ?> drafts() {
        return drafts;
    }

    @Override
    public MediaResolver<?, ?> catalog() {
        return catalog;
    }

    @Override
    @SuppressWarnings("unchecked")
    public MediaService<?, ?, ?> service(MediaResolver<?, ?> drafts, MediaResolver<?, ?> catalog) {
        return new MovieService(repository, (MediaResolver<MovieRef, MovieItem>) drafts,
                (MediaResolver<MovieRef, MovieItem>) catalog, userLock, clock, tx);
    }

    @Override
    public MediaEntity patch(UUID user, UUID id, String status, Boolean favorite) {
        return service.patch(user, id, status, favorite, null, null);
    }

    @Override
    public UUID seed(UUID user, String title) {
        return MediaSeed.movie(jdbc, user, "movie", title, null, tmdbId());
    }

    @Override
    public MediaResolver<?, ?> provider(String title, String imageUrl) {
        var externalId = tmdbId();
        return new MediaResolver<MovieRef, MovieItem>() {
            @Override
            public Optional<MovieRef> identify(String sourceUrl) {
                return Optional.of(new MovieRef(MovieSourceId.TMDB, MovieType.MOVIE, externalId));
            }

            @Override
            public MovieItem resolve(UUID userId, MovieRef ref) {
                return new MovieItem(ref, MediaUrls.tmdb("movie", externalId), title, null, null, imageUrl, null, null,
                        null, null);
            }
        };
    }

    @Override
    public MediaEntity entity(String description) {
        var item = new MovieItem(new MovieRef(MovieSourceId.TMDB, MovieType.MOVIE, "603"), MediaUrls.tmdb("movie", "603"),
                "Matrix", null, description, null, null, null, null, null);
        return new MovieEntity(UUID.randomUUID(), UUID.randomUUID(), "603", item, clock.instant());
    }

    @Override
    public String stubProviderUrl(WireMockServer provider, UUID user) {
        // an id no other test uses: the provider cache is shared across the test context
        var id = tmdbId();
        json(provider, "/3/configuration", 200, Fixtures.read("tmdb/synthetic/configuration.json"));
        json(provider, "/3/movie/" + id, 200, Fixtures.read("tmdb/synthetic/movie-603.json"));
        TestKeys.save(keys, user, "tmdb", TMDB_KEY);
        return MediaUrls.tmdb("movie", id);
    }

    private static String tmdbId() {
        return Long.toString(ThreadLocalRandom.current().nextLong(100_000_000L, 999_999_999L));
    }
}
