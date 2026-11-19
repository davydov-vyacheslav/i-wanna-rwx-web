package com.javanix.rwx.datasource.internal.book;

import com.javanix.rwx.api.model.BookSourceId;
import com.javanix.rwx.datasource.BookItem;
import com.javanix.rwx.datasource.BookRef;
import com.javanix.rwx.datasource.MediaResolver;
import com.javanix.rwx.datasource.internal.AbstractDraftResolver;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

@Component
@Qualifier(MediaResolver.DRAFT)
public class BookDraftResolver extends AbstractDraftResolver<BookRef, BookItem> {

    @Override
    protected BookRef ref(String text) {
        return new BookRef(BookSourceId.DRAFT, text);
    }

    @Override
    protected BookItem item(BookRef ref, String text) {
        return new BookItem(ref, build(text), text, null, null, null, null, null, null);
    }
}
