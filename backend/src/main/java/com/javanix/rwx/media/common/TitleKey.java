package com.javanix.rwx.media.common;

import java.text.Normalizer;
import java.util.Locale;

/**
 * The normalized-title comparison key: NFC, trim, {@code toLowerCase(Locale.ROOT)}, NFC. It is a draft's
 * {@code externalId} and the key of the draft-vs-title duplicate rule; the client twin {@code titleKey} reads the
 * same vectors ({@code api/test-vectors/source-urls.json}). Idempotent. {@code ё} and {@code е} stay different.
 */
public final class TitleKey {

    private TitleKey() {}

    public static String of(String text) {
        return Normalizer.normalize(Normalizer.normalize(text, Normalizer.Form.NFC).strip().toLowerCase(Locale.ROOT), Normalizer.Form.NFC);
    }
}
