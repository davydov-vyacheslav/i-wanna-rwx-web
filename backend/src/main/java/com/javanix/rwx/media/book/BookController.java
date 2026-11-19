package com.javanix.rwx.media.book;

import com.javanix.rwx.api.BooksApi;
import com.javanix.rwx.api.model.Book;
import com.javanix.rwx.api.model.CreateBookRequest;
import com.javanix.rwx.api.model.UpdateBookRequest;
import com.javanix.rwx.identity.CurrentUserProvider;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
class BookController implements BooksApi {

    private final CurrentUserProvider currentUser;
    private final BookService books;
    private final BookApiMapper mapper;

    BookController(CurrentUserProvider currentUser, BookService books, BookApiMapper mapper) {
        this.currentUser = currentUser;
        this.books = books;
        this.mapper = mapper;
    }

    @Override
    public ResponseEntity<List<Book>> listBooks() {
        return ResponseEntity.ok(books.list(currentUser.current().id()).stream().map(mapper::toApi).toList());
    }

    @Override
    public ResponseEntity<Book> createBook(CreateBookRequest request) {
        var result = books.create(currentUser.current().id(), request.getId(), request.getSourceUrl());
        var status = result.created() ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(mapper.toApi(result.entity()));
    }

    @Override
    public ResponseEntity<Book> getBook(UUID id) {
        return ResponseEntity.ok(mapper.toApi(books.get(currentUser.current().id(), id)));
    }

    @Override
    public ResponseEntity<Book> updateBook(UUID id, UpdateBookRequest request) {
        var status = request.getStatus() == null ? null : request.getStatus().getValue();
        return ResponseEntity.ok(mapper.toApi(
                books.patch(currentUser.current().id(), id, status, request.getIsFavorite())));
    }

    @Override
    public ResponseEntity<Void> deleteBook(UUID id) {
        books.delete(currentUser.current().id(), id);
        return ResponseEntity.noContent().build();
    }
}
