package com.javanix.rwx.datasource;

import java.util.Optional;
import java.util.UUID;

/** How {@code media} turns a source URL into a stored item: the published type, injected parameterized per resource type. */
public interface MediaResolver<R extends MediaRef, I extends MediaItem<R>> {

    /**
     * Qualifier of the draft source (a typed text kept as a Google search link, nothing fetched). The draft beans
     * share the generic type with the provider catalogs, which are {@code @Primary}: {@code media} injects the draft
     * one with {@code @Qualifier(MediaResolver.DRAFT)} and the providers unqualified. Drafts are not a
     * {@code SourceInfo}: never in the source directory, {@code /data-sources} or user rows.
     */
    String DRAFT = "draft";

    /**
     * Pure (no I/O, no user, no key, availability ignored): the first registered source that recognizes the URL
     * yields its canonical reference. Empty for anything no source recognizes; a provider catalog does not recognize a draft link.
     */
    Optional<R> identify(String sourceUrl);

    /**
     * Fetches the item from the provider on its own configured base URL, never from the client's URL. Sources that
     * need a user key fail with {@link CatalogException.SourceKeyMissing}.
     *
     * @throws CatalogException on any provider or limit failure; nothing is retried
     */
    I resolve(UUID userId, R ref);
}
