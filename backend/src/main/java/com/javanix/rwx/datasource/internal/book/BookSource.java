package com.javanix.rwx.datasource.internal.book;

import com.javanix.rwx.api.model.BookSourceId;
import com.javanix.rwx.api.model.ResourceType;
import com.javanix.rwx.datasource.BookItem;
import com.javanix.rwx.datasource.BookRef;
import com.javanix.rwx.datasource.internal.provider.ResolvingSource;
import com.javanix.rwx.datasource.internal.provider.SourceInfo;
import java.util.List;
import java.util.UUID;

/**
 * A book data source (design 15.1). Internal to {@code datasource}: adding a provider is a change inside this module.
 * Implementations are Spring beans; the directory registers them by their {@code @Order}.
 */
public interface BookSource extends SourceInfo, ResolvingSource<BookRef, BookItem> {

    /** Stored as {@code books.source}; never {@code DRAFT} (a draft is not a registered source). */
    BookSourceId sourceId();

    @Override
    default String id() {
        return sourceId().getValue();
    }

    @Override
    default ResourceType resourceType() {
        return ResourceType.BOOK;
    }

    /** False while a key this source needs is missing for the user. */
    boolean isAvailable(UUID userId);

    /** The stored link for a ref this source produced: the one form of every URL that identifies it. */
    String canonicalUrl(BookRef ref);

    /**
     * Upstream keyword search, parsed and normalized, canonical refs set, at most 10 results. The results are partial
     * items: {@code externalLink} is the canonical link and {@code description} is always null (the search does not
     * provide it; {@link #resolve} does).
     */
    List<BookItem> search(UUID userId, String q);
}
