package com.javanix.rwx.reminders.common;

import static org.assertj.core.api.Assertions.assertThat;

import com.javanix.rwx.testkit.Api;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.Parameter;
import org.junit.jupiter.params.ParameterizedClass;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

/** Every status of the contract over HTTP, once per reminder type; the rules behind them are in the service tests. */
@IntegrationTest
@ParameterizedClass
@ValueSource(strings = {"subscriptions", "licenses"})
class ReminderApiTests {

    @Parameter String type;

    @Autowired Api api;
    @Autowired TestUsers users;
    @Autowired JdbcClient jdbc;

    private static String body(UUID id, String pattern, String expiry, String extra) {
        return "{\"id\":\"" + id + "\",\"name\":\"Netflix\",\"renewalPattern\":\"" + pattern + "\",\"remindDays\":3"
                + (expiry == null ? "" : ",\"expiryDate\":\"" + expiry + "\"") + extra + "}";
    }

    private String path() {
        return "/api/v1/" + type;
    }

    private Api.Res create(TestUsers.TestUser user, UUID id, String pattern, String expiry) {
        return api.as(user).send(org.springframework.http.HttpMethod.POST, path(), body(id, pattern, expiry, ""));
    }

    private static String renewBody(String expected) {
        return "{\"expectedExpiryDate\":\"" + expected + "\"}";
    }

    @Test
    void createIs201AndAReplayOfALiveIdIs200WithTheStoredRecord() {
        var user = users.create();
        var id = UUID.randomUUID();

        var first = create(user, id, "monthly", "2026-03-15").expect(201);
        var replay = api.as(user).send(org.springframework.http.HttpMethod.POST, path(),
                body(id, "yearly", "2030-01-01", ",\"cost\":\"x\"")).expect(200);

        assertThat(first.<String>json("$.userId")).isEqualTo(user.id().toString());
        assertThat(first.<Integer>json("$.version")).isEqualTo(1);
        assertThat(replay.<String>json("$.renewalPattern")).isEqualTo("monthly");
        assertThat(replay.<String>json("$.expiryDate")).isEqualTo("2026-03-15");
    }

    @Test
    void lifetimeHasNoExpiryAndAnythingElseWithoutOneIs400() {
        var user = users.create();

        var lifetime = create(user, UUID.randomUUID(), "lifetime", null).expect(201);
        assertThat(lifetime.<Object>json("$.expiryDate")).isNull();
        create(user, UUID.randomUUID(), "yearly", null).expectProblem(400, "validation");
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 15})
    void remindDaysOutsideOneToFourteenAre400(int days) {
        var user = users.create();
        var json = body(UUID.randomUUID(), "monthly", "2026-03-15", "").replace("\"remindDays\":3", "\"remindDays\":" + days);

        api.as(user).send(org.springframework.http.HttpMethod.POST, path(), json).expectProblem(400, "validation");
    }

    @Test
    void customNeedsPositiveDaysAndOnlyCustomKeepsThem() {
        var user = users.create();
        create(user, UUID.randomUUID(), "custom", "2026-03-15").expectProblem(400, "validation");

        var custom = api.as(user).send(org.springframework.http.HttpMethod.POST, path(),
                body(UUID.randomUUID(), "custom", "2026-03-15", ",\"customRenewalDays\":45")).expect(201);
        assertThat(custom.<Integer>json("$.customRenewalDays")).isEqualTo(45);
        var id = custom.<String>json("$.id");
        var patched = api.as(user).patch(path() + "/" + id, "{\"renewalPattern\":\"monthly\"}").expect(200);
        assertThat(patched.<Object>json("$.customRenewalDays")).isNull();
    }

    @Test
    void patchChangesTheGivenFieldsAndRejectsInvalidOnes() {
        var user = users.create();
        var id = UUID.randomUUID();
        create(user, id, "monthly", "2026-03-15").expect(201);

        var patched = api.as(user).patch(path() + "/" + id, "{\"name\":\"Hulu\"}").expect(200);
        assertThat(patched.<String>json("$.name")).isEqualTo("Hulu");
        assertThat(patched.<Integer>json("$.version")).isEqualTo(2);
        api.as(user).patch(path() + "/" + id, "{\"remindDays\":15}").expectProblem(400, "validation");
        assertThat(api.as(user).get(path() + "/" + id).expect(200).<String>json("$.name")).isEqualTo("Hulu");
    }

    @Test
    void anEmptyPatchIs200AndChangesNothing() {
        var user = users.create();
        var id = UUID.randomUUID();
        var created = create(user, id, "monthly", "2026-03-15").expect(201);

        var patched = api.as(user).patch(path() + "/" + id, "{}").expect(200);

        assertThat(patched.<Integer>json("$.version")).isEqualTo(created.<Integer>json("$.version"));
        assertThat(patched.<String>json("$.updatedAt")).isEqualTo(created.<String>json("$.updatedAt"));
    }

    @Test
    void aForeignOrUnknownIdIs404ForEveryOperationAndTheOwnerIsUntouched() {
        var f = users.two();
        var id = UUID.randomUUID();
        create(f.a(), id, "monthly", "2026-03-15").expect(201);
        var url = path() + "/" + id;

        api.as(f.b()).get(url).expectNotFound();
        api.as(f.b()).patch(url, "{\"name\":\"x\"}").expectNotFound();
        api.as(f.b()).delete(url).expectNotFound();
        api.as(f.b()).send(org.springframework.http.HttpMethod.POST, url + "/renew", renewBody("2026-03-15")).expectNotFound();
        api.as(f.b()).get(path() + "/" + UUID.randomUUID()).expectNotFound();

        var after = api.as(f.a()).get(url).expect(200);
        assertThat(after.<Integer>json("$.version")).isEqualTo(1);
        assertThat(after.<String>json("$.expiryDate")).isEqualTo("2026-03-15");
        assertThat(api.as(f.b()).get(path()).expect(200).<List<?>>json("$")).isEmpty();
    }

    @Test
    void theSameIdInTwoUsersIsTwoIndependentRowsAndTheListsAreDisjoint() {
        var f = users.two();
        var id = UUID.randomUUID();
        create(f.a(), id, "monthly", "2026-03-15").expect(201);

        var theirs = create(f.b(), id, "yearly", "2027-01-01").expect(201);

        assertThat(theirs.<String>json("$.userId")).isEqualTo(f.b().id().toString());
        var mine = api.as(f.a()).get(path() + "/" + id).expect(200);
        assertThat(mine.<Integer>json("$.version")).isEqualTo(1);
        assertThat(mine.<String>json("$.renewalPattern")).isEqualTo("monthly");
        var otherId = UUID.randomUUID();
        create(f.b(), otherId, "monthly", "2026-05-05").expect(201);
        assertThat(api.as(f.a()).get(path()).expect(200).<List<String>>json("$[*].id")).containsExactly(id.toString());
        assertThat(api.as(f.b()).get(path()).expect(200).<List<String>>json("$[*].id"))
                .containsExactlyInAnyOrder(id.toString(), otherId.toString());
    }

    @Test
    void aTombstoneIsGoneForCreateAndRenewAndNotFoundForReadAndDeleteTwiceIs204() {
        var user = users.create();
        var id = UUID.randomUUID();
        create(user, id, "monthly", "2026-03-15").expect(201);

        api.as(user).delete(path() + "/" + id).expect(204);
        api.as(user).delete(path() + "/" + id).expect(204);

        create(user, id, "monthly", "2026-03-15").expectProblem(410, "gone");
        api.as(user).send(org.springframework.http.HttpMethod.POST, path() + "/" + id + "/renew", renewBody("2026-03-15"))
                .expectProblem(410, "gone");
        api.as(user).patch(path() + "/" + id, "{\"name\":\"x\"}").expectProblem(410, "gone");
        api.as(user).get(path() + "/" + id).expectNotFound();
        assertThat(api.as(user).get(path()).expect(200).<List<?>>json("$")).isEmpty();
    }

    @Test
    void renewAddsOnePeriodAndAStaleDateChangesNothing() {
        var user = users.create();
        var id = UUID.randomUUID();
        create(user, id, "monthly", "2026-03-15").expect(201);
        var url = path() + "/" + id + "/renew";

        var renewed = api.as(user).send(org.springframework.http.HttpMethod.POST, url, renewBody("2026-03-15")).expect(200);
        var stale = api.as(user).send(org.springframework.http.HttpMethod.POST, url, renewBody("2026-03-15")).expect(200);

        assertThat(renewed.<String>json("$.expiryDate")).isEqualTo("2026-04-15");
        assertThat(renewed.<Integer>json("$.version")).isEqualTo(2);
        assertThat(stale.<String>json("$.expiryDate")).isEqualTo("2026-04-15");
        assertThat(stale.<Integer>json("$.version")).isEqualTo(2);
    }

    @ParameterizedTest
    @ValueSource(strings = {"none", "lifetime"})
    void renewOfAPatternThatNeverRenewsIs400(String pattern) {
        var user = users.create();
        var id = UUID.randomUUID();
        create(user, id, pattern, "lifetime".equals(pattern) ? null : "2026-03-15").expect(201);

        api.as(user).send(org.springframework.http.HttpMethod.POST, path() + "/" + id + "/renew", renewBody("2026-03-15"))
                .expectProblem(400, "validation");
    }

    @Test
    void exportHasOnlyTheCallersLiveRecordsAndAccountDeletionRemovesThem() {
        var f = users.two();
        var kept = UUID.randomUUID();
        var removed = UUID.randomUUID();
        create(f.a(), kept, "monthly", "2026-03-15").expect(201);
        create(f.a(), removed, "yearly", "2027-01-01").expect(201);
        create(f.b(), UUID.randomUUID(), "monthly", "2026-05-05").expect(201);
        api.as(f.a()).delete(path() + "/" + removed).expect(204);

        var export = api.as(f.a()).get("/api/v1/me/export").expect(200);
        assertThat(export.<List<String>>json("$." + type + "[*].id")).containsExactly(kept.toString());
        assertThat(export.<List<String>>json("$." + type + "[*].userId")).containsOnly(f.a().id().toString());

        api.as(f.a()).delete("/api/v1/me").expect(204);

        assertThat(count(f.a().id())).isZero();
        assertThat(count(f.b().id())).isEqualTo(1);
    }

    private int count(UUID user) {
        return jdbc.sql("select count(*) from " + type + " where user_id = ?").param(user).query(Integer.class).single();
    }
}
