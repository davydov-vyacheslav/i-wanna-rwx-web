package com.javanix.rwx.datasource.internal.movie;

import com.javanix.rwx.api.model.MovieSourceId;
import com.javanix.rwx.api.model.ResourceType;
import com.javanix.rwx.datasource.MovieItem;
import com.javanix.rwx.datasource.MovieRef;
import com.javanix.rwx.datasource.internal.provider.ResolvingSource;
import com.javanix.rwx.datasource.internal.provider.SourceInfo;
import java.util.List;
import java.util.UUID;

/** A movie and TV data source; same contract as {@code BookSource}, the ref also carries movie or tv. */
public interface MovieSource extends SourceInfo, ResolvingSource<MovieRef, MovieItem> {

    MovieSourceId sourceId();

    @Override
    default String id() {
        return sourceId().getValue();
    }

    @Override
    default ResourceType resourceType() {
        return ResourceType.MOVIE;
    }

    boolean isAvailable(UUID userId);

    String canonicalUrl(MovieRef ref);

    /**
     * Same contract as {@code BookSource.search}: partial items with the canonical {@code externalLink}; {@code tvStatus}
     * and {@code seasonCount} are always null (only {@link #resolve} provides them).
     */
    List<MovieItem> search(UUID userId, String q);
}
