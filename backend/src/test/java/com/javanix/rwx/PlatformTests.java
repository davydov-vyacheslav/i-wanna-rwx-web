package com.javanix.rwx;

import static org.assertj.core.api.Assertions.assertThat;

import com.javanix.rwx.testkit.Api;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.flywaydb.core.Flyway;

import org.springframework.modulith.core.ApplicationModules;

/** Schema, static assets, probes and module boundaries. SPA fixture: src/test/resources/static/index.html. */
@IntegrationTest
class PlatformTests {

    @Autowired Api api;
    @Autowired TestUsers users;
    @Autowired Flyway flyway;
    @Autowired DataSource dataSource;

    @Test
    void modulesAreWellFormed() {
        ApplicationModules.of(RwxApplication.class).verify();
    }

    // a loaded context also means ddl-auto=validate passed
    @Test
    void baselineMigrationAndSessionTablesExist() throws Exception {
        var current = flyway.info().current();
        assertThat(current.getVersion().getVersion()).isEqualTo("001");
        assertThat(current.getState().isApplied()).isTrue();
        assertThat(current.getState().isFailed()).isFalse();

        try (var connection = dataSource.getConnection()) {
            for (var table : new String[] {"spring_session", "spring_session_attributes"}) {
                try (var found = connection.getMetaData().getTables(connection.getCatalog(), connection.getSchema(), table, null)) {
                    assertThat(found.next()).as(table).isTrue();
                }
            }
        }
    }

    @Test
    void v001SessionDdlMatchesSpringSessionJdbc() throws Exception {
        var v001 = normalize(read("db/migration/V001__initial_schema.sql"));
        for (var statement : normalize(read("org/springframework/session/jdbc/schema-postgresql.sql")).split(";")) {
            assertThat(v001).contains(statement.strip());
        }
    }

    @Test
    void unknownApiPathIsProblem404() {
        api.as(users.create()).get("/api/v1/nope").expectProblem(404, null);
    }

    @Test
    void spaFallbackServesIndexHtml() {
        var deepLink = api.get("/media/42").expect(200);
        assertThat(deepLink.header("Cache-Control")).isEqualTo("no-cache");
        assertThat(deepLink.body()).contains("rwx test");
        assertThat(api.get("/index.html").expect(200).body()).contains("rwx test");
        // Boot forwards "/" to index.html; MockMvc does not follow forwards
        assertThat(api.get("/").expect(200).raw().getForwardedUrl()).isEqualTo("index.html");
    }

    @ParameterizedTest
    @ValueSource(strings = {"/sw.js", "/manifest.webmanifest", "/icon-512.png"})
    void pwaFilesAreServedUnauthenticatedAndRevalidated(String path) {
        var response = api.get(path).expect(200);
        assertThat(response.header("Cache-Control")).isEqualTo("no-cache");
        assertThat(response.body()).doesNotContain("rwx test");
    }

    @Test
    void oauthPathsAreNotTheSpaFallback() {
        // answered by Spring Security (redirect to GitHub), never index.html
        assertThat(api.get("/oauth2/authorization/github").raw().getStatus()).isEqualTo(302);
    }

    @Test
    void contentSecurityPolicyIsOnPagesApiAndNotFound() {
        var user = api.as(users.create());
        var expected = new String[] {"img-src 'self' data: https://covers.openlibrary.org https://archive.org "
                + "https://*.archive.org https://image.tmdb.org https://avatars.githubusercontent.com",
                "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'"};
        for (var response : new Api.Res[] {api.get("/media/42"), user.get("/api/v1/me"), user.get("/api/v1/nope")}) {
            assertThat(response.header("Content-Security-Policy")).contains(expected);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "/liveness", "/readiness"})
    void healthProbesArePublicAndUp(String probe) {
        assertThat(api.get("/actuator/health" + probe).expect(200).<String>json("$.status")).isEqualTo("UP");
    }

    @Test
    void csrfCookieIsReadableByScript() {
        var cookie = api.get("/").cookie("XSRF-TOKEN");
        assertThat(cookie).isNotNull();
        assertThat(cookie.isHttpOnly()).isFalse();
    }

    private static String read(String path) throws Exception {
        return new ClassPathResource(path).getContentAsString(StandardCharsets.UTF_8);
    }

    private static String normalize(String sql) {
        return Pattern.compile("--[^\\n]*").matcher(sql).replaceAll("").replaceAll("\\s+", " ")
                .replace("( ", "(").replace(" )", ")").toLowerCase();
    }
}
