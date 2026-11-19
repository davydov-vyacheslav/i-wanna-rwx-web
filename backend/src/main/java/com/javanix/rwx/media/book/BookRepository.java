package com.javanix.rwx.media.book;

import com.javanix.rwx.api.model.BookSourceId;
import com.javanix.rwx.media.common.MediaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;


interface BookRepository extends MediaRepository<BookEntity, BookKey> {

    /** The identity of every item, a draft included (its external id is the title key). */
    Optional<BookEntity> findByUserIdAndSourceAndExternalIdAndDeletedAtIsNull(UUID userId, BookSourceId source,
            String externalId);

    Optional<BookEntity> findByUserIdAndIsbnAndDeletedAtIsNull(UUID userId, String isbn);

    /** Titles only: the draft rule compares them in Java (NFC, lower case by Locale.ROOT), which SQL collations do not. */
    List<LiveTitle> findByUserIdAndDeletedAtIsNull(UUID userId);

    interface LiveTitle {

        UUID getId();

        String getTitle();
    }
}
