package com.javanix.rwx.identity;

import com.javanix.rwx.api.model.Book;
import com.javanix.rwx.api.model.License;
import com.javanix.rwx.api.model.Movie;
import com.javanix.rwx.api.model.Subscription;
import java.util.List;
import java.util.UUID;

/**
 * Implemented by domain modules to add their live records to {@code GET /me/export}. Every method receives the
 * id of the caller and must return only that user's non-deleted records; secrets (license keys excepted as the
 * contract defines, TMDb tokens never) and session data are not exported.
 */
public interface AccountExportContributor {

    default List<Book> books(UUID userId) {
        return List.of();
    }

    default List<Movie> movies(UUID userId) {
        return List.of();
    }

    default List<Subscription> subscriptions(UUID userId) {
        return List.of();
    }

    default List<License> licenses(UUID userId) {
        return List.of();
    }
}
