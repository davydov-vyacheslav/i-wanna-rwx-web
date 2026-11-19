package com.javanix.rwx.datasource.internal.provider;

import com.javanix.rwx.api.model.ResourceType;

/**
 * What every data source says about itself, whatever its resource type. {@code provider} knows only this interface,
 * so the key service and the directory work without depending on {@code book} or {@code movie}.
 */
public interface SourceInfo {

    /** The wire id (the contract's {@code DataSourceId} value, e.g. {@code open_library}). */
    String id();

    ResourceType resourceType();

    /** Display name, e.g. "Open Library". */
    String label();

    /** True when the user must save an API key before the source is usable. */
    boolean requiresKey();

    /**
     * Format check and provider check of a key the user is saving. The default accepts anything (a source without a
     * key never gets here).
     *
     * @throws com.javanix.rwx.common.InvalidRequestException the key breaks the source's format
     * @throws SourceKeyRejectedException                     the provider refused the key
     */
    default void validateKey(String key) {
    }
}
