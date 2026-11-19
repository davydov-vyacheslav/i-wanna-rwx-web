package com.javanix.rwx.datasource;

import com.javanix.rwx.api.model.MovieSourceId;

/** A movie or TV series on a source; {@code type} is part of the identity. */
public record MovieRef(MovieSourceId source, MovieType type, String externalId) implements MediaRef {

    @Override
    public String sourceId() {
        return source.getValue();
    }
}
