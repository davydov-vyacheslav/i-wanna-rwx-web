package com.javanix.rwx.media.book;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.javanix.rwx.api.model.BookSourceId;
import com.javanix.rwx.common.DuplicateException;
import com.javanix.rwx.datasource.BookItem;
import com.javanix.rwx.datasource.BookRef;
import com.javanix.rwx.datasource.MediaResolver;
import com.javanix.rwx.identity.UserLock;
import com.javanix.rwx.media.common.MediaSeed;
import com.javanix.rwx.media.common.MediaService;
import com.javanix.rwx.media.common.MediaUrls;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import java.time.Clock;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.support.TransactionTemplate;

/** The ISBN rule; the title rules and races every type shares are in {@code media.common.MediaDuplicateTests}. */
@IntegrationTest
class BookDuplicateTests {

    @Autowired BookRepository repository;
    @Autowired @Qualifier(MediaResolver.DRAFT) MediaResolver<BookRef, BookItem> drafts;
    @Autowired TestUsers users;
    @Autowired JdbcClient jdbc;
    @Autowired UserLock userLock;
    @Autowired Clock clock;
    @Autowired TransactionTemplate tx;

    @Test
    void isbnIsNormalizedForTheDuplicateCheck() {
        var user = users.create().id();
        var seeded = MediaSeed.book(jdbc, user, "Other", "OL1W", "9780441172719");

        assertThatThrownBy(() -> providerCreate(user, "OL3W", "Different", "978-0-441-17271-9"))
                .isInstanceOfSatisfying(DuplicateException.class, e -> assertThat(e.existingId()).isEqualTo(seeded));
    }

    /** A provider-sourced create through a service whose resolver yields a fixed item. */
    private MediaService.CreateResult<BookEntity> providerCreate(UUID user, String workId, String title, String isbn) {
        MediaResolver<BookRef, BookItem> fixed = new MediaResolver<>() {
            @Override
            public Optional<BookRef> identify(String sourceUrl) {
                return Optional.of(new BookRef(BookSourceId.OPEN_LIBRARY, workId));
            }

            @Override
            public BookItem resolve(UUID userId, BookRef ref) {
                return new BookItem(ref, MediaUrls.openLibrary(workId), title, null, null, null, null, null, isbn);
            }
        };
        return new BookService(repository, drafts, fixed, userLock, clock, tx).create(user, UUID.randomUUID(), "https://x");
    }
}
