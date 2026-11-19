package com.javanix.rwx.media.common;

import java.nio.charset.StandardCharsets;

/**
 * Draft links built independently of the production {@code AbstractDraftResolver} (in datasource): the encoding rule
 * is restated here so a bug in one is not hidden by the other; the shared vector file keeps both honest.
 */
public final class MediaUrls {

    private static final String GOOGLE = "https://www.google.com/search?q=";

    private MediaUrls() {}

    /** The draft link of a text already in NFC and trimmed. */
    public static String draft(String text) {
        var sb = new StringBuilder(GOOGLE);
        for (var b : text.getBytes(StandardCharsets.UTF_8)) {
            var c = b & 0xFF;
            if (c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || "-._~".indexOf(c) >= 0) {
                sb.append((char) c);
            } else {
                sb.append(String.format("%%%02X", c));
            }
        }
        return sb.toString();
    }

    public static String openLibrary(String workId) {
        return "https://openlibrary.org/works/" + workId;
    }

    public static String tmdb(String type, String id) {
        return "https://www.themoviedb.org/" + type + "/" + id;
    }
}
