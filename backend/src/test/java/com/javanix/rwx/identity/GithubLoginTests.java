package com.javanix.rwx.identity;

import static org.assertj.core.api.Assertions.assertThat;

import com.javanix.rwx.identity.internal.persistence.CredentialRepository;
import com.javanix.rwx.testkit.Api;
import com.javanix.rwx.testkit.Api.Res;
import com.javanix.rwx.testkit.GithubStub;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import jakarta.servlet.http.Cookie;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.Arrays;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.session.SessionRepository;
import org.springframework.web.util.UriUtils;

@IntegrationTest
@ExtendWith(OutputCaptureExtension.class)
class GithubLoginTests {

    static final String CALLBACK = "/api/v1/auth/github/callback?";
    @Autowired Api api;
    @Autowired TestUsers users;
    @Autowired SessionRepository<?> sessions;
    @Autowired CredentialRepository credentials;
    @Autowired GithubStub github;

    record Started(Cookie session, String state) {
    }

    @AfterEach
    void resetStub() {
        github.failTokenEndpoint = false;
        setGithubUserDisabled(false);
    }

    @Test
    void loginIssuesFreshSessionAndReusesTheUser() {
        var started = start();
        github.issueCode("c1");
        var done = callback(started, "code=c1&state=" + started.state()).expect(302);
        var fresh = done.cookie("SESSION");

        assertThat(done.header("Location")).isEqualTo("/");
        assertThat(fresh.getValue()).as("session fixation").isNotEqualTo(started.session().getValue());
        var me = api.withCookie(fresh).get("/api/v1/me").expect(200);
        api.withCookie(started.session()).get("/api/v1/me").expect(401);

        var again = api.withCookie(login().cookie("SESSION")).get("/api/v1/me").expect(200);
        assertThat(again.<String>json("$.id")).isEqualTo(me.<String>json("$.id"));
        assertThat(credentials.findByTypeAndExternalId("github", GithubStub.GITHUB_ID)).isPresent();
    }

    @Test
    void sessionIsShortLivedBeforeLoginAndFullTtlAfterwards() {
        var started = start();
        assertThat(maxInactive(started.session())).isEqualTo(600);

        github.issueCode("c2");
        var done = callback(started, "code=c2&state=" + started.state()).expect(302);

        assertThat(maxInactive(done.cookie("SESSION"))).isEqualTo(30 * 24 * 3600);
        assertThat(done.setCookie("SESSION")).contains("HttpOnly", "SameSite=Lax", "Max-Age=2592000");
    }

    @ParameterizedTest
    @ValueSource(strings = {"code=ok&state=forged", "code=never-issued&state={state}", "error=access_denied&state={state}"})
    void badCallbackIsGenericFailureAndStartsNoSession(String query) {
        var started = start();
        github.issueCode("ok");

        assertFailed(callback(started, query.replace("{state}", started.state())));
        api.withCookie(started.session()).get("/api/v1/me").expect(401);
    }

    @Test
    void callbackWithoutPreAuthSessionFails() {
        assertFailed(api.get(CALLBACK + "code=x&state=y"));
    }

    @Test
    void stateIsSingleUse() {
        var started = start();
        github.issueCode("c3");
        var query = "code=c3&state=" + started.state();
        callback(started, query).expect(302);
        assertFailed(callback(started, query));
    }

    @Test
    void providerFailureFails() {
        var started = start();
        github.issueCode("c4");
        github.failTokenEndpoint = true;
        assertFailed(callback(started, "code=c4&state=" + started.state()));
    }

    @Test
    void disabledAccountFails() {
        login().expect(302);
        setGithubUserDisabled(true);
        assertFailed(login());
    }

    @Test
    void forgedCallbackNeverEndsASignedInSession() {
        var user = users.create();
        api.as(user).get(CALLBACK + "state=x").expect(302);
        api.as(user).get(CALLBACK + "error=access_denied");
        api.as(user).get("/api/v1/me").expect(200);
    }

    @Test
    void accessTokenIsNeverLoggedOrStored(CapturedOutput output) {
        var fresh = login().expect(302).cookie("SESSION");

        assertThat(output.getAll()).doesNotContain(GithubStub.ACCESS_TOKEN, "test-secret");
        var session = sessions.findById(sessionId(fresh));
        assertThat(session).isNotNull();
        for (var name : session.getAttributeNames()) {
            assertThat(String.valueOf(session.<Object>getAttribute(name))).as(name).doesNotContain("gho_");
        }
        assertThat(credentials.findAll()).noneMatch(c -> String.valueOf(c.getData()).contains("gho_"));
    }

    private Started start() {
        var res = api.get("/oauth2/authorization/github").expect(302);
        var location = URI.create(res.header("Location"));
        var query = Arrays.stream(location.getRawQuery().split("&")).map(p -> p.split("=", 2))
                .collect(Collectors.toMap(p -> p[0], p -> UriUtils.decode(p[1], StandardCharsets.UTF_8)));
        assertThat(location.getPath()).isEqualTo("/login/oauth/authorize");
        assertThat(query).containsEntry("client_id", "test-client").containsEntry("scope", "read:user")
                .containsKey("redirect_uri")
                .containsEntry("code_challenge_method", "S256"); // Spring Security 7 adds PKCE even for confidential clients
        return new Started(res.cookie("SESSION"), query.get("state"));
    }

    private Res callback(Started started, String query) {
        return api.withCookie(started.session()).get(CALLBACK + query);
    }

    private Res login() {
        var started = start();
        var code = UUID.randomUUID().toString();
        github.issueCode(code);
        return callback(started, "code=" + code + "&state=" + started.state());
    }

    // a failed login may expire the pre-auth cookie, but must never set a live one
    private static void assertFailed(Res res) {
        res.expect(302);
        assertThat(res.header("Location")).isEqualTo("/login?error");
        var cookie = res.cookie("SESSION");
        assertThat(cookie == null || cookie.getMaxAge() == 0).as("no live SESSION cookie").isTrue();
    }

    private int maxInactive(Cookie session) {
        return (int) sessions.findById(sessionId(session)).getMaxInactiveInterval().toSeconds();
    }

    private static String sessionId(Cookie session) {
        return new String(Base64.getDecoder().decode(session.getValue()), StandardCharsets.UTF_8);
    }

    private void setGithubUserDisabled(boolean disabled) {
        credentials.findByTypeAndExternalId("github", GithubStub.GITHUB_ID)
                .ifPresent(c -> users.setDisabled(c.getUserId(), disabled));
    }
}
