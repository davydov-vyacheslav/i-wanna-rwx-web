package com.javanix.rwx.common.validators;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Optional;

/**
 * The shared first step of every source recognizer: a plain {@link URI} parse of a client-supplied URL that is never
 * requested. Anything that is not an http(s) URL with a host is "not a URL we know" (empty), never an exception. The
 * parser is deliberately lenient (userinfo, any port, a trailing dot are all kept); each source's {@code recognize}
 * rejects what it cares about, comparing {@code getHost()} lowercased and the raw path and query before any
 * percent-decoding.
 */
public final class HttpUrls {

    private HttpUrls() {}

    public static Optional<URI> parse(String raw) {
        if (raw == null || raw.isEmpty()) {
            return Optional.empty();
        }
        URI uri;
        try {
            uri = new URI(raw);
        } catch (URISyntaxException e) {
            return Optional.empty();
        }
        var scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        var http = scheme.equals("http") || scheme.equals("https");
        return http && uri.getHost() != null && !uri.getHost().isEmpty() ? Optional.of(uri) : Optional.empty();
    }
}
