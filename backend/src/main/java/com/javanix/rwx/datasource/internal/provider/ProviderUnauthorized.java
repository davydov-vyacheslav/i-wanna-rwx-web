package com.javanix.rwx.datasource.internal.provider;

import com.javanix.rwx.datasource.CatalogException;

/**
 * The provider answered 401. A plain {@code ProviderError} to everybody who does not care; the TMDb source turns it
 * into {@code SourceKeyInvalid} (an Open Library 401 would just be a provider error).
 */
public class ProviderUnauthorized extends CatalogException.ProviderError {

    public ProviderUnauthorized(String source) {
        super(source);
    }
}
