package com.javanix.rwx.datasource;

import com.javanix.rwx.api.model.BookSourceId;

/** A book on a source: what {@code media} stores for the identity check and hands back to {@code resolve}. */
public record BookRef(BookSourceId source, String externalId) implements MediaRef {

    @Override
    public String sourceId() {
        return source.getValue();
    }
}
