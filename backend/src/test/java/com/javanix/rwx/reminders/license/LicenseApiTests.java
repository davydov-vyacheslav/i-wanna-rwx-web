package com.javanix.rwx.reminders.license;

import static org.assertj.core.api.Assertions.assertThat;

import com.javanix.rwx.testkit.Api;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.simple.JdbcClient;

/** What licenses add to the shared reminder behaviour: the plaintext key. Everything else is in the common tests. */
@IntegrationTest
@ExtendWith(OutputCaptureExtension.class)
class LicenseApiTests {

    private static final String PATH = "/api/v1/licenses";
    private static final String KEY = "AAAA-BBBB-SECRET-KEY-1234";

    @Autowired Api api;
    @Autowired TestUsers users;
    @Autowired JdbcClient jdbc;

    private static String body(UUID id, String extra) {
        return "{\"id\":\"" + id + "\",\"name\":\"IDE\",\"renewalPattern\":\"monthly\",\"remindDays\":3,"
                + "\"expiryDate\":\"2026-03-15\"" + extra + "}";
    }

    private UUID createWithKey(TestUsers.TestUser user) {
        var id = UUID.randomUUID();
        api.as(user).send(HttpMethod.POST, PATH, body(id, ",\"licenseKey\":\"" + KEY + "\"")).expect(201);
        return id;
    }

    private String storedKey(UUID user, UUID id) {
        return jdbc.sql("select license_key from licenses where user_id = ? and id = ?").param(user).param(id)
                .query(String.class).optional().orElse(null);
    }

    @Test
    void theKeyIsReturnedOnCreateGetListAndExport() {
        var user = users.create();
        var id = UUID.randomUUID();

        var created = api.as(user).send(HttpMethod.POST, PATH, body(id, ",\"licenseKey\":\"" + KEY + "\"")).expect(201);

        assertThat(created.<String>json("$.licenseKey")).isEqualTo(KEY);
        assertThat(api.as(user).get(PATH + "/" + id).expect(200).<String>json("$.licenseKey")).isEqualTo(KEY);
        assertThat(api.as(user).get(PATH).expect(200).<List<String>>json("$[*].licenseKey")).containsExactly(KEY);
        assertThat(api.as(user).get("/api/v1/me/export").expect(200).<List<String>>json("$.licenses[*].licenseKey"))
                .containsExactly(KEY);
    }

    @Test
    void aBlankKeyOnCreateStoresNone() {
        var user = users.create();
        var id = UUID.randomUUID();

        var created = api.as(user).send(HttpMethod.POST, PATH, body(id, ",\"licenseKey\":\"  \"")).expect(201);

        assertThat(created.<Object>json("$.licenseKey")).isNull();
        assertThat(storedKey(user.id(), id)).isNull();
    }

    @Test
    void patchKeepsReplacesAndClearsTheKey() {
        var user = users.create();
        var id = createWithKey(user);
        var url = PATH + "/" + id;

        var renamed = api.as(user).patch(url, "{\"name\":\"Other\"}").expect(200);
        assertThat(renamed.<String>json("$.licenseKey")).isEqualTo(KEY);

        var replaced = api.as(user).patch(url, "{\"licenseKey\":\"NEW-KEY\"}").expect(200);
        assertThat(replaced.<String>json("$.licenseKey")).isEqualTo("NEW-KEY");
        assertThat(replaced.<Integer>json("$.version")).isEqualTo(3);

        var same = api.as(user).patch(url, "{\"licenseKey\":\"NEW-KEY\"}").expect(200);
        assertThat(same.<Integer>json("$.version")).isEqualTo(3);

        var cleared = api.as(user).patch(url, "{\"licenseKey\":\"\"}").expect(200);
        assertThat(cleared.<Object>json("$.licenseKey")).isNull();
        assertThat(cleared.<Integer>json("$.version")).isEqualTo(4);
        assertThat(storedKey(user.id(), id)).isNull();
    }

    @Test
    void renewKeepsTheKey() {
        var user = users.create();
        var id = createWithKey(user);

        var renewed = api.as(user).send(HttpMethod.POST, PATH + "/" + id + "/renew",
                "{\"expectedExpiryDate\":\"2026-03-15\"}").expect(200);

        assertThat(renewed.<String>json("$.licenseKey")).isEqualTo(KEY);
        assertThat(renewed.<String>json("$.expiryDate")).isEqualTo("2026-04-15");
    }

    @Test
    void deleteRemovesTheKeyFromTheRow() {
        var user = users.create();
        var id = createWithKey(user);

        api.as(user).delete(PATH + "/" + id).expect(204);

        assertThat(storedKey(user.id(), id)).isNull();
    }

    @Test
    void theKeyIsInNeitherAProblemBodyNorTheLogs(CapturedOutput output) {
        var user = users.create();
        var id = createWithKey(user);
        var invalid = "{\"id\":\"" + UUID.randomUUID() + "\",\"name\":\"IDE\",\"renewalPattern\":\"yearly\","
                + "\"remindDays\":3,\"licenseKey\":\"" + KEY + "\"}";

        var problem = api.as(user).send(HttpMethod.POST, PATH, invalid).expectProblem(400, "validation");
        var tooLong = api.as(user).send(HttpMethod.POST, PATH, body(UUID.randomUUID(),
                ",\"licenseKey\":\"" + KEY + "x".repeat(10000) + "\",\"remindDays\":99")).expect(400);
        api.as(user).patch(PATH + "/" + id, "{\"renewalPattern\":\"lifetime\",\"licenseKey\":\"" + KEY + "\"}")
                .expect(200);

        assertThat(problem.body()).doesNotContain(KEY);
        assertThat(tooLong.body()).doesNotContain(KEY);
        assertThat(output.getAll()).doesNotContain(KEY);
    }
}
