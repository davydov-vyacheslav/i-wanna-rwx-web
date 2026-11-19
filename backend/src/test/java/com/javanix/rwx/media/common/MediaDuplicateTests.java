package com.javanix.rwx.media.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.javanix.rwx.common.DuplicateException;
import com.javanix.rwx.identity.UserLock;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;

/** The duplicate rules and races books and movies share, once per type. */
@IntegrationTest
class MediaDuplicateTests {

    @Autowired TestUsers users;
    @Autowired JdbcClient jdbc;
    @Autowired PlatformTransactionManager tm;
    @Autowired UserLock userLock;

    @EachKind
    void draftTitleMatchesCaseInsensitivelyTrimmedAndNfc(MediaKind kind) {
        var user = users.create().id();
        MediaEntity first = kind.service().create(user, UUID.randomUUID(), MediaUrls.draft("Café Society")).entity();

        assertThatThrownBy(() -> kind.service().create(user, UUID.randomUUID(), MediaUrls.draft("CAFÉ society")))
                .isInstanceOfSatisfying(DuplicateException.class, e -> assertThat(e.existingId()).isEqualTo(first.getId()));
        assertThat(kind.service().create(user, UUID.randomUUID(), MediaUrls.draft("Cafe Society")).created()).isTrue();
    }

    @EachKind
    void draftIsBlockedByALiveDraftOrProviderTitle(MediaKind kind) {
        var user = users.create().id();
        MediaEntity draft = kind.service().create(user, UUID.randomUUID(), MediaUrls.draft("Emma")).entity();
        var real = kind.seed(user, "Dune");

        assertThatThrownBy(() -> kind.service().create(user, UUID.randomUUID(), MediaUrls.draft("Emma ")))
                .isInstanceOfSatisfying(DuplicateException.class, e -> assertThat(e.existingId()).isEqualTo(draft.getId()));
        assertThatThrownBy(() -> kind.service().create(user, UUID.randomUUID(), MediaUrls.draft("dune ")))
                .isInstanceOfSatisfying(DuplicateException.class, e -> assertThat(e.existingId()).isEqualTo(real));
    }

    @EachKind
    void ownIdIsNotADuplicateAndDeletedItemsDoNotBlock(MediaKind kind) {
        var user = users.create().id();
        var id = UUID.randomUUID();
        kind.service().create(user, id, MediaUrls.draft("Solaris"));

        assertThat(kind.service().create(user, id, MediaUrls.draft("Solaris")).created()).isFalse();

        kind.service().delete(user, id);
        assertThat(kind.service().create(user, UUID.randomUUID(), MediaUrls.draft("Solaris")).created()).isTrue();
    }

    @EachKind
    void anotherUsersItemsDoNotCount(MediaKind kind) {
        var f = users.two();
        kind.service().create(f.a().id(), UUID.randomUUID(), MediaUrls.draft("Dune"));
        kind.seed(f.a().id(), "Emma");

        assertThat(kind.service().create(f.b().id(), UUID.randomUUID(), MediaUrls.draft("Dune")).created()).isTrue();
        assertThat(kind.service().create(f.b().id(), UUID.randomUUID(), MediaUrls.draft("Emma")).created()).isTrue();
    }

    @EachKind
    void realItemIsNotBlockedByASameTitledDraft(MediaKind kind) {
        var user = users.create().id();
        kind.service().create(user, UUID.randomUUID(), MediaUrls.draft("Dune"));

        var real = kind.service(kind.drafts(), kind.provider("Dune", null)).create(user, UUID.randomUUID(),
                "https://x");

        assertThat(real.created()).isTrue();
    }

    @EachKind
    void racingDraftsOfTheSameTitleSerializeOnTheUserLock(MediaKind kind) throws Exception {
        var user = users.create().id();
        var title = "Race " + UUID.randomUUID();
        var first = UUID.randomUUID();

        var outcomes = RaceSupport.race(tm, jdbc, userLock, user, () -> kind.service().create(user, first, MediaUrls.draft(title)),
                () -> kind.service().create(user, UUID.randomUUID(), MediaUrls.draft(title)));

        assertThat(outcomes.first()).isInstanceOf(MediaService.CreateResult.class);
        assertThat(outcomes.second()).isInstanceOfSatisfying(DuplicateException.class,
                e -> assertThat(e.existingId()).isEqualTo(first));
    }
}
