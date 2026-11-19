package com.javanix.rwx.media.book;

import static org.assertj.core.api.Assertions.assertThat;

import com.javanix.rwx.api.model.BookSourceId;
import com.javanix.rwx.media.common.MediaUrls;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** What only books do; the create, patch and delete flow every type shares is in {@code media.common.MediaServiceTests}. */
@IntegrationTest
class BookServiceTests {

    @Autowired BookService service;
    @Autowired TestUsers users;

    @Test
    void draftCreateStoresADraftBookWithoutAnIsbn() {
        var book = service.create(users.create().id(), UUID.randomUUID(), MediaUrls.draft("Café Society")).entity();

        assertThat(book.getSource()).isEqualTo(BookSourceId.DRAFT);
        assertThat(book.getIsbn()).isNull();
    }

    @Test
    void isbnIsStoredWithoutSeparatorsInUpperCase() {
        assertThat(BookService.isbn("978-0-441-17271-9")).isEqualTo("9780441172719");
        assertThat(BookService.isbn(" 0 8044 1172 x ")).isEqualTo("080441172X");
        assertThat(BookService.isbn("  ")).isNull();
        assertThat(BookService.isbn(null)).isNull();
    }
}
