package com.javanix.rwx.identity;

import static org.assertj.core.api.Assertions.assertThat;

import com.javanix.rwx.identity.internal.persistence.CredentialRepository;
import com.javanix.rwx.identity.internal.persistence.UserRepository;
import com.javanix.rwx.identity.internal.persistence.UserSettingsRepository;
import com.javanix.rwx.testkit.Api;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
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

    @Test
    void deleteRemovesEveryUserRowAndEverySessionOfThatUserOnly() {
        var f = users.two();
        var otherDevice = users.sessionFor(f.a().id());

        api.as(f.a()).delete("/api/v1/me").expect(204);

        for (var table : tablesWithUserId()) {
            assertThat(jdbc.sql("select count(*) from " + table + " where user_id = ?").param(f.a().id())
                    .query(Integer.class).single()).as(table).isZero();
        }
        assertThat(userRepository.existsById(f.a().id())).isFalse();
        assertThat(sessionsByUser.findByPrincipalName(f.a().id().toString())).isEmpty();
        api.as(f.a()).get("/api/v1/me").expect(401);
        api.as(otherDevice).get("/api/v1/me").expect(401);

        assertThat(credentials.findByUserId(f.b().id())).hasSize(1);
        assertThat(settings.findByUserId(f.b().id())).isPresent();
        api.as(f.b()).get("/api/v1/me").expect(200);
    }

    @Test
    void exportIsScopedToTheCallerAndHasNoSessionData() {
        var f = users.two();
        var export = api.as(f.a()).get("/api/v1/me/export").expect(200);

        assertThat(export.<String>json("$.user.id")).isEqualTo(f.a().id().toString());
        assertThat(export.<String>json("$.settings.userId")).isEqualTo(f.a().id().toString());
        assertThat(export.<String>json("$.settings.timeZone")).isEqualTo("Europe/Berlin");
        for (var list : new String[] {"books", "movies", "subscriptions", "licenses"}) {
            assertThat(export.<java.util.List<?>>json("$." + list)).as(list).isEmpty();
        }
        assertThat(export.body()).doesNotContain(f.b().id().toString(), f.a().sessionId())
                .doesNotContainIgnoringCase("session");
        assertThat(api.as(f.b()).get("/api/v1/me/export").<String>json("$.user.id")).isEqualTo(f.b().id().toString());
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
