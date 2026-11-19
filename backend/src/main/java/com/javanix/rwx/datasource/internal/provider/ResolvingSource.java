package com.javanix.rwx.datasource.internal.provider;

import com.javanix.rwx.common.validators.HttpUrls;
import com.javanix.rwx.datasource.MediaItem;
import com.javanix.rwx.datasource.MediaRef;
import com.javanix.rwx.datasource.MediaResolver;
import java.net.URI;
import java.util.Optional;
import java.util.UUID;

/**
 * The part of a typed source SPI that the shared catalog service needs; {@code provider} knows nothing more. A source
 * is itself a {@link MediaResolver} for its own URLs, but its {@link #resolve} is the raw call: no rate limit. The {@link CatalogService} composite (the {@code @Primary} resolver) is the guarded one that {@code media}
 * uses; call a source's {@code resolve} directly only from the catalog and from source tests.
 */
public interface ResolvingSource<R extends MediaRef, I extends MediaItem<R>> extends SourceInfo, MediaResolver<R, I> {

    /** Pure: this source's URL patterns to a canonical ref, no network, no user lookup. */
    Optional<R> recognize(URI url);

    @Override
    default Optional<R> identify(String sourceUrl) {
        return HttpUrls.parse(sourceUrl).flatMap(this::recognize);
    }

    /** Details fetched from our configured base URL for a ref this source produced; unthrottled, see the type javadoc. */
    @Override
    I resolve(UUID userId, R ref);
}
