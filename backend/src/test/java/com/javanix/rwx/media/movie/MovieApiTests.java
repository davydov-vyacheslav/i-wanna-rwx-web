package com.javanix.rwx.media.movie;

import static org.assertj.core.api.Assertions.assertThat;

import com.javanix.rwx.media.common.MediaSeed;
import com.javanix.rwx.media.common.MediaUrls;
import com.javanix.rwx.testkit.Api;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

/** What only the movie API does; the HTTP behaviour every type shares is in {@code media.common.MediaApiTests}. */
@IntegrationTest
class MovieApiTests {

    private static final String MOVIES = "/api/v1/movies";

    @Autowired Api api;
    @Autowired TestUsers users;
    @Autowired JdbcClient jdbc;

    private Api.Res create(TestUsers.TestUser user, UUID id, String title) {
        return api.as(user).postItem(MOVIES, id, MediaUrls.draft(title));
    }

    @Test
    void aDraftIsAMovie() {
        var created = create(users.create(), UUID.randomUUID(), "Solaris").expect(201);

        assertThat(created.<String>json("$.type")).isEqualTo("movie");
    }

    @Test
    void seasonFieldsOnAMovieAre400AndOnATvItemAreApplied() {
        var user = users.create();
        var movie = UUID.randomUUID();
        create(user, movie, "Mirror").expect(201);
        var tv = MediaSeed.movie(jdbc, user.id(), "tv", "Breaking Bad", null, "1396");

        api.as(user).patch(MOVIES + "/" + movie, "{\"seasonCount\":3}").expectProblem(400, "validation");
        api.as(user).patch(MOVIES + "/" + movie, "{\"tvStatus\":\"ended\"}").expectProblem(400, "validation");
        var patched = api.as(user).patch(MOVIES + "/" + tv, "{\"seasonCount\":5,\"tvStatus\":\"ended\"}").expect(200);
        assertThat(patched.<Integer>json("$.seasonCount")).isEqualTo(5);
        assertThat(patched.<String>json("$.tvStatus")).isEqualTo("ended");
        assertThat(patched.<String>json("$.type")).isEqualTo("tv");
    }

    @Test
    void duplicateIs409AlsoForAnOriginalTitle() {
        var user = users.create();
        var seeded = MediaSeed.movie(jdbc, user.id(), "movie", "Stalker", "Сталкер", "1398");

        var byOriginal = create(user, UUID.randomUUID(), "сталкер").expectProblem(409, "duplicate");
        assertThat(byOriginal.<String>json("$.existingId")).isEqualTo(seeded.toString());
    }
}
