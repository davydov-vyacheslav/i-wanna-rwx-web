package com.javanix.rwx.datasource;

import java.math.BigDecimal;

/** A resolved, normalized book. */
public record BookItem(BookRef ref, String externalLink, String title, String author, String description,
        String coverUrl, Integer year, BigDecimal rating, String isbn) implements MediaItem<BookRef> {
}
