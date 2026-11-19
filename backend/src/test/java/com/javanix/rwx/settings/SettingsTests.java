package com.javanix.rwx.settings;

import static org.assertj.core.api.Assertions.assertThat;

import com.javanix.rwx.settings.internal.UserSettingsRepository;
import com.javanix.rwx.testkit.Api;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;

@IntegrationTest
class SettingsTests {

    @Autowired Api api;
    @Autowired TestUsers users;
    @Autowired UserSettingsRepository repository;

    @Test
    void settingsAreScopedPerUser() {
        var f = users.two();
        var a = api.as(f.a()).get("/api/v1/settings").expect(200);
        assertThat(a.<String>json("$.userId")).isEqualTo(f.a().id().toString());
        assertThat(a.<String>json("$.timeZone")).isEqualTo("Europe/Berlin");

        var patched = api.as(f.a()).patch("/api/v1/settings", "{\"locale\":\"ru\"}").expect(200);
        assertThat(patched.<String>json("$.locale")).isEqualTo("ru");

        var b = api.as(f.b()).get("/api/v1/settings");
        assertThat(b.<String>json("$.locale")).isEqualTo("en");
        assertThat(b.<String>json("$.timeZone")).isEqualTo("Asia/Tokyo");
    }

    @Test
    void theRecordIsCreatedWithDefaultsAtSignUp() {
        var user = users.create();
        assertThat(repository.findByUserId(user.id())).isPresent();

        var settings = api.as(user).get("/api/v1/settings").expect(200);

        assertThat(settings.<String>json("$.timeZone")).isEqualTo("UTC");
        assertThat(settings.<String>json("$.locale")).isEqualTo("en");
    }

    @Test
    void theRecordKeepsTheLocaleGivenAtSignUp() {
        var user = users.create("UTC", "uk");

        assertThat(api.as(user).get("/api/v1/settings").expect(200).<String>json("$.locale")).isEqualTo("uk");
    }

    @Test
    void patchChangesZoneAndLocale() {
        var user = users.create("UTC");
        var settings = api.as(user).patch("/api/v1/settings", "{\"timeZone\":\"Europe/Kyiv\",\"locale\":\"uk\"}").expect(200);

        assertThat(settings.<String>json("$.timeZone")).isEqualTo("Europe/Kyiv");
        assertThat(settings.<String>json("$.locale")).isEqualTo("uk");
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', textBlock = """
            {"timeZone":"Mars/Base"} | invalid_timezone
            {}                       | validation
            {"locale":"de"}          | validation
            """)
    void invalidPatchIs400AndChangesNothing(String body, String code) {
        var user = users.create("Europe/Berlin");
        api.as(user).patch("/api/v1/settings", body).expectProblem(400, code);

        assertThat(api.as(user).get("/api/v1/settings").<String>json("$.timeZone")).isEqualTo("Europe/Berlin");
    }

    @Test
    void validationFailuresCarryErrorsNamingTheField() {
        var user = users.create("Europe/Berlin");

        var empty = api.as(user).patch("/api/v1/settings", "{}").expectProblem(400, "validation");
        assertThat(empty.<String>json("$.errors[0].field")).isEqualTo("body");
        assertThat(empty.<String>json("$.errors[0].message")).isNotBlank();
        var zone = api.as(user).patch("/api/v1/settings", "{\"timeZone\":\"Mars/Base\"}").expectProblem(400, "invalid_timezone");
        assertThat(zone.<String>json("$.errors[0].field")).isEqualTo("timeZone");
        // an unreadable body (enum value outside the contract) is the same problem with the same detail text
        var unreadable = api.as(user).patch("/api/v1/settings", "{\"locale\":\"de\"}").expectProblem(400, "validation");
        assertThat(unreadable.<String>json("$.detail")).isEqualTo("Invalid request.");
    }

    @Test
    void partialPatchesOfDifferentFieldsBothPersist() {
        var user = users.create("UTC");
        api.as(user).patch("/api/v1/settings", "{\"timeZone\":\"Europe/Kyiv\"}").expect(200);
        api.as(user).patch("/api/v1/settings", "{\"locale\":\"uk\"}").expect(200);

        var stored = repository.findByUserId(user.id()).orElseThrow();
        assertThat(stored.getTimezone()).isEqualTo("Europe/Kyiv");
        assertThat(stored.getLocale()).isEqualTo("uk");
    }

    @Test
    void concurrentPartialPatchesDoNotLoseEachOther() throws Exception {
        for (var round = 0; round < 10; round++) {
            var user = users.create("UTC");
            var go = new CountDownLatch(1);
            try (var pool = Executors.newFixedThreadPool(2)) {
                var zone = pool.submit(() -> {
                    go.await();
                    return api.as(user).patch("/api/v1/settings", "{\"timeZone\":\"Europe/Kyiv\"}").expect(200);
                });
                var locale = pool.submit(() -> {
                    go.await();
                    return api.as(user).patch("/api/v1/settings", "{\"locale\":\"ru\"}").expect(200);
                });
                go.countDown();
                zone.get();
                locale.get();
            }
            var stored = repository.findByUserId(user.id()).orElseThrow();
            assertThat(stored.getTimezone()).isEqualTo("Europe/Kyiv");
            assertThat(stored.getLocale()).isEqualTo("ru");
        }
    }

    @Test
    void patchUpdatedAtEqualsTheFollowingGet() {
        var user = users.create("UTC");
        var patched = api.as(user).patch("/api/v1/settings", "{\"locale\":\"en\"}").expect(200);

        assertThat(api.as(user).get("/api/v1/settings").<String>json("$.updatedAt"))
                .isEqualTo(patched.<String>json("$.updatedAt"));
    }
}
