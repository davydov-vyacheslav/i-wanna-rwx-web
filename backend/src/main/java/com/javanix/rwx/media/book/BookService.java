package com.javanix.rwx.media.book;

import com.javanix.rwx.api.model.BookSourceId;
import com.javanix.rwx.datasource.BookItem;
import com.javanix.rwx.datasource.BookRef;
import com.javanix.rwx.datasource.MediaResolver;
import com.javanix.rwx.common.validators.HttpUrls;
import com.javanix.rwx.identity.UserLock;
import com.javanix.rwx.media.common.MediaService;
import com.javanix.rwx.media.common.TitleKey;
import java.math.BigDecimal;
import java.time.Clock;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/** The user's books. Entities and repository are package-private, so the controller lives in this package. */
@Service
class BookService extends MediaService<BookEntity, BookRef, BookItem> {

    private static final Pattern ISBN_SEPARATORS = Pattern.compile("[\\s-]");

    private final BookRepository books;

    BookService(BookRepository books, @Qualifier(MediaResolver.DRAFT) MediaResolver<BookRef, BookItem> drafts,
            MediaResolver<BookRef, BookItem> catalog, UserLock userLock, Clock clock, TransactionTemplate tx) {
        super(books, drafts, catalog, userLock, clock, tx);
        this.books = books;
    }

    @Override
    protected Optional<BookEntity> findByIdentity(UUID userId, BookRef ref) {
        return books.findByUserIdAndSourceAndExternalIdAndDeletedAtIsNull(userId, ref.source(), ref.externalId());
    }

    @Override
    protected boolean isStorable(BookItem item) {
        var rating = item.rating();
        // the API mapper turns the stored text into a URI
        return (item.coverUrl() == null || HttpUrls.parse(item.coverUrl()).isPresent())
                && (rating == null || rating.signum() >= 0 && rating.compareTo(BigDecimal.valueOf(5)) <= 0);
    }

    @Override
    protected BookEntity newEntity(UUID userId, UUID id, String externalId, BookItem item, Clock clock) {
        return new BookEntity(userId, id, item.ref().source(), externalId, isbn(item.isbn()), item, clock.instant());
    }

    /**
     * Every item clashes on (source, externalId) (for a draft: its title key) and on ISBN; a draft also clashes with
     * ANY live title of the list, while a real item is not blocked by a same-titled draft.
     */
    @Override
    protected Optional<UUID> findDuplicate(UUID userId, BookItem item, String externalId) {
        var source = item.ref().source();
        var isbn = isbn(item.isbn());
        var clash = books.findByUserIdAndSourceAndExternalIdAndDeletedAtIsNull(userId, source, externalId)
                .map(BookEntity::getId);
        if (clash.isEmpty() && isbn != null) {
            clash = books.findByUserIdAndIsbnAndDeletedAtIsNull(userId, isbn).map(BookEntity::getId);
        }
        if (clash.isEmpty() && source == BookSourceId.DRAFT) {
            var key = TitleKey.of(item.title());
            clash = books.findByUserIdAndDeletedAtIsNull(userId).stream()
                    .filter(t -> TitleKey.of(t.getTitle()).equals(key)).map(BookRepository.LiveTitle::getId)
                    .findFirst();
        }
        return clash;
    }

    /** The stored form: no separators, upper case; blank is null. */
    static String isbn(String raw) {
        if (raw == null) {
            return null;
        }
        var normalized = ISBN_SEPARATORS.matcher(raw).replaceAll("").toUpperCase();
        return normalized.isEmpty() ? null : normalized;
    }

    @Transactional
    BookEntity patch(UUID userId, UUID id, String status, Boolean favorite) {
        var book = lockLive(userId, id);
        if (book.apply(status, favorite, clock().instant())) {
            save(book);
        }
        return book;
    }
}
