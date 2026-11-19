package com.javanix.rwx.media.common;

import static org.assertj.core.api.Assertions.assertThat;

import com.javanix.rwx.testkit.Api;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.simple.JdbcClient;

/** The HTTP behaviour books and movies share, once per type. */
@IntegrationTest
class MediaApiTests {

    @Autowired Api api;
    @Autowired TestUsers users;
    @Autowired JdbcClient jdbc;

    private Api.Res create(MediaKind kind, TestUsers.TestUser user, UUID id, String title) {
        return api.as(user).postItem(kind.path(), id, MediaUrls.draft(title));
    }

    @EachKind
    void createReturns201ThenRePostReturns200WithTheSameItem(MediaKind kind) {
        var user = users.create();
        var id = UUID.randomUUID();

        var first = create(kind, user, id, "Dune").expect(201);
        assertThat(first.<String>json("$.id")).isEqualTo(id.toString());
        assertThat(first.<String>json("$.userId")).isEqualTo(user.id().toString());
        assertThat(first.<String>json("$.title")).isEqualTo("Dune");
        assertThat(first.<String>json("$.status")).isEqualTo("planned");
        assertThat(first.<Boolean>json("$.isFavorite")).isFalse();
        assertThat(first.<String>json("$.source")).isEqualTo("draft");
        assertThat(first.<String>json("$.externalId")).isEqualTo("dune");
        assertThat(first.<String>json("$.externalLink")).isEqualTo(MediaUrls.draft("Dune"));
        assertThat(first.<Integer>json("$.version")).isEqualTo(1);

        // the second body names another URL: ignored for a live id
        var again = api.as(user).postItem(kind.path(), id, MediaUrls.draft("Other")).expect(200);
        assertThat(again.body()).isEqualTo(first.body());
    }

    @EachKind
    void listGetPatchAndDelete(MediaKind kind) {
        var user = users.create();
        var id = UUID.randomUUID();
        var path = kind.path();
        create(kind, user, id, "Emma").expect(201);

        assertThat(api.as(user).get(path).expect(200).<List<?>>json("$")).hasSize(1);
        api.as(user).get(path + "/" + id).expect(200);

        var patched = api.as(user).patch(path + "/" + id, "{\"status\":\"seen\",\"isFavorite\":true}").expect(200);
        assertThat(patched.<String>json("$.status")).isEqualTo("seen");
        assertThat(patched.<Boolean>json("$.isFavorite")).isTrue();
        assertThat(patched.<Integer>json("$.version")).isEqualTo(2);

        api.as(user).delete(path + "/" + id).expect(204);
        api.as(user).delete(path + "/" + id).expect(204);
        assertThat(api.as(user).get(path).<List<?>>json("$")).isEmpty();
        api.as(user).get(path + "/" + id).expectNotFound();
    }

    @EachKind
    void badRequests(MediaKind kind) {
        var user = users.create();
        var id = UUID.randomUUID();
        var path = kind.path();
        api.as(user).postItem(path, id, "ftp://example.com/x").expectProblem(400, "validation");
        api.as(user).postItem(path, id, "not a url").expectProblem(400, "validation");
        api.as(user).send(HttpMethod.POST, path, "{\"id\":\"" + id + "\"}").expectProblem(400, "validation");
        api.as(user).send(HttpMethod.POST, path, "{\"id\":\"nope\",\"sourceUrl\":\"https://a.b\"}")
                .expectProblem(400, "validation");
        create(kind, user, id, "Ulysses").expect(201);
        api.as(user).patch(path + "/" + id, "{\"status\":\"" + kind.invalidStatus() + "\"}")
                .expectProblem(400, "validation");
        api.as(user).get(path + "/not-a-uuid").expectProblem(400, "validation");
    }

    @EachKind
    void anonymousIs401(MediaKind kind) {
        api.get(kind.path()).expectProblem(401, "unauthorized");
        api.noCsrf().get(kind.path() + "/" + UUID.randomUUID()).expectProblem(401, "unauthorized");
    }

    @EachKind
    void unknownAndForeignIdsAre404(MediaKind kind) {
        var f = users.two();
        var id = UUID.randomUUID();
        var path = kind.path();
        create(kind, f.a(), id, "Walden").expect(201);

        api.as(f.b()).get(path + "/" + id).expectNotFound();
        api.as(f.b()).patch(path + "/" + id, "{\"isFavorite\":true}").expectNotFound();
        api.as(f.b()).delete(path + "/" + id).expectNotFound();
        api.as(f.a()).get(path + "/" + UUID.randomUUID()).expectNotFound();
        assertThat(api.as(f.b()).get(path).<List<?>>json("$")).isEmpty();
    }

    @EachKind
    void sameIdAndSameTitleInTwoUsersAreTwoIndependentRows(MediaKind kind) {
        var f = users.two();
        var id = UUID.randomUUID();
        var path = kind.path();
        create(kind, f.a(), id, "Dune").expect(201);
        api.as(f.a()).patch(path + "/" + id, "{\"isFavorite\":true}").expect(200);

        // B posts A's id and A's title: B's own row, A's row untouched
        var mine = create(kind, f.b(), id, "Dune").expect(201);
        assertThat(mine.<String>json("$.userId")).isEqualTo(f.b().id().toString());
        assertThat(mine.<Boolean>json("$.isFavorite")).isFalse();
        var theirs = api.as(f.a()).get(path + "/" + id).expect(200);
        assertThat(theirs.<String>json("$.userId")).isEqualTo(f.a().id().toString());
        assertThat(theirs.<Boolean>json("$.isFavorite")).isTrue();
        assertThat(theirs.<Integer>json("$.version")).isEqualTo(2);

        api.as(f.b()).delete(path + "/" + id).expect(204);
        api.as(f.a()).get(path + "/" + id).expect(200);
        assertThat(api.as(f.a()).get(path).<List<String>>json("$[*].id")).containsExactly(id.toString());
        assertThat(api.as(f.b()).get(path).<List<?>>json("$")).isEmpty();
    }

    @EachKind
    void duplicateIs409WithTheExistingId(MediaKind kind) {
        var user = users.create();
        var first = UUID.randomUUID();
        create(kind, user, first, "Dune").expect(201);

        var clash = create(kind, user, UUID.randomUUID(), "dune ").expectProblem(409, "duplicate");
        assertThat(clash.<String>json("$.existingId")).isEqualTo(first.toString());
    }

    @EachKind
    void deletedIdIs410ForCreateAndPatch(MediaKind kind) {
        var user = users.create();
        var id = UUID.randomUUID();
        create(kind, user, id, "Beloved").expect(201);
        api.as(user).delete(kind.path() + "/" + id).expect(204);

        create(kind, user, id, "Beloved").expectProblem(410, "gone");
        api.as(user).patch(kind.path() + "/" + id, "{\"isFavorite\":true}").expectProblem(410, "gone");
    }

    @EachKind
    void unrecognizedUrlIsInvalidInput(MediaKind kind) {
        var user = users.create();
        var res = api.as(user).postItem(kind.path(), UUID.randomUUID(), "https://example.com/item/1")
                .expectProblem(400, "validation");
        assertThat(res.<String>json("$.errors[0].field")).isEqualTo("sourceUrl");
        assertThat(res.body()).doesNotContain("example.com");
    }

    @EachKind
    void exportHasTheCallersLiveItemsOnly(MediaKind kind) {
        var f = users.two();
        var kept = UUID.randomUUID();
        var removed = UUID.randomUUID();
        create(kind, f.a(), kept, "Kept").expect(201);
        create(kind, f.a(), removed, "Removed").expect(201);
        api.as(f.a()).delete(kind.path() + "/" + removed).expect(204);
        create(kind, f.b(), UUID.randomUUID(), "Theirs").expect(201);

        var export = api.as(f.a()).get("/api/v1/me/export").expect(200);

        assertThat(export.<List<?>>json("$." + kind.exportKey())).hasSize(1);
        assertThat(export.<String>json("$." + kind.exportKey() + "[0].id")).isEqualTo(kept.toString());
        assertThat(export.body()).doesNotContain("Theirs", "Removed");
    }

    @EachKind
    void accountDeletionRemovesTheItems(MediaKind kind) {
        var user = users.create();
        create(kind, user, UUID.randomUUID(), "Gone with the user").expect(201);

        api.as(user).delete("/api/v1/me").expect(204);

        var left = jdbc.sql("select count(*) from " + kind.table() + " where user_id = ?").param(user.id())
                .query(Long.class).single();
        assertThat(left).isZero();
    }
}
