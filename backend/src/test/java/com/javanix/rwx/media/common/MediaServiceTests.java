package com.javanix.rwx.media.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.javanix.rwx.common.GoneException;
import com.javanix.rwx.common.InvalidRequestException;
import com.javanix.rwx.common.NotFoundException;
import com.javanix.rwx.common.Violation;
import com.javanix.rwx.datasource.CatalogException;
import com.javanix.rwx.datasource.MediaResolver;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** The service behaviour books and movies share, once per type; what only one type does is in its own package. */
@IntegrationTest
class MediaServiceTests {

    @Autowired TestUsers users;
    @Autowired JdbcClient jdbc;
    @Autowired WireMockServer provider;

    @EachKind
    void draftCreateStoresVersionOnePlannedWithRebuiltLinkAndTitleKey(MediaKind kind) {
        var user = users.create().id();
        var id = UUID.randomUUID();

        var result = kind.service().create(user, id,
                "https://www.google.com/search?hl=ru&q=++Cafe%CC%81+Society%E3%80%80&x=1#frag");

        assertThat(result.created()).isTrue();
        MediaEntity entity = result.entity();
        assertThat(entity.getId()).isEqualTo(id);
        assertThat(entity.getUserId()).isEqualTo(user);
        assertThat(entity.getVersion()).isEqualTo(1);
        assertThat(entity.getStatus()).isEqualTo("planned");
        assertThat(entity.isFavorite()).isFalse();
        assertThat(entity.getTitle()).isEqualTo("Café Society");
        assertThat(entity.getExternalId()).isEqualTo(TitleKey.of("Café Society")).isEqualTo("café society");
        assertThat(entity.getExternalLink()).isEqualTo(MediaUrls.draft("Café Society"));
        assertThat(entity.getCreatedAt()).isEqualTo(entity.getUpdatedAt());
    }

    @EachKind
    void urlsNoSourceRecognizesAreUnsupportedAndNothingIsStored(MediaKind kind) {
        var user = users.create().id();

        for (var url : new String[] {"https://openlibrary.org/books/OL1M", "https://www.themoviedb.org/person/603",
                "https://example.org/search?q=Dune", MediaUrls.draft("  ")}) {
            assertThatThrownBy(() -> kind.service().create(user, UUID.randomUUID(), url)).as(url)
                    .isInstanceOfSatisfying(InvalidRequestException.class,
                            e -> assertThat(e.errors()).extracting(Violation::field).containsExactly("sourceUrl"));
        }
        assertThat(kind.service().list(user)).isEmpty();
    }

    @EachKind
    void changedPatchBumpsVersionAndUpdatedAt(MediaKind kind) {
        var user = users.create().id();
        var id = created(kind, user, "Dune");
        var before = kind.service().get(user, id).getUpdatedAt();

        var patched = kind.patch(user, id, "seen", true);

        assertThat(patched.getVersion()).isEqualTo(2);
        assertThat(patched.getStatus()).isEqualTo("seen");
        assertThat(patched.isFavorite()).isTrue();
        assertThat(patched.getUpdatedAt()).isAfter(before);
        assertThat(kind.service().get(user, id).getVersion()).isEqualTo(2);
    }

    @EachKind
    void identicalPatchChangesNothing(MediaKind kind) {
        var user = users.create().id();
        var id = created(kind, user, "Dune");
        var changed = kind.patch(user, id, "seen", null);

        var again = kind.patch(user, id, "seen", false);

        assertThat(again.getVersion()).isEqualTo(2);
        assertThat(again.getUpdatedAt()).isEqualTo(changed.getUpdatedAt());
    }

    @EachKind
    void patchSetsOnlyTheGivenField(MediaKind kind) {
        var user = users.create().id();
        var id = created(kind, user, "Dune");
        kind.patch(user, id, null, true);

        var patched = kind.patch(user, id, "seen", null);

        assertThat(patched.isFavorite()).isTrue();
        assertThat(patched.getStatus()).isEqualTo("seen");
    }

    @EachKind
    void deleteHidesTheItemClearsItsDescriptionAndIsIdempotent(MediaKind kind) {
        var user = users.create().id();
        var id = created(kind, user, "Dune");
        var other = created(kind, user, "Emma");
        jdbc.sql("update " + kind.table() + " set description = 'A long text' where user_id = ? and id = ?")
                .param(user).param(id).update();

        kind.service().delete(user, id);
        kind.service().delete(user, id);

        assertThat(kind.service().list(user)).extracting(MediaEntity::getId).containsExactly(other);
        assertThatThrownBy(() -> kind.service().get(user, id)).isInstanceOf(NotFoundException.class);
        assertThat(jdbc.sql("select version from " + kind.table() + " where user_id = ? and id = ?").param(user)
                .param(id).query(Long.class).single()).isEqualTo(2);
        assertThat(jdbc.sql("select description from " + kind.table() + " where user_id = ? and id = ?").param(user)
                .param(id).query(String.class).optional()).isEmpty();
    }

    @EachKind
    void deleteOfUnknownIdIsNotFound(MediaKind kind) {
        var user = users.create().id();

        assertThatThrownBy(() -> kind.service().delete(user, UUID.randomUUID()))
                .isInstanceOf(NotFoundException.class);
    }

    @EachKind
    void patchAndCreateAfterDeleteAreGone(MediaKind kind) {
        var user = users.create().id();
        var id = created(kind, user, "Dune");
        kind.service().delete(user, id);

        assertThatThrownBy(() -> kind.patch(user, id, "seen", null)).isInstanceOf(GoneException.class);
        assertThatThrownBy(() -> kind.service().create(user, id, MediaUrls.draft("Dune")))
                .isInstanceOf(GoneException.class);
        assertThat(kind.service().list(user)).isEmpty();
    }

    @EachKind
    void rePostOfALiveIdReturnsTheStoredRowWithoutIdentifyingTheUrl(MediaKind kind) {
        var user = users.create().id();
        var id = UUID.randomUUID();
        MediaEntity first = kind.service().create(user, id, MediaUrls.draft("Dune")).entity();
        var spy = spy(kind.drafts());

        var second = kind.service(spy, kind.catalog()).create(user, id, "https://example.org/not-a-source");

        assertThat(second.created()).isFalse();
        assertThat(second.entity().getVersion()).isEqualTo(first.getVersion());
        assertThat(second.entity().getTitle()).isEqualTo("Dune");
        verify(spy, never()).identify(any());
        assertThat(kind.service().list(user)).hasSize(1);
    }

    @EachKind
    void blankDescriptionIsStoredAsNull(MediaKind kind) {
        for (var desc : new String[] {null, "", "  \n\t"}) {
            assertThat(kind.entity(desc).getDescription()).as("[" + desc + "]").isNull();
        }
        assertThat(kind.entity("A desert planet").getDescription()).isEqualTo("A desert planet");
    }

    @EachKind
    void identifyAndResolveOfADraftRunOutsideAnyTransactionSoNoUserLockIsHeld(MediaKind kind) {
        var user = users.create().id();
        var activeDuring = new ArrayList<Boolean>();

        kind.service(recordTransactions(kind.drafts(), activeDuring), kind.catalog()).create(user, UUID.randomUUID(),
                MediaUrls.draft("Dune"));

        assertThat(activeDuring).containsExactly(false, false);
    }

    @EachKind
    void identifyAndResolveOfAProviderCreateRunOutsideAnyTransactionSoNoUserLockIsHeld(MediaKind kind) {
        provider.resetAll();
        var user = users.create().id();
        var url = kind.stubProviderUrl(provider, user);
        var activeDuring = new ArrayList<Boolean>();

        var result = kind.service(kind.drafts(), recordTransactions(kind.catalog(), activeDuring)).create(user,
                UUID.randomUUID(), url);

        assertThat(result.created()).isTrue();
        assertThat(activeDuring).containsExactly(false, false);
    }

    @EachKind
    void aFailedResolveStoresNothingAndTheSameIdSucceedsOnRetry(MediaKind kind) {
        var user = users.create().id();
        var id = UUID.randomUUID();
        // an image URL the API cannot carry is a provider error
        for (var image : new String[] {"", "  ", "not a url", "ftp://covers.example/1.jpg", "https://covers.example/a b.jpg"}) {
            var service = kind.service(kind.drafts(), kind.provider("Dune", image));
            assertThatThrownBy(() -> service.create(user, id, "https://x")).as("[" + image + "]")
                    .isInstanceOf(CatalogException.ProviderError.class);
        }
        assertThat(kind.service().list(user)).isEmpty();

        var retried = kind.service(kind.drafts(), kind.provider("Dune", null)).create(user, id, "https://x");

        assertThat(retried.created()).isTrue();
        assertThat(kind.service().list(user)).extracting(MediaEntity::getId).containsExactly(id);
    }

    private static UUID created(MediaKind kind, UUID user, String title) {
        var id = UUID.randomUUID();
        kind.service().create(user, id, MediaUrls.draft(title));
        return id;
    }

    /** A spy that notes, per identify and resolve call, whether a transaction was active. */
    @SuppressWarnings({"rawtypes", "unchecked"})
    private static MediaResolver<?, ?> recordTransactions(MediaResolver<?, ?> real, List<Boolean> activeDuring) {
        MediaResolver spy = spy(real);
        doAnswer(i -> {
            activeDuring.add(TransactionSynchronizationManager.isActualTransactionActive());
            return i.callRealMethod();
        }).when(spy).identify(any());
        doAnswer(i -> {
            activeDuring.add(TransactionSynchronizationManager.isActualTransactionActive());
            return i.callRealMethod();
        }).when(spy).resolve(any(), any());
        return spy;
    }
}
