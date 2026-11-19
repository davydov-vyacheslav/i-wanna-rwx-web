package com.javanix.rwx.datasource.internal.provider;

import java.util.Optional;
import java.util.UUID;

/**
 * What a source needs from key storage: the user's saved key. Implemented by
 * {@link UserDataSourceService}; a source never reads the table itself.
 */
public interface SourceKeys {

    /** The user's saved key for the source, empty when none. Never log or return it. */
    Optional<String> keyOf(UUID userId, SourceInfo source);
}
