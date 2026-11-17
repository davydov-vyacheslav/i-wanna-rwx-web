package com.javanix.rwx.identity;

import static org.assertj.core.api.Assertions.assertThat;

import com.javanix.rwx.testkit.Api;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.event.ApplicationEvents;

@IntegrationTest
class MeTests {

    @Autowired Api api;
    @Autowired TestUsers users;
    @Autowired ApplicationEvents events;

    @Test
    void meIsPerUserAndHasNoAuthMode() {
        var f = users.two();
        var a = api.as(f.a()).get("/api/v1/me").expect(200);

        assertThat(a.<String>json("$.id")).isEqualTo(f.a().id().toString());
        assertThat(a.<String>json("$.displayName")).isEqualTo("Name " + f.a().id());
        assertThat(a.<String>json("$.timeZone")).isEqualTo("Europe/Berlin");
        assertThat(a.body()).doesNotContain("authMode");
        assertThat(api.as(f.b()).get("/api/v1/me").<String>json("$.id")).isEqualTo(f.b().id().toString());
    }

    @Test
    void patchChangesZoneAndPublishesEventOnlyOnChange() {
        var user = users.create("UTC");
        var me = api.as(user).patch("/api/v1/me", "{\"timeZone\":\"Europe/Kyiv\",\"locale\":\"uk\"}").expect(200);

        assertThat(me.<String>json("$.timeZone")).isEqualTo("Europe/Kyiv");
        assertThat(me.<String>json("$.locale")).isEqualTo("uk");
        assertThat(zoneEvents(user.id())).isEqualTo(1);

        api.as(user).patch("/api/v1/me", "{\"timeZone\":\"Europe/Kyiv\"}").expect(200);
        assertThat(zoneEvents(user.id())).isEqualTo(1);
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', textBlock = """
            {"timeZone":"Mars/Base"} | invalid_timezone
            {}                       | validation
            {"locale":"de"}          | validation
            """)
    void invalidPatchIs400AndChangesNothing(String body, String code) {
        var user = users.create("Europe/Berlin");
        api.as(user).patch("/api/v1/me", body).expectProblem(400, code);

        assertThat(api.as(user).get("/api/v1/me").<String>json("$.timeZone")).isEqualTo("Europe/Berlin");
        assertThat(zoneEvents(user.id())).isZero();
    }

    @Test
    void settingsAreScopedPerUser() {
        var f = users.two();
        var a = api.as(f.a()).get("/api/v1/settings").expect(200);
        assertThat(a.<String>json("$.userId")).isEqualTo(f.a().id().toString());
        assertThat(a.<String>json("$.timeZone")).isEqualTo("Europe/Berlin");
        assertThat(a.<Boolean>json("$.pushNotificationsEnabled")).isTrue();

        var patched = api.as(f.a()).patch("/api/v1/settings", "{\"pushNotificationsEnabled\":false}").expect(200);
        assertThat(patched.<Boolean>json("$.pushNotificationsEnabled")).isFalse();

        var b = api.as(f.b()).get("/api/v1/settings");
        assertThat(b.<Boolean>json("$.pushNotificationsEnabled")).isTrue();
        assertThat(b.<String>json("$.timeZone")).isEqualTo("Asia/Tokyo");
    }

    private long zoneEvents(java.util.UUID userId) {
        return events.stream(UserTimezoneChangedEvent.class).filter(e -> e.userId().equals(userId)).count();
    }
}
