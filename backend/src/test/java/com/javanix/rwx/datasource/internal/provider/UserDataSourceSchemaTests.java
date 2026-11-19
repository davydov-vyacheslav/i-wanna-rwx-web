package com.javanix.rwx.datasource.internal.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

/** The rules V001 puts on {@code user_default_sources} and {@code user_source_keys}, asserted directly with SQL. */
@IntegrationTest
class UserDataSourceSchemaTests {

    @Autowired JdbcClient jdbc;
    @Autowired TestUsers users;

    private void insertDefault(UUID user, String type, String source) {
        jdbc.sql("insert into user_default_sources (user_id, resource_type, source) values (?, ?, ?)")
                .param(user).param(type).param(source).update();
    }

    private void insertKey(UUID user, String source, String key) {
        jdbc.sql("insert into user_source_keys (user_id, source, api_key) values (?, ?, ?)")
                .param(user).param(source).param(key).update();
    }

    @Test
    void aSecondDefaultOfOneUserAndTypeIsImpossible() {
        var user = users.createWithoutDefaults().id();
        insertDefault(user, "movie", "tmdb");

        assertThatThrownBy(() -> insertDefault(user, "movie", "tmdb")).hasMessageContaining("user_default_sources_pkey");
        // another type and another user are fine
        insertDefault(user, "book", "open_library");
        insertDefault(users.createWithoutDefaults().id(), "movie", "tmdb");
    }

    @Test
    void onlyTheRegisteredPairsCanBeADefault() {
        var user = users.createWithoutDefaults().id();

        assertThatThrownBy(() -> insertDefault(user, "book", "tmdb")).hasMessageContaining("valid_user_default_source");
        assertThatThrownBy(() -> insertDefault(user, "movie", "open_library")).hasMessageContaining("valid_user_default_source");
        assertThatThrownBy(() -> insertDefault(user, "movie", "draft")).hasMessageContaining("valid_user_default_source");
        assertThatThrownBy(() -> insertDefault(user, "shelf", "tmdb")).hasMessageContaining("valid_user_default_source");
    }

    @Test
    void aKeyIsOnePerUserAndSourceAndOnlyForASourceThatNeedsOne() {
        var user = users.createWithoutDefaults().id();
        insertKey(user, "tmdb", "k".repeat(20));

        assertThatThrownBy(() -> insertKey(user, "tmdb", "k".repeat(20))).hasMessageContaining("user_source_keys_pkey");
        assertThatThrownBy(() -> insertKey(user, "open_library", "k".repeat(20))).hasMessageContaining("user_source_keys_source_check");
        insertKey(users.createWithoutDefaults().id(), "tmdb", "k".repeat(20));
    }

    @Test
    void theKeyIsRequiredAndItsLengthBounded() {
        var user = users.createWithoutDefaults().id();

        assertThatThrownBy(() -> insertKey(user, "tmdb", null)).hasMessageContaining("api_key");
        assertThatThrownBy(() -> insertKey(user, "tmdb", "")).hasMessageContaining("user_source_keys_api_key_check");
        assertThatThrownBy(() -> insertKey(user, "tmdb", "k".repeat(513))).hasMessageContaining("user_source_keys_api_key_check");
        insertKey(user, "tmdb", "k".repeat(512));
    }

    @Test
    void rowsOfBothTablesGoWithTheirUser() {
        var user = users.createWithoutDefaults().id();
        insertDefault(user, "book", "open_library");
        insertKey(user, "tmdb", "k".repeat(20));

        jdbc.sql("delete from users where id = ?").param(user).update();

        assertThat(jdbc.sql("select (select count(*) from user_default_sources where user_id = :id) "
                + "+ (select count(*) from user_source_keys where user_id = :id)").param("id", user)
                .query(Integer.class).single()).isZero();
    }

    @Test
    void theOldTablesAreGoneAndTheNewOnesAreDocumented() {
        assertThat(jdbc.sql("select to_regclass('user_data_sources')::text").query(String.class).optional()).isEmpty();
        assertThat(jdbc.sql("select to_regclass('external_data_source_configuration')::text").query(String.class)
                .optional()).isEmpty();
        for (var table : new String[] {"user_default_sources", "user_source_keys"}) {
            assertThat(jdbc.sql("select obj_description(?::regclass)").param(table).query(String.class).single())
                    .as(table).isNotBlank();
        }
    }
}
