package com.javanix.rwx.datasource;

import java.math.BigDecimal;

/**
 * A resolved, normalized movie or TV series. {@code tvStatus} and {@code seasonCount} are null for a movie; other
 * optional values are null when unknown.
 */
public record MovieItem(MovieRef ref, String externalLink, String title, String originalTitle, String description,
        String posterUrl, Integer year, BigDecimal rating, TvStatus tvStatus, Integer seasonCount)
        implements MediaItem<MovieRef> {
}
