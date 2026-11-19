package com.javanix.rwx.media.book;

import com.javanix.rwx.api.model.Book;
import com.javanix.rwx.identity.AccountExportContributor;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** The books block of {@code GET /me/export}: live items only. */
@Component
class BookExport implements AccountExportContributor {

    private final BookService books;
    private final BookApiMapper mapper;

    BookExport(BookService books, BookApiMapper mapper) {
        this.books = books;
        this.mapper = mapper;
    }

    @Override
    public List<Book> books(UUID userId) {
        return books.list(userId).stream().map(mapper::toApi).toList();
    }
}
