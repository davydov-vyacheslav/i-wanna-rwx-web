package com.javanix.rwx.identity;

import static org.assertj.core.api.Assertions.assertThat;

import com.javanix.rwx.datasource.internal.provider.persistence.UserSourceKeyRepository;
import com.javanix.rwx.identity.internal.persistence.CredentialRepository;
import com.javanix.rwx.identity.internal.persistence.UserRepository;
import com.javanix.rwx.settings.internal.UserSettingsRepository;
import com.javanix.rwx.testkit.Api;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestKeys;
import com.javanix.rwx.testkit.TestUsers;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.session.FindByIndexNameSessionRepository;

@IntegrationTest
class AccountDataTests {

    @Autowired Api api;
    @Autowired TestUsers users;
    @Autowired JdbcClient jdbc;
    @Autowired DataSource dataSource;
    @Autowired UserRepository userRepository;
    @Autowired CredentialRepository credentials;
    @Autowired UserSettingsRepository settings;
    @Autowired FindByIndexNameSessionRepository<?> sessionsByUser;
    @Autowired UserSourceKeyRepository keys;

    private static final String SECRET_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJhY2NvdW50In0.account_secret_key_0123456789";

    @Test
    void deleteRemovesEveryUserRowAndEverySessionOfThatUserOnly() {
        var f = users.two();
        var otherDevice = users.sessionFor(f.a().id());
        for (var user : new TestUsers.TestUser[] {f.a(), f.b()}) {
            seedDataSources(user);
        }
        // not vacuous: the zero-rows assertion below runs over both tables too, and they have rows to lose
        assertThat(tablesWithUserId()).contains("user_default_sources", "user_source_keys");
        for (var user : new TestUsers.TestUser[] {f.a(), f.b()}) {
            assertThat(dataSourceRows(user)).as("seeded rows of " + user.id()).isEqualTo(3);
        }

        api.as(f.a()).delete("/api/v1/me").expect(204);

        for (var table : tablesWithUserId()) {
            assertThat(jdbc.sql("select count(*) from " + table + " where user_id = ?").param(f.a().id())
                    .query(Integer.class).single()).as(table).isZero();
        }
        assertThat(userRepository.existsById(f.a().id())).isFalse();
        assertThat(sessionsByUser.findByPrincipalName(f.a().id().toString())).isEmpty();
        api.as(f.a()).get("/api/v1/me").expect(401);
        api.as(otherDevice).get("/api/v1/me").expect(401);

        assertThat(dataSourceRows(f.b())).as("the other user's data source rows").isEqualTo(3);
        assertThat(credentials.findByUserId(f.b().id())).hasSize(1);
        assertThat(settings.findByUserId(f.b().id())).isPresent();
        api.as(f.b()).get("/api/v1/me").expect(200);
    }

    @Test
    void exportIsAnAttachmentWithADatedFileName() {
        var user = users.create();
        var res = api.as(user).get("/api/v1/me/export").expect(200);

        assertThat(res.header("Content-Disposition")).startsWith("attachment")
                .containsPattern("filename=\"rwx-export-\\d{4}-\\d{2}-\\d{2}\\.json\"");
    }

    @Test
    void exportIsScopedToTheCallerAndHasNoSessionData() {
        var f = users.two();
        var export = api.as(f.a()).get("/api/v1/me/export").expect(200);

        assertThat(export.<String>json("$.user.id")).isEqualTo(f.a().id().toString());
        assertThat(export.<String>json("$.settings.userId")).isEqualTo(f.a().id().toString());
        assertThat(export.<String>json("$.settings.timeZone")).isEqualTo("Europe/Berlin");
        assertThat(export.<List<?>>json("$.dataSources")).as("one default per type, no key")
                .extracting(d -> ((Map<?, ?>) d).get("resourceType") + "/" + ((Map<?, ?>) d).get("source"))
                .containsExactly("book/open_library", "movie/tmdb");
        assertThat(export.<List<?>>json("$.books")).isEmpty();
        assertThat(export.<List<?>>json("$.movies")).isEmpty();
        assertThat(export.body()).doesNotContain(f.b().id().toString(), f.a().sessionId())
                .doesNotContainIgnoringCase("session");
        assertThat(api.as(f.b()).get("/api/v1/me/export").<String>json("$.user.id")).isEqualTo(f.b().id().toString());
    }

    @Test
    void exportCarriesTheChosenDefaultsAndNeverAKey() {
        var f = users.two();
        seedDataSources(f.a());
        api.as(f.b()).send(HttpMethod.PUT, "/api/v1/data-sources/movie/tmdb/default", null).expect(200);

        var export = api.as(f.a()).get("/api/v1/me/export").expect(200);

        // one default per type; the movie default also holds a key, which is never exported
        assertThat(export.<List<?>>json("$.dataSources")).hasSize(2);
        assertThat(export.<String>json("$.dataSources[0].resourceType")).isEqualTo("book");
        assertThat(export.<String>json("$.dataSources[0].source")).isEqualTo("open_library");
        assertThat(export.<String>json("$.dataSources[1].resourceType")).isEqualTo("movie");
        assertThat(export.<String>json("$.dataSources[1].source")).isEqualTo("tmdb");
        assertThat(export.body()).doesNotContain(SECRET_KEY).doesNotContainIgnoringCase("apiKey");
        var other = api.as(f.b()).get("/api/v1/me/export").expect(200);
        assertThat(other.<List<?>>json("$.dataSources")).hasSize(2);
        assertThat(other.<String>json("$.dataSources[1].source")).isEqualTo("tmdb");
        assertThat(api.as(users.create()).get("/api/v1/me/export").<List<?>>json("$.dataSources")).hasSize(2);
    }

    /** A chosen default (books) and a saved key on the movie default (3 rows with the other type's default). */
    private void seedDataSources(TestUsers.TestUser user) {
        api.as(user).send(HttpMethod.PUT, "/api/v1/data-sources/book/open_library/default", null).expect(200);
        TestKeys.save(keys, user.id(), "tmdb", SECRET_KEY);
    }

    private int dataSourceRows(TestUsers.TestUser user) {
        return jdbc.sql("select (select count(*) from user_default_sources where user_id = :id) "
                + "+ (select count(*) from user_source_keys where user_id = :id)").param("id", user.id())
                .query(Integer.class).single();
    }

    private List<String> tablesWithUserId() {
        var tables = new ArrayList<String>();
        try (var connection = dataSource.getConnection();
                var columns = connection.getMetaData().getColumns(connection.getCatalog(), connection.getSchema(), "%", "user_id")) {
            while (columns.next()) {
                tables.add(columns.getString("TABLE_NAME"));
            }
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
        assertThat(tables).isNotEmpty();
        return tables;
    }
}
