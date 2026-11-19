package com.javanix.rwx;

import com.javanix.rwx.testkit.Api;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

@IntegrationTest
class SecurityTests {

    @Autowired Api api;
    @Autowired TestUsers users;

    @ParameterizedTest
    @CsvSource({"GET,/api/v1/me", "DELETE,/api/v1/me", "GET,/api/v1/me/export",
            "GET,/api/v1/settings", "PATCH,/api/v1/settings"})
    void anonymousIsProblem401(String method, String path) {
        api.send(HttpMethod.valueOf(method), path, "{}").expectProblem(401, "unauthorized");
    }

    @ParameterizedTest
    @CsvSource({"POST,/api/v1/auth/logout", "DELETE,/api/v1/me", "PATCH,/api/v1/settings"})
    void mutationWithoutCsrfTokenIsProblem403AndChangesNothing(String method, String path) {
        var user = users.create();
        api.as(user).noCsrf().send(HttpMethod.valueOf(method), path, "{}").expectProblem(403, "csrf");
        api.as(user).get("/api/v1/me").expect(200);
    }

    @Test
    void csrfIsCheckedBeforeAuthentication() {
        api.noCsrf().send(HttpMethod.PUT, "/api/v1/data-sources/movie/tmdb/default", null).expectProblem(403, "csrf");
    }

    @Test
    void logoutInvalidatesSessionAndIsIdempotent() {
        var user = users.create();
        api.as(user).post("/api/v1/auth/logout").expect(204);
        api.as(user).get("/api/v1/me").expectProblem(401, null);
        api.as(user).post("/api/v1/auth/logout").expect(204);
        api.noCsrf().post("/api/v1/auth/logout").expect(204);
    }
}
