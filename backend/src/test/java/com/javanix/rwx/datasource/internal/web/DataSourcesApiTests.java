package com.javanix.rwx.datasource.internal.web;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.client.WireMock;
import com.github.tomakehurst.wiremock.http.Fault;
import com.javanix.rwx.testkit.Api;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import com.javanix.rwx.testkit.TestUsers.TestUser;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * {@code /api/v1/data-sources} over HTTP on real Postgres, with TMDb stubbed by WireMock. The application registers
 * one source per type (Open Library for books, TMDb for movies); the two-source cases are in
 * {@code UserDataSourceServiceTests}.
 */
@IntegrationTest
@ExtendWith(OutputCaptureExtension.class)
class DataSourcesApiTests {

    private static final String BASE = "/api/v1/data-sources";
    private static final String KEY = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ0ZXN0In0.tmdb_fixture_token_0123456789";
    private static final String KEY_B = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ0ZXN0In0.tmdb_other_fixture_token_987654";

    @Autowired Api api;
    @Autowired TestUsers users;
    @Autowired JdbcClient jdbc;
    @Autowired WireMockServer provider;

    @BeforeEach
    void resetProvider() {
        provider.resetAll();
    }

    private void authentication(int status) {
        provider.stubFor(WireMock.get(urlPathEqualTo("/3/authentication")).willReturn(aResponse().withStatus(status)
                .withHeader("Content-Type", "application/json").withBody(status == 200 ? "{\"success\":true}"
                        : "{\"status_message\":\"Invalid API key: provider text\"}")));
    }

    private static String key(String value) {
        return "{\"apiKey\":\"" + value + "\"}";
    }

    private Api.Res saveKey(TestUser user, String value) {
        return api.as(user).send(HttpMethod.PUT, BASE + "/movie/tmdb/key", key(value));
    }

    private List<String> defaults(TestUser user) {
        return jdbc.sql("select resource_type || '/' || source from user_default_sources where user_id = ? "
                + "order by resource_type").param(user.id()).query(String.class).list();
    }

    /** The user's stored keys (source to key): the only place a test may read one. */
    private List<String> keys(TestUser user) {
        return jdbc.sql("select source || '=' || api_key from user_source_keys where user_id = ? order by source")
                .param(user.id()).query(String.class).list();
    }

    private static String movies(Api.Res res, String field) {
        return String.valueOf(res.<Object>json("$.movies[0]." + field));
    }

    /** Nothing was stored beyond the two default rows every user gets at sign-up. */
    private void onlySignUpDefaults(TestUser user) {
        assertThat(defaults(user)).containsExactly("book/open_library", "movie/tmdb");
        assertThat(keys(user)).isEmpty();
    }

    // ---- list

    @Test
    void aNewUserHasTheConfiguredDefaultRowsAndTheListShowsThem() {
        var user = users.create();

        var res = api.as(user).get(BASE).expect(200);

        onlySignUpDefaults(user);
        assertThat(res.<List<?>>json("$.books")).hasSize(1);
        assertThat(res.<List<?>>json("$.movies")).hasSize(1);
    }

    @Test
    void theEndpointsNeedASessionAndACsrfToken() {
        api.get(BASE).expectProblem(401, "unauthorized");
        api.send(HttpMethod.PUT, BASE + "/movie/tmdb/key", key(KEY)).expectProblem(401, "unauthorized");
        var user = users.create();
        api.as(user).noCsrf().send(HttpMethod.PUT, BASE + "/book/open_library/default", null).expectProblem(403, "csrf");
        api.as(user).noCsrf().delete(BASE + "/movie/tmdb/key").expectProblem(403, "csrf");
        onlySignUpDefaults(user);
    }

    // ---- save key

    @Test
    void aValidKeyIsValidatedAgainstTmdbStoredAndMakesTheSourceAvailable() {
        authentication(200);
        var user = users.create();

        var res = saveKey(user, KEY).expect(200);

        assertThat(movies(res, "tokenSaved")).isEqualTo("true");
        assertThat(movies(res, "available")).isEqualTo("true");
        assertThat(movies(res, "isDefault")).as("the stored default stays").isEqualTo("true");
        provider.verify(1, getRequestedFor(urlPathEqualTo("/3/authentication"))
                .withHeader("Authorization", equalTo("Bearer " + KEY)));
        assertThat(keys(user)).containsExactly("tmdb=" + KEY);
        assertThat(defaults(user)).containsExactly("book/open_library", "movie/tmdb");
        assertThat(res.body()).doesNotContain(KEY).doesNotContainIgnoringCase("apiKey\"");
        assertThat(api.as(user).get(BASE).expect(200).body()).doesNotContain(KEY);
    }

    @Test
    void saveReplacesTheKeyAndAV3KeyGoesInTheQuery() {
        authentication(200);
        var user = users.create();
        saveKey(user, KEY).expect(200);

        var v3 = "0123456789abcdef0123456789abcdef";
        saveKey(user, v3).expect(200);

        assertThat(keys(user)).containsExactly("tmdb=" + v3);
        provider.verify(getRequestedFor(urlPathEqualTo("/3/authentication")).withQueryParam("api_key", equalTo(v3)));
    }

    @Test
    void aKeyTmdbRefusesIs422WithTheSourceAndNothingIsStored() {
        authentication(401);
        var user = users.create();

        var res = saveKey(user, KEY).expectProblem(422, "source_key_rejected");

        assertThat(res.<String>json("$.source")).isEqualTo("tmdb");
        assertThat(res.body()).doesNotContain(KEY).doesNotContain("provider text");
        onlySignUpDefaults(user);
    }

    @Test
    void aRefusedReplacementKeepsTheOlderKey() {
        authentication(200);
        var user = users.create();
        saveKey(user, KEY).expect(200);
        authentication(401);

        saveKey(user, KEY_B).expectProblem(422, "source_key_rejected");

        assertThat(keys(user)).containsExactly("tmdb=" + KEY);
        assertThat(movies(api.as(user).get(BASE).expect(200), "tokenSaved")).isEqualTo("true");
    }

    @Test
    void providerFailuresStoreNothingAndNameTheSource() {
        var user = users.create();
        provider.stubFor(WireMock.get(urlPathEqualTo("/3/authentication"))
                .willReturn(aResponse().withFault(Fault.CONNECTION_RESET_BY_PEER)));
        var timeout = saveKey(user, KEY).expectProblem(504, "provider_timeout");
        assertThat(timeout.<String>json("$.source")).isEqualTo("tmdb");

        authentication(500);
        var error = saveKey(user, KEY).expectProblem(502, "provider_error");
        assertThat(error.<String>json("$.source")).isEqualTo("tmdb");

        provider.stubFor(WireMock.get(urlPathEqualTo("/3/authentication"))
                .willReturn(aResponse().withStatus(429).withHeader("Retry-After", "7")));
        var limited = saveKey(user, KEY).expectProblem(503, "provider_rate_limited");
        assertThat(limited.header("Retry-After")).isEqualTo("7");
        assertThat(limited.<String>json("$.source")).isEqualTo("tmdb");

        onlySignUpDefaults(user);
    }

    @Test
    void aKeyThatBreaksTheFormatIs400WithoutAProviderCall() {
        var user = users.create();

        for (var bad : new String[] {"short", "has spaces in it 0123456789", "bad/chars/0123456789abcdef", "", "x".repeat(513)}) {
            var res = saveKey(user, bad).expectProblem(400, "validation");
            assertThat(res.body()).doesNotContain(bad.isEmpty() ? "\u0000" : bad);
        }
        api.as(user).send(HttpMethod.PUT, BASE + "/movie/tmdb/key", "{}").expectProblem(400, "validation");

        assertThat(provider.getAllServeEvents()).isEmpty();
        onlySignUpDefaults(user);
    }

    @Test
    void theSixthSaveInAMinuteIs429() {
        var user = users.create();
        for (var i = 0; i < 5; i++) {
            saveKey(user, "short").expectProblem(400, "validation");
        }

        var res = saveKey(user, "short").expectProblem(429, "rate_limited");

        assertThat(res.header("Retry-After")).isNotBlank();
        assertThat(res.body()).doesNotContain("\"source\"");
    }

    // ---- unregistered pairs and bad path values

    @Test
    void aPairThatIsNotRegisteredOrAKeyOperationOnASourceWithoutAKeyIs404() {
        authentication(200);
        var user = users.create();
        var a = api.as(user);

        a.send(HttpMethod.PUT, BASE + "/book/open_library/key", key(KEY)).expectProblem(404, "not_found");
        a.delete(BASE + "/book/open_library/key").expectProblem(404, "not_found");
        a.send(HttpMethod.PUT, BASE + "/book/tmdb/key", key(KEY)).expectProblem(404, "not_found");
        a.delete(BASE + "/book/tmdb/key").expectProblem(404, "not_found");
        a.send(HttpMethod.PUT, BASE + "/book/tmdb/default", null).expectProblem(404, "not_found");
        a.send(HttpMethod.PUT, BASE + "/movie/open_library/default", null).expectProblem(404, "not_found");

        assertThat(provider.getAllServeEvents()).isEmpty();
        onlySignUpDefaults(user);
    }

    @Test
    void aPathValueThatIsNotAnEnumValueIs400() {
        var a = api.as(users.create());

        a.send(HttpMethod.PUT, BASE + "/movie/nope/default", null).expectProblem(400, "validation");
        a.send(HttpMethod.PUT, BASE + "/shelf/tmdb/default", null).expectProblem(400, "validation");
        a.send(HttpMethod.PUT, BASE + "/book/draft/default", null).expectProblem(400, "validation");
        a.send(HttpMethod.PUT, BASE + "/movie/nope/key", key(KEY)).expectProblem(400, "validation");
        a.delete(BASE + "/shelf/tmdb/key").expectProblem(400, "validation");
    }

    // ---- delete key

    @Test
    void deletingTheKeyOfTheChosenDefaultKeepsTheRowWithoutTheKey() {
        authentication(200);
        var user = users.create();
        saveKey(user, KEY).expect(200);

        var res = api.as(user).delete(BASE + "/movie/tmdb/key").expect(200);

        assertThat(keys(user)).isEmpty();
        assertThat(defaults(user)).contains("movie/tmdb");
        assertThat(movies(res, "isDefault")).isEqualTo("true");
        assertThat(movies(res, "available")).isEqualTo("false");
        assertThat(movies(res, "tokenSaved")).isEqualTo("false");

        // saving the key again makes the source available again (the choice was kept)
        var again = saveKey(user, KEY).expect(200);
        assertThat(movies(again, "available")).isEqualTo("true");
        assertThat(movies(again, "isDefault")).isEqualTo("true");
        assertThat(keys(user)).containsExactly("tmdb=" + KEY);
    }

    @Test
    void deletingWhenNothingIsSavedIsANoOp() {
        var user = users.create();

        var res = api.as(user).delete(BASE + "/movie/tmdb/key").expect(200);
        api.as(user).delete(BASE + "/movie/tmdb/key").expect(200);

        onlySignUpDefaults(user);
        assertThat(movies(res, "tokenSaved")).isEqualTo("false");
    }

    // ---- default

    @Test
    void choosingTheCurrentDefaultChangesNothingEvenTheSecondTime() {
        var user = users.create();

        var first = api.as(user).send(HttpMethod.PUT, BASE + "/book/open_library/default", null).expect(200);
        api.as(user).send(HttpMethod.PUT, BASE + "/book/open_library/default", null).expect(200);

        assertThat(first.<Boolean>json("$.books[0].isDefault")).isTrue();
        onlySignUpDefaults(user);
    }

    @Test
    void anUnavailableSourceCanBeTheDefault() {
        var user = users.create();

        var res = api.as(user).send(HttpMethod.PUT, BASE + "/movie/tmdb/default", null).expect(200);

        assertThat(movies(res, "isDefault")).isEqualTo("true");
        assertThat(movies(res, "available")).isEqualTo("false");
        assertThat(defaults(user)).contains("movie/tmdb");
        assertThat(keys(user)).isEmpty();
    }

    @Test
    void settingTheDefaultOfOneTypeLeavesTheOtherTypeAlone() {
        authentication(200);
        var user = users.create();
        saveKey(user, KEY).expect(200);

        api.as(user).send(HttpMethod.PUT, BASE + "/book/open_library/default", null).expect(200);

        assertThat(defaults(user)).containsExactly("book/open_library", "movie/tmdb");
        assertThat(keys(user)).containsExactly("tmdb=" + KEY);
    }

    // ---- isolation

    @Test
    void anotherUsersDefaultsAndKeysAreInvisibleAndUntouchable() {
        authentication(200);
        var f = users.two();
        api.as(f.a()).send(HttpMethod.PUT, BASE + "/book/open_library/default", null).expect(200);
        saveKey(f.a(), KEY).expect(200);
        var before = List.of(defaults(f.a()), keys(f.a()));

        // B sees none of it
        var list = api.as(f.b()).get(BASE).expect(200);
        assertThat(movies(list, "tokenSaved")).isEqualTo("false");
        assertThat(movies(list, "available")).isEqualTo("false");
        assertThat(list.body()).doesNotContain(KEY);
        onlySignUpDefaults(f.b());

        // B's operations touch B's rows only
        api.as(f.b()).delete(BASE + "/movie/tmdb/key").expect(200);
        api.as(f.b()).send(HttpMethod.PUT, BASE + "/movie/tmdb/default", null).expect(200);
        assertThat(List.of(defaults(f.a()), keys(f.a()))).isEqualTo(before);
        onlySignUpDefaults(f.b());
        assertThat(movies(api.as(f.a()).get(BASE).expect(200), "tokenSaved")).isEqualTo("true");

    }

    @Test
    void anotherUserSavingAKeyNeverReplacesOrReadsMine() {
        authentication(200);
        var f = users.two();
        saveKey(f.a(), KEY).expect(200);

        var res = saveKey(f.b(), KEY_B).expect(200);

        assertThat(res.body()).doesNotContain(KEY, KEY_B);
        assertThat(keys(f.a())).containsExactly("tmdb=" + KEY);
        assertThat(keys(f.b())).containsExactly("tmdb=" + KEY_B);
        // B's delete removes B's key only
        api.as(f.b()).delete(BASE + "/movie/tmdb/key").expect(200);
        assertThat(keys(f.a())).containsExactly("tmdb=" + KEY);
        assertThat(keys(f.b())).isEmpty();
    }

    @Test
    void theKeySaveLimitIsPerUser() {
        var f = users.two();
        for (var i = 0; i < 5; i++) {
            saveKey(f.a(), "short").expectProblem(400, "validation");
        }
        saveKey(f.a(), "short").expectProblem(429, "rate_limited");

        // B is untouched by A's exhausted bucket
        saveKey(f.b(), "short").expectProblem(400, "validation");
    }

    // ---- the key never leaves

    @Test
    void theKeyIsInNoResponseLogLineExceptionOrEntityText(CapturedOutput output) {
        var user = users.create();
        authentication(200);
        var bodies = new StringBuilder();
        bodies.append(saveKey(user, KEY).expect(200).body());
        bodies.append(api.as(user).get(BASE).expect(200).body());
        bodies.append(api.as(user).send(HttpMethod.PUT, BASE + "/movie/tmdb/default", null).expect(200).body());
        authentication(401);
        bodies.append(saveKey(user, KEY_B).expectProblem(422, "source_key_rejected").body());
        provider.stubFor(WireMock.get(urlPathEqualTo("/3/authentication"))
                .willReturn(aResponse().withFault(Fault.CONNECTION_RESET_BY_PEER)));
        bodies.append(saveKey(user, KEY_B).expectProblem(504, "provider_timeout").body());
        bodies.append(saveKey(user, "bad key").expectProblem(400, "validation").body());
        bodies.append(api.as(user).delete(BASE + "/movie/tmdb/key").expect(200).body());

        assertThat(bodies.toString()).doesNotContain(KEY, KEY_B);
        assertThat(output.getAll()).doesNotContain(KEY, KEY_B);
    }
}
