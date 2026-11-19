package com.javanix.rwx.media.movie;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.javanix.rwx.api.model.MovieSourceId;
import com.javanix.rwx.common.InvalidRequestException;
import com.javanix.rwx.media.common.MediaSeed;
import com.javanix.rwx.media.common.MediaUrls;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

/** What only movies do; the create, patch and delete flow every type shares is in {@code media.common.MediaServiceTests}. */
@IntegrationTest
class MovieServiceTests {

    @Autowired MovieService service;
    @Autowired TestUsers users;
    @Autowired JdbcClient jdbc;

    @Test
    void draftCreateStoresADraftMovieWithoutAnOriginalTitleOrSeasonDetails() {
        var movie = service.create(users.create().id(), UUID.randomUUID(), MediaUrls.draft("Café Society")).entity();

        assertThat(movie.getType()).isEqualTo("movie");
        assertThat(movie.getSource()).isEqualTo(MovieSourceId.DRAFT);
        assertThat(movie.getOriginalTitle()).isNull();
        assertThat(movie.getSeasonCount()).isNull();
        assertThat(movie.getTvStatus()).isNull();
    }

    @Test
    void seasonFieldsAreRejectedOnAMovieAndAcceptedOnATvItem() {
        var user = users.create().id();
        var movie = UUID.randomUUID();
        service.create(user, movie, MediaUrls.draft("Solaris"));
        var tv = MediaSeed.movie(jdbc, user, "tv", "Breaking Bad", null, "1396");

        assertThatThrownBy(() -> service.patch(user, movie, null, null, 5, null))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.patch(user, movie, "seen", null, null, "ended"))
                .isInstanceOf(InvalidRequestException.class);
        assertThat(service.get(user, movie).getVersion()).isEqualTo(1);

        var patched = service.patch(user, tv, null, null, 5, "ended");
        assertThat(patched.getSeasonCount()).isEqualTo(5);
        assertThat(patched.getTvStatus()).isEqualTo("ended");
        assertThat(patched.getVersion()).isEqualTo(2);
        assertThat(service.patch(user, tv, null, null, 5, "ended").getVersion()).isEqualTo(2);
    }
}
