package com.javanix.rwx.identity;

import com.javanix.rwx.api.model.Book;
import com.javanix.rwx.api.model.DefaultDataSource;
import com.javanix.rwx.api.model.License;
import com.javanix.rwx.api.model.Movie;
import com.javanix.rwx.api.model.Subscription;
import com.javanix.rwx.api.model.UserSettings;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Implemented by domain modules to add their live records to {@code GET /me/export}. Every method receives the
 * id of the caller and must return only that user's non-deleted records; secrets (data source API keys never) and session
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

    default List<Book> books(UUID userId) {
        return List.of();
    }

    default List<Movie> movies(UUID userId) {
        return List.of();
    }

    default List<Subscription> subscriptions(UUID userId) {
        return List.of();
    }

    /** Includes the license key in plaintext (accepted trade-off until the Security phase). */
    default List<License> licenses(UUID userId) {
        return List.of();
    }
}
