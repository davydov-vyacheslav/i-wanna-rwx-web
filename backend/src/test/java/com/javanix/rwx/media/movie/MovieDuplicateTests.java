package com.javanix.rwx.media.movie;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.javanix.rwx.api.model.MovieSourceId;
import com.javanix.rwx.common.DuplicateException;
import com.javanix.rwx.datasource.MediaResolver;
import com.javanix.rwx.datasource.MovieItem;
import com.javanix.rwx.datasource.MovieRef;
import com.javanix.rwx.datasource.MovieType;
import com.javanix.rwx.identity.UserLock;
import com.javanix.rwx.media.common.MediaSeed;
import com.javanix.rwx.media.common.MediaService;
import com.javanix.rwx.media.common.MediaUrls;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import java.time.Clock;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.support.TransactionTemplate;

/** The rules only movies have; the title rules and races every type shares are in {@code media.common.MediaDuplicateTests}. */
@IntegrationTest
class MovieDuplicateTests {

    @Autowired MovieService service;
    @Autowired MovieRepository repository;
    @Autowired @Qualifier(MediaResolver.DRAFT) MediaResolver<MovieRef, MovieItem> drafts;
    @Autowired TestUsers users;
    @Autowired JdbcClient jdbc;
    @Autowired UserLock userLock;
    @Autowired Clock clock;
    @Autowired TransactionTemplate tx;

    @Test
    void draftIsBlockedByAnyLiveTitleOrOriginalTitle() {
        var user = users.create().id();
        var byTitle = MediaSeed.movie(jdbc, user, "movie", "Solaris", null, "593");
        var byOriginal = MediaSeed.movie(jdbc, user, "movie", "Stalker", "Сталкер", "1398");

        assertThatThrownBy(() -> service.create(user, UUID.randomUUID(), MediaUrls.draft("solaris ")))
                .isInstanceOfSatisfying(DuplicateException.class, e -> assertThat(e.existingId()).isEqualTo(byTitle));
        assertThatThrownBy(() -> service.create(user, UUID.randomUUID(), MediaUrls.draft("СТАЛКЕР")))
                .isInstanceOfSatisfying(DuplicateException.class, e -> assertThat(e.existingId()).isEqualTo(byOriginal));
    }

    @Test
    void movieAndTvWithTheSameTmdbIdCoexistButSameTypeClashes() {
        var user = users.create().id();
        var tv = MediaSeed.movie(jdbc, user, "tv", "Breaking Bad", null, "1396");

        var movie = providerCreate(user, MovieType.MOVIE, "1396", "Some Movie");
        assertThat(movie.created()).isTrue();
        assertThat(service.list(user)).extracting(MovieEntity::getType).containsExactlyInAnyOrder("tv", "movie");

        assertThatThrownBy(() -> providerCreate(user, MovieType.TV, "1396", "Other"))
                .isInstanceOfSatisfying(DuplicateException.class, e -> assertThat(e.existingId()).isEqualTo(tv));
        assertThatThrownBy(() -> providerCreate(user, MovieType.MOVIE, "1396", "Other"))
                .isInstanceOfSatisfying(DuplicateException.class,
                        e -> assertThat(e.existingId()).isEqualTo(movie.entity().getId()));
    }

    /** A provider-sourced create through a service whose resolver yields a fixed item. */
    private MediaService.CreateResult<MovieEntity> providerCreate(UUID user, MovieType type, String tmdbId, String title) {
        MediaResolver<MovieRef, MovieItem> fixed = new MediaResolver<>() {
            @Override
            public Optional<MovieRef> identify(String sourceUrl) {
                return Optional.of(new MovieRef(MovieSourceId.TMDB, type, tmdbId));
            }

            @Override
            public MovieItem resolve(UUID userId, MovieRef ref) {
                return new MovieItem(ref, MediaUrls.tmdb(type.value(), tmdbId), title, null, null, null, null, null,
                        null, null);
            }
        };
        return new MovieService(repository, drafts, fixed, userLock, clock, tx).create(user, UUID.randomUUID(), "https://x");
    }
}
