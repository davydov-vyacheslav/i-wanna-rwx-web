package com.javanix.rwx.testkit;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.json.JsonMapper;

/** Stand-in for github.com (token endpoint) and api.github.com (/user). Checks client secret and one-time codes. */
public class GithubStub {

    public static final String ACCESS_TOKEN = "gho_stubbed_secret_token_value";
    public static final String GITHUB_ID = "4242";

    private static final String BASIC = "Basic "
            + Base64.getEncoder().encodeToString("test-client:test-secret".getBytes(StandardCharsets.UTF_8));

    record TokenResponse(String accessToken, String tokenType) {
    }

    record ErrorResponse(String error) {
    }

    record GithubUser(long id, String login, String name, String avatarUrl) {
    }

    private static final JsonMapper JSON = JsonMapper.builder()
            .propertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE).build();

    private final HttpServer server;
    private final Set<String> codes = ConcurrentHashMap.newKeySet();
    public volatile boolean failTokenEndpoint;

    GithubStub() {
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        server.createContext("/login/oauth/access_token", this::token);
        server.createContext("/user", this::user);
        server.start();
    }

    String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    void stop() {
        server.stop(0);
    }

    public void issueCode(String code) {
        codes.add(code);
    }

    private void token(HttpExchange ex) throws IOException {
        if (failTokenEndpoint) {
            reply(ex, 502, Map.of());
            return;
        }
        var form = UriComponentsBuilder.newInstance()
                .query(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)).build().getQueryParams();
        var ok = codes.remove(form.getFirst("code")) && BASIC.equals(ex.getRequestHeaders().getFirst("Authorization"));
        reply(ex, 200, ok ? new TokenResponse(ACCESS_TOKEN, "bearer") : new ErrorResponse("bad_verification_code"));
    }

    private void user(HttpExchange ex) throws IOException {
        var ok = ("Bearer " + ACCESS_TOKEN).equals(ex.getRequestHeaders().getFirst("Authorization"));
        reply(ex, ok ? 200 : 401, ok
                ? new GithubUser(Long.parseLong(GITHUB_ID), "octo", "Octo Cat", "https://a/x.png") : Map.of());
    }

    private static void reply(HttpExchange ex, int status, Object body) throws IOException {
        var bytes = JSON.writeValueAsBytes(body);
        ex.getResponseHeaders().add("Content-Type", "application/json");
        ex.sendResponseHeaders(status, bytes.length);
        ex.getResponseBody().write(bytes);
        ex.close();
    }
}
