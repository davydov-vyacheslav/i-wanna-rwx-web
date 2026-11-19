package com.javanix.rwx.media.common;

import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;

/** Provider-sourced rows the create path cannot produce until media-search; plain SQL, asserted on through the service. */
public final class MediaSeed {

    private MediaSeed() {}

    public static UUID book(JdbcClient jdbc, UUID user, String title, String externalId, String isbn) {
        var id = UUID.randomUUID();
        jdbc.sql("""
                insert into books (id, user_id, title, source, external_id, external_link, isbn)
                values (?, ?, ?, 'open_library', ?, ?, ?)
                """).params(id, user, title, externalId, MediaUrls.openLibrary(externalId), isbn).update();
        return id;
    }

    public static UUID movie(JdbcClient jdbc, UUID user, String type, String title, String originalTitle, String externalId) {
        var id = UUID.randomUUID();
        jdbc.sql("""
                insert into movies (id, user_id, title, original_title, type, source, external_id, external_link)
                values (?, ?, ?, ?, ?, 'tmdb', ?, ?)
                """).params(id, user, title, originalTitle, type, externalId, MediaUrls.tmdb(type, externalId)).update();
        return id;
    }
}
