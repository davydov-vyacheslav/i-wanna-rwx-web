package com.javanix.rwx.datasource.internal.movie;

import com.javanix.rwx.api.model.MovieSourceId;
import java.net.URI;
import com.javanix.rwx.datasource.MovieItem;
import com.javanix.rwx.datasource.MovieRef;
import com.javanix.rwx.datasource.MovieType;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.BiFunction;

/** Test-only SPI implementation: recognizes {@code https://<host>/movie|tv/<id>}. */
public class FakeMovieSource implements MovieSource {

    public final MovieSourceId id;
    public final String host;
    public boolean available = true;
    public boolean requiresKey = false;
    public BiFunction<UUID, MovieRef, MovieItem> resolver;
    public final List<String> calls = new ArrayList<>();

    public FakeMovieSource(MovieSourceId id, String host) {
        this.id = id;
        this.host = host;
        this.resolver = (user, ref) -> new MovieItem(ref, "https://" + host + "/" + ref.type().value() + "/" + ref.externalId(), "Title " + ref.externalId(), null, null, null, null, null, null, null);
    }

    @Override
    public MovieSourceId sourceId() {
        return id;
    }

    @Override
    public String label() {
        return "Fake " + id.getValue();
    }

    @Override
    public boolean requiresKey() {
        return requiresKey;
    }

    @Override
    public boolean isAvailable(UUID userId) {
        return available;
    }

    @Override
    public Optional<MovieRef> recognize(URI url) {
        var port = url.getPort();
        var defaultPort = url.getScheme().equalsIgnoreCase("https") ? 443 : 80;
        if (!url.getHost().equalsIgnoreCase(host) || url.getUserInfo() != null || port != -1 && port != defaultPort) {
            return Optional.empty();
        }
        for (var type : MovieType.values()) {
            var prefix = "/" + type.value() + "/";
            if (url.getRawPath().startsWith(prefix)) {
                var externalId = url.getRawPath().substring(prefix.length());
                return Optional.of(new MovieRef(id, type, externalId));
            }
        }
        return Optional.empty();
    }

    @Override
    public String canonicalUrl(MovieRef ref) {
        return "https://" + host + "/" + ref.type().value() + "/" + ref.externalId();
    }

    @Override
    public List<MovieItem> search(UUID userId, String q) {
        calls.add("search");
        return List.of();
    }

    @Override
    public MovieItem resolve(UUID userId, MovieRef ref) {
        calls.add("resolve");
        return resolver.apply(userId, ref);
    }
}
