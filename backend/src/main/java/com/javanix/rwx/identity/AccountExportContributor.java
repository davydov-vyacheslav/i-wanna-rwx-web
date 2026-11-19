package com.javanix.rwx.identity;

import com.javanix.rwx.api.model.DefaultDataSource;
import com.javanix.rwx.api.model.UserSettings;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Implemented by domain modules to add their live records to {@code GET /me/export}. Every method receives the
 * id of the caller and must return only that user's records; secrets (data source API keys never) and session
 * data are not exported.
 */
public interface AccountExportContributor {

    /** The user's settings record; exactly one contributor (the settings module) provides it. */
    default Optional<UserSettings> settings(UUID userId) {
        return Optional.empty();
    }

    /** The user's chosen default data sources only (a preference); never a key. */
    default List<DefaultDataSource> dataSources(UUID userId) {
        return List.of();
    }
}
