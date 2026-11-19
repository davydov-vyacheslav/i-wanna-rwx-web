package com.javanix.rwx.datasource.internal.provider;

import com.javanix.rwx.datasource.MediaItem;
import com.javanix.rwx.datasource.MediaRef;
import com.javanix.rwx.datasource.MediaResolver;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * What the book and movie catalogs share: the sources of one resource type in registry order, as one composite
 * {@link MediaResolver}. This is the guarded resolver {@code media} uses (limiter token on every resolve);
 * the sources are resolvers too, but their {@code resolve} is the raw, unthrottled call.
 */
public abstract class CatalogService<R extends MediaRef, I extends MediaItem<R>, S extends ResolvingSource<R, I>>
        implements MediaResolver<R, I> {

    private final List<S> sources;
    private final RateLimiter limiter;

    protected CatalogService(List<S> sources, RateLimiter limiter) {
        this.sources = List.copyOf(sources);
        this.limiter = limiter;
    }

    /** In registry order. */
    public List<S> sources() {
        return sources;
    }

    public Optional<S> source(String id) {
        return sources.stream().filter(s -> s.id().equals(id)).findFirst();
    }

    /** The first source whose {@code recognize} matches wins; availability is ignored on purpose. */
    @Override
    public final Optional<R> identify(String sourceUrl) {
        return sources.stream().map(s -> s.identify(sourceUrl)).flatMap(Optional::stream).findFirst();
    }

    @Override
    public final I resolve(UUID userId, R ref) {
        var source = source(ref.sourceId())
                .orElseThrow(() -> new IllegalArgumentException("ref of an unregistered source: " + ref.sourceId()));
        // one details token per resolve (create, details and TV refresh share the bucket); identify spent none
        limiter.acquire(userId, RateLimiter.Kind.DETAILS);
        return source.resolve(userId, ref);
    }
}
