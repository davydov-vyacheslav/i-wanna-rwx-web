package com.javanix.rwx.datasource.internal.book;

import com.javanix.rwx.api.model.BookSourceId;
import java.net.URI;
import com.javanix.rwx.datasource.BookItem;
import com.javanix.rwx.datasource.BookRef;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.BiFunction;

/** Test-only SPI implementation: recognizes {@code https://<host>/works/<id>}; counts calls so tests can prove "no I/O". */
public class FakeBookSource implements BookSource {

    public final BookSourceId id;
    public final String host;
    public boolean available = true;
    public boolean requiresKey = false;
    public BiFunction<UUID, BookRef, BookItem> resolver;
    public final List<String> calls = new ArrayList<>();

    public FakeBookSource(BookSourceId id, String host) {
        this.id = id;
        this.host = host;
        this.resolver = (user, ref) -> new BookItem(ref, "https://" + host + "/works/" + ref.externalId(), "Title " + ref.externalId(), null, null, null, null, null, null);
    }

    @Override
    public BookSourceId sourceId() {
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
    public Optional<BookRef> recognize(URI url) {
        var port = url.getPort();
        var defaultPort = url.getScheme().equalsIgnoreCase("https") ? 443 : 80;
        if (!url.getHost().equalsIgnoreCase(host) || url.getUserInfo() != null || port != -1 && port != defaultPort
                || !url.getRawPath().startsWith("/works/")) {
            return Optional.empty();
        }
        var externalId = url.getRawPath().substring("/works/".length());
        return Optional.of(new BookRef(id, externalId));
    }

    @Override
    public String canonicalUrl(BookRef ref) {
        return "https://" + host + "/works/" + ref.externalId();
    }

    @Override
    public List<BookItem> search(UUID userId, String q) {
        calls.add("search");
        return List.of();
    }

    @Override
    public BookItem resolve(UUID userId, BookRef ref) {
        calls.add("resolve");
        return resolver.apply(userId, ref);
    }
}
