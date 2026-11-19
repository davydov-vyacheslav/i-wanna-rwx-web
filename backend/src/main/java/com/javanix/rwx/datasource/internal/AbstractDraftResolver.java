package com.javanix.rwx.datasource.internal;

import static java.nio.charset.StandardCharsets.UTF_8;

import com.javanix.rwx.common.validators.HttpUrls;
import com.javanix.rwx.datasource.MediaItem;
import com.javanix.rwx.datasource.MediaRef;
import com.javanix.rwx.datasource.MediaResolver;
import java.net.URLDecoder;
import java.text.Normalizer;
import java.util.Optional;
import java.util.UUID;
import org.springframework.web.util.UriComponentsBuilder;
import org.springframework.web.util.UriUtils;

/**
 * The draft source as a resolver: the user's typed text as a Google web-search link,
 * {@code https://www.google.com/search?q=<percent-encoded text>}, nothing is ever fetched. The ref's
 * {@code externalId} is the normalized text itself, so resolving is pure; only the ref and item types differ per
 * resource type (the book and movie beans extend this). The link and text rules are the static methods below, the one
 * implementation of the rule; the client twin {@code draftLink} agrees through
 * {@code api/test-vectors/source-urls.json}.
 */
public abstract class AbstractDraftResolver<R extends MediaRef, I extends MediaItem<R>> implements MediaResolver<R, I> {

    @Override
    public Optional<R> identify(String sourceUrl) {
        return parse(sourceUrl).map(this::ref);
    }

    @Override
    public I resolve(UUID userId, R ref) {
        if (!MediaResolver.DRAFT.equals(ref.sourceId())) {
            throw new IllegalArgumentException("not a draft ref");
        }
        var text = normalizeText(ref.externalId())
                .orElseThrow(() -> new IllegalArgumentException("invalid draft text"));
        return item(ref, text);
    }

    /** @param text valid, normalized */
    protected abstract R ref(String text);

    /** @param text valid, normalized */
    protected abstract I item(R ref, String text);

    public static final int MAX_TEXT_CODE_POINTS = 200;

    private static final String PREFIX = "https://www.google.com/search?q=";

    /** The draft text of a draft link, or empty when the URL is not a valid draft link (every reason alike). */
    public static Optional<String> parse(String url) {
        // URI accepts non-ASCII "other" characters (vector "raw non-ASCII"); a draft link is printable ASCII only
        if (url == null || !url.chars().allMatch(c -> c > 0x20 && c < 0x7F)) {
            return Optional.empty();
        }
        return HttpUrls.parse(url)
                .filter(u -> u.getScheme().equalsIgnoreCase("https") && u.getHost().equalsIgnoreCase("www.google.com")
                        && u.getUserInfo() == null && (u.getPort() == -1 || u.getPort() == 443)
                        && "/search".equals(u.getRawPath()))
                .map(u -> UriComponentsBuilder.fromUri(u).build().getQueryParams().get("q"))
                .filter(values -> values != null && values.size() == 1)
                .flatMap(values -> decode(values.get(0)))
                .flatMap(AbstractDraftResolver::normalizeText);
    }

    /** The canonical link of a valid text; the text is normalized first. @throws IllegalArgumentException if invalid */
    public static String build(String text) {
        var normalized = normalizeText(text).orElseThrow(() -> new IllegalArgumentException("invalid draft text"));
        // UriUtils.encode leaves only the RFC 3986 unreserved characters, space is %20
        return PREFIX + UriUtils.encode(normalized, UTF_8);
    }

    /**
     * The draft text rules: NFC, strip, 1..200 code points, no ISO control character, no lone surrogate and not U+FFFD (what a decoder
     * substitutes for invalid UTF-8, so a text with it could not round-trip through build and parse). Empty when a
     * rule fails.
     */
    public static Optional<String> normalizeText(String raw) {
        if (raw == null || raw.codePoints().anyMatch(cp -> Character.isISOControl(cp) || cp == 0xFFFD
                || cp >= 0xD800 && cp <= 0xDFFF)) {
            return Optional.empty();
        }
        var text = Normalizer.normalize(raw, Normalizer.Form.NFC).strip();
        var length = text.codePointCount(0, text.length());
        return length >= 1 && length <= MAX_TEXT_CODE_POINTS ? Optional.of(text) : Optional.empty();
    }

    /**
     * {@code +} is a space; URLDecoder reports invalid UTF-8 as U+FFFD (rejected later by {@link #normalizeText}) and a
     * malformed escape as an exception.
     */
    private static Optional<String> decode(String value) {
        try {
            return Optional.of(URLDecoder.decode(value == null ? "" : value, UTF_8));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
