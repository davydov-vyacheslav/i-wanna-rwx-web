package com.javanix.rwx.datasource.internal.book;

import com.javanix.rwx.api.model.ResourceType;
import com.javanix.rwx.datasource.BookItem;
import com.javanix.rwx.datasource.BookRef;
import com.javanix.rwx.datasource.internal.provider.CatalogService;
import com.javanix.rwx.datasource.internal.provider.RateLimiter;
import com.javanix.rwx.datasource.internal.provider.SourceDirectory;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

@Component
@Primary
public class BookCatalogService extends CatalogService<BookRef, BookItem, BookSource> {

    public BookCatalogService(SourceDirectory directory, RateLimiter limiter) {
        super(directory.of(ResourceType.BOOK, BookSource.class), limiter);
    }
}
