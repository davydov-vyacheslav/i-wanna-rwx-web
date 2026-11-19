package com.javanix.rwx.datasource.internal.provider;

import com.javanix.rwx.api.model.ResourceType;

/** A bare {@link SourceInfo} for the derivation and key tests: no provider behind it. */
public record StubSource(ResourceType resourceType, String id, boolean requiresKey) implements SourceInfo {

    @Override
    public String label() {
        return "Stub " + id;
    }
}
