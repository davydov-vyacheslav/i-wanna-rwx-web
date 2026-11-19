package com.javanix.rwx.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * V001 constraints the media services rely on. Raw SQL, so the constraints are hit directly, not through the services; V001 deliberately has
 * no CHECK tying season_count/tv_status to type tv (the services' job).
 */
@IntegrationTest
class MediaSchemaTests {

    @Autowired TestUsers users;
    @Autowired JdbcClient jdbc;
    @Autowired Environment env;

    // the context only loads when Hibernate's schema validation passed
    @Test
    void contextValidatesSchema() {
        assertThat(env.getProperty("spring.jpa.hibernate.ddl-auto")).isEqualTo("validate");
    }

    @Test
    void sameIdUnderTwoUsersIsAllowedButNotTwiceUnderOne() {
        var f = users.two();
        var id = UUID.randomUUID();

        book(f.a().id(), id, "Dune", "draft", "dune", null);
        book(f.b().id(), id, "Dune", "draft", "dune", null);

        assertThat(count("books", f.a().id())).isEqualTo(1);
        assertThat(count("books", f.b().id())).isEqualTo(1);
        assertThatThrownBy(() -> book(f.a().id(), id, "Other", "open_library", "OL1W", null))
                .isInstanceOf(DataIntegrityViolationException.class);
        movie(f.a().id(), id, "Dune", "movie", "draft", "dune");
        movie(f.b().id(), id, "Dune", "movie", "draft", "dune");
        assertThatThrownBy(() -> movie(f.a().id(), id, "Other", "tv", "tmdb", "6"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void tombstoneDoesNotBlockReaddingButTwoLiveRowsConflictDraftsIncluded() {
        var user = users.create().id();
        book(user, UUID.randomUUID(), "Dune", "open_library", "OL1W", "9780441172719");
        book(user, UUID.randomUUID(), "Draft", "draft", "draft", null);
        movie(user, UUID.randomUUID(), "Draft", "movie", "draft", "draft");
        movie(user, UUID.randomUUID(), "Heat", "movie", "tmdb", "949");
        jdbc.sql("update books set deleted_at = now() where user_id = ?").param(user).update();
        jdbc.sql("update movies set deleted_at = now() where user_id = ?").param(user).update();

        book(user, UUID.randomUUID(), "Dune", "open_library", "OL1W", "9780441172719");
        book(user, UUID.randomUUID(), "Draft", "draft", "draft", null);
        movie(user, UUID.randomUUID(), "Draft", "movie", "draft", "draft");
        movie(user, UUID.randomUUID(), "Heat", "movie", "tmdb", "949");

        assertThatThrownBy(() -> book(user, UUID.randomUUID(), "Other", "open_library", "OL1W", null))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> book(user, UUID.randomUUID(), "Other", "open_library", "OL2W", "9780441172719"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> book(user, UUID.randomUUID(), "draft again", "draft", "draft", null))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> movie(user, UUID.randomUUID(), "draft again", "movie", "draft", "draft"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> movie(user, UUID.randomUUID(), "Heat again", "movie", "tmdb", "949"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void sameExternalIdUnderTwoSourcesCoexists() {
        var user = users.create().id();

        // a draft whose title key happens to equal a provider id is a different identity
        book(user, UUID.randomUUID(), "A", "draft", "OL1W", null);
        book(user, UUID.randomUUID(), "B", "open_library", "OL1W", null);
        movie(user, UUID.randomUUID(), "A", "movie", "draft", "603");
        movie(user, UUID.randomUUID(), "B", "movie", "tmdb", "603");

        assertThat(count("books", user)).isEqualTo(2);
        assertThat(count("movies", user)).isEqualTo(2);
    }

    @Test
    void movieAndTvWithTheSameTmdbIdCoexistButNotTwoOfAType() {
        var user = users.create().id();

        movie(user, UUID.randomUUID(), "Breaking Bad", "tv", "tmdb", "1396");
        movie(user, UUID.randomUUID(), "Other", "movie", "tmdb", "1396");

        assertThat(count("movies", user)).isEqualTo(2);
        assertThatThrownBy(() -> movie(user, UUID.randomUUID(), "Again", "tv", "tmdb", "1396"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void sourceMustBeInTheTablesListAndNotNull() {
        var user = users.create().id();

        for (var source : new String[] {"tmdb", "openlibrary", "OPEN_LIBRARY", "Draft", ""}) {
            assertThatThrownBy(() -> book(user, UUID.randomUUID(), "X", source, "OL1W", null)).as(source)
                    .isInstanceOf(DataIntegrityViolationException.class);
        }
        for (var source : new String[] {"open_library", "openlibrary", "TMDB", ""}) {
            assertThatThrownBy(() -> movie(user, UUID.randomUUID(), "X", "movie", source, "603")).as(source)
                    .isInstanceOf(DataIntegrityViolationException.class);
        }
        assertThatThrownBy(() -> book(user, UUID.randomUUID(), "X", null, "OL1W", null))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> movie(user, UUID.randomUUID(), "X", "movie", null, "603"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(count("books", user) + count("movies", user)).isZero();
    }

    @Test
    void externalIdAndLinkAreNotNullAndBounded() {
        var user = users.create().id();

        assertThatThrownBy(() -> book(user, UUID.randomUUID(), "X", "draft", null, null))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> book(user, UUID.randomUUID(), "X", "draft", "", null))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> book(user, UUID.randomUUID(), "X", "draft", "x".repeat(1025), null))
                .isInstanceOf(DataIntegrityViolationException.class);
        book(user, UUID.randomUUID(), "Max", "draft", "x".repeat(1024), null);
        assertThatThrownBy(() -> movie(user, UUID.randomUUID(), "X", "movie", "draft", null))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> movie(user, UUID.randomUUID(), "X", "movie", "draft", "x".repeat(1025)))
                .isInstanceOf(DataIntegrityViolationException.class);

        for (var table : new String[] {"books", "movies"}) {
            var type = table.equals("movies") ? "type, " : "";
            var typeValue = table.equals("movies") ? "'movie', " : "";
            var source = table.equals("movies") ? "'tmdb'" : "'open_library'";
            var id = table.equals("movies") ? "'603'" : "'OL1W'";
            assertThatThrownBy(() -> jdbc.sql("insert into " + table + " (id, user_id, title, " + type
                    + "source, external_id, external_link) values (?, ?, 'X', " + typeValue + source + ", " + id
                    + ", null)").params(UUID.randomUUID(), user).update()).as(table)
                    .isInstanceOf(DataIntegrityViolationException.class);
            assertThatThrownBy(() -> jdbc.sql("insert into " + table + " (id, user_id, title, " + type
                    + "source, external_id, external_link) values (?, ?, 'X', " + typeValue + source + ", " + id
                    + ", ?)").params(UUID.randomUUID(), user, "https://e.com/" + "x".repeat(4090)).update())
                    .as(table + " link over 4096").isInstanceOf(DataIntegrityViolationException.class);
        }
    }

    @Test
    void providerIdFormatsAreChecked() {
        var user = users.create().id();

        for (var id : new String[] {"OL1", "ol1w", "OL0X", "OL1234567890123W", "123", "OL1W "}) {
            assertThatThrownBy(() -> book(user, UUID.randomUUID(), "X", "open_library", id, null)).as(id)
                    .isInstanceOf(DataIntegrityViolationException.class);
        }
        for (var id : new String[] {"0", "0603", "tt1", "12345678901", "-5", "6 "}) {
            assertThatThrownBy(() -> movie(user, UUID.randomUUID(), "X", "movie", "tmdb", id)).as(id)
                    .isInstanceOf(DataIntegrityViolationException.class);
        }
        book(user, UUID.randomUUID(), "A", "open_library", "OL123456789012W", null);
        movie(user, UUID.randomUUID(), "A", "movie", "tmdb", "1234567890");
        // the format applies to provider sources only: a draft's id is free text
        book(user, UUID.randomUUID(), "B", "draft", "not an id", null);
    }

    @Test
    void aMovieDraftMustBeOfTypeMovie() {
        var user = users.create().id();

        assertThatThrownBy(() -> movie(user, UUID.randomUUID(), "X", "tv", "draft", "x"))
                .isInstanceOf(DataIntegrityViolationException.class);
        movie(user, UUID.randomUUID(), "X", "movie", "draft", "x");
    }

    @Test
    void theUniqueIndexesExist() {
        var indexes = jdbc.sql("select indexname from pg_indexes where tablename in ('books', 'movies')")
                .query(String.class).list();

        assertThat(indexes).contains("uq_books_user_isbn", "uq_books_user_source_external_id",
                "uq_movies_user_source_type_external_id");
    }

    @Test
    void ratingBoundsPerTable() {
        var user = users.create().id();

        movie(user, UUID.randomUUID(), "Ten", "movie", "tmdb", "10", "10.0");
        book(user, UUID.randomUUID(), "Five", "open_library", "OL5W", null, "5.0");

        assertThatThrownBy(() -> movie(user, UUID.randomUUID(), "Over", "movie", "tmdb", "11", "10.1"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> book(user, UUID.randomUUID(), "Over", "open_library", "OL6W", null, "5.1"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(jdbc.sql("select rating from movies where user_id = ? and title = 'Ten'").param(user)
                .query(java.math.BigDecimal.class).single()).isEqualByComparingTo("10.0");
    }

    private int count(String table, UUID user) {
        return jdbc.sql("select count(*) from " + table + " where user_id = ?").param(user).query(Integer.class).single();
    }

    private void book(UUID user, UUID id, String title, String source, String externalId, String isbn) {
        book(user, id, title, source, externalId, isbn, null);
    }

    private void book(UUID user, UUID id, String title, String source, String externalId, String isbn, String rating) {
        jdbc.sql("""
                insert into books (id, user_id, title, source, external_id, external_link, isbn, rating)
                values (?, ?, ?, ?, ?, 'https://example.org/x', ?, ?::numeric)
                """).params(id, user, title, source, externalId, isbn, rating).update();
    }

    private void movie(UUID user, UUID id, String title, String type, String source, String externalId) {
        movie(user, id, title, type, source, externalId, null);
    }

    private void movie(UUID user, UUID id, String title, String type, String source, String externalId, String rating) {
        jdbc.sql("""
                insert into movies (id, user_id, title, type, source, external_id, external_link, rating)
                values (?, ?, ?, ?, ?, ?, 'https://example.org/x', ?::numeric)
                """).params(id, user, title, type, source, externalId, rating).update();
    }
}
