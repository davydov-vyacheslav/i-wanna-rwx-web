package com.javanix.rwx.identity;

import static org.assertj.core.api.Assertions.assertThat;

import com.javanix.rwx.testkit.Api;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@IntegrationTest
class MeTests {

    @Autowired Api api;
    @Autowired TestUsers users;

    @Test
    void meIsPerUserAndHasNoAuthMode() {
        var f = users.two();
        var a = api.as(f.a()).get("/api/v1/me").expect(200);

        assertThat(a.<String>json("$.id")).isEqualTo(f.a().id().toString());
        assertThat(a.<String>json("$.displayName")).isEqualTo("Name " + f.a().id());
        assertThat(a.body()).doesNotContain("authMode").doesNotContain("timeZone").doesNotContain("locale");
        assertThat(api.as(f.b()).get("/api/v1/me").<String>json("$.id")).isEqualTo(f.b().id().toString());
    }
}
