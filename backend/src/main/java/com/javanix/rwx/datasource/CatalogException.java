package com.javanix.rwx.datasource;

import java.time.Duration;

/**
 * Everything that can go wrong between a recognized reference and a normalized item. Unchecked and published, so
 * {@code media} lets it propagate to the one advice in {@code datasource} that maps it. Messages are fixed text: no
 * provider body, URL, query or token ever ends up in an exception, and no cause is kept for the same reason.
 *
 * <p>{@link #source()} is the wire id of the data source the failure is about ({@code open_library}, {@code tmdb}),
 * which the advice puts into {@code Problem.source}. It is null for {@link RateLimited} (our own limit): that names no
 * source.
 */
public abstract class CatalogException extends RuntimeException {

    private final String source;

    CatalogException(String message, String source) {
        super(message, null, false, false);
        this.source = source;
    }

    public String source() {
        return source;
    }

    /** The provider has no such item (provider 404). */
    public static class SourceNotFound extends CatalogException {
        public SourceNotFound(String source) {
            super("source item not found", source);
        }
    }

    /** The source needs a key the user has not saved. */
    public static class SourceKeyMissing extends CatalogException {
        public SourceKeyMissing(String source) {
            super("source key missing", source);
        }
    }

    /** The provider rejected the key the user saved earlier. */
    public static class SourceKeyInvalid extends CatalogException {
        public SourceKeyInvalid(String source) {
            super("source key rejected by the provider", source);
        }
    }

    /** Connect or read timeout. */
    public static class ProviderTimeout extends CatalogException {
        public ProviderTimeout(String source) {
            super("provider timeout", source);
        }
    }

    /** 5xx, unexpected 4xx, malformed or oversized body, or unusable data. */
    public static class ProviderError extends CatalogException {
        public ProviderError(String source) {
            super("provider error", source);
        }
    }

    /** The provider answered 429. */
    public static class ProviderRateLimited extends CatalogException {
        private final Duration retryAfter;

        public ProviderRateLimited(String source, Duration retryAfter) {
            super("provider rate limited", source);
            this.retryAfter = retryAfter;
        }

        public Duration retryAfter() {
            return retryAfter;
        }
    }

    /** The user's own limit on provider calls. */
    public static class RateLimited extends CatalogException {
        private final Duration retryAfter;

        public RateLimited(Duration retryAfter) {
            super("rate limited", null);
            this.retryAfter = retryAfter;
        }

        public Duration retryAfter() {
            return retryAfter;
        }
    }
}
