package com.javanix.rwx.datasource.internal.provider;

import com.javanix.rwx.datasource.CatalogException.ProviderError;

/**
 * The few text and body rules every source shares. Unicode normalization is not repeated here: storage and the duplicate key
 * apply their own.
 */
public final class Texts {

    public static final int TITLE_MAX = 500;
    public static final int AUTHOR_MAX = 500;
    public static final int DESCRIPTION_MAX = 20_000;

    private Texts() {}

    /** A provider answered 2xx with an empty body, which the client maps to null: a failure of the provider. */
    public static <T> T body(String sourceId, T body) {
        if (body == null) {
            throw new ProviderError(sourceId);
        }
        return body;
    }

    /** Stripped, cut at {@link #TITLE_MAX}; a blank title is a failure of the provider, never of an unnamed source. */
    public static String title(String sourceId, String raw) {
        var title = optional(raw, TITLE_MAX);
        if (title == null) {
            throw new ProviderError(sourceId);
        }
        return title;
    }

    /** Stripped, blank to null, cut at {@code max} code points. */
    public static String optional(String raw, int max) {
        if (raw == null) {
            return null;
        }
        var text = raw.strip();
        return text.isEmpty() ? null : cut(text, max);
    }

    /** At most {@code max} code points: a char based cut could split a surrogate pair. */
    public static String cut(String s, int max) {
        return s.codePointCount(0, s.length()) <= max ? s : s.substring(0, s.offsetByCodePoints(0, max));
    }
}
