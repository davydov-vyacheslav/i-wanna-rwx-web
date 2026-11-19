package com.javanix.rwx.datasource.internal.book.openlibrary;

import com.javanix.rwx.api.model.BookSourceId;
import java.net.URI;
import com.github.benmanes.caffeine.cache.Cache;
import com.javanix.rwx.datasource.BookItem;
import com.javanix.rwx.datasource.BookRef;
import com.javanix.rwx.datasource.CatalogException.ProviderError;
import com.javanix.rwx.datasource.CatalogException;
import com.javanix.rwx.datasource.internal.book.BookSource;
import com.javanix.rwx.datasource.internal.book.openlibrary.OpenLibraryApi.Doc;
import com.javanix.rwx.datasource.internal.provider.Texts;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.regex.Pattern;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.resilience.InvocationRejectedException;
import org.springframework.stereotype.Component;
import org.springframework.web.service.registry.ImportHttpServices;
import tools.jackson.databind.JsonNode;

/**
 * Books from Open Library: no key, always available. {@code recognize} is pure (design 15.3); every request goes
 * through the {@link OpenLibraryApi} client on the configured base URL (group {@code open-library}) with a path built from an id that matched the strict
 * pattern. A resolve needs two calls (the work for existence, title and description; a {@code key:} search for
 * author, year, cover, ISBN and rating) that run in parallel and either both succeed or the resolve fails.
 */
@Component
@ImportHttpServices(group = "open-library", types = OpenLibraryApi.class)
public class OpenLibrarySource implements BookSource, DisposableBean {

    private static final Set<String> HOSTS = Set.of("openlibrary.org", "www.openlibrary.org");
    // OL0W is not a work id and the 12-digit cap matches api/test-vectors/source-urls.json
    private static final String ID = "OL[1-9][0-9]{0,11}W";
    private static final Pattern PAGE_PATH = Pattern.compile("^/works/(" + ID + ")(/.*)?$");
    private static final Pattern WORK_KEY = Pattern.compile("^/works/(" + ID + ")$");
    private static final String CANONICAL_BASE = "https://openlibrary.org/works/";
    private static final int ISBN_MAX = 32;
    private static final String FIELDS = "key,title,author_name,cover_i,first_publish_year,ratings_average,isbn,"
            + "editions,editions.format";
    private static final String LOOKUP_FIELDS = "key,author_name,cover_i,first_publish_year,ratings_average,isbn";
    // an edition format that marks the work as an audiobook (Open Library mixes them into book search)
    private static final List<String> AUDIO_FORMATS = List.of("audio", "mp3", "cassette", "playaway");
    private static final int MAX_HITS = 10;
    private static final String COVERS_BASE = "https://covers.openlibrary.org";

    private static final Doc NO_DOC = new Doc(null, null, null, null, null, null, null, null);

    private final OpenLibraryApi api;
    private final Cache<String, Object> cache;
    private final ExecutorService parallel = Executors.newVirtualThreadPerTaskExecutor();

    public OpenLibrarySource(OpenLibraryApi api, Cache<String, Object> cache) {
        this.api = api;
        this.cache = cache;
    }

    @Override
    public BookSourceId sourceId() {
        return BookSourceId.OPEN_LIBRARY;
    }

    @Override
    public String label() {
        return "Open Library";
    }

    @Override
    public boolean requiresKey() {
        return false;
    }

    @Override
    public boolean isAvailable(UUID userId) {
        return true;
    }

    @Override
    public Optional<BookRef> recognize(URI url) {
        // exact host match also rejects a trailing dot; userinfo and a foreign port could point elsewhere
        var defaultPort = url.getScheme().equalsIgnoreCase("https") ? 443 : 80;
        if (!HOSTS.contains(url.getHost().toLowerCase(Locale.ROOT)) || url.getUserInfo() != null
                || url.getPort() != -1 && url.getPort() != defaultPort) {
            return Optional.empty();
        }
        var m = PAGE_PATH.matcher(url.getRawPath());
        return m.matches() ? Optional.of(ref(m.group(1))) : Optional.empty();
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<BookItem> search(UUID userId, String q) {
        return (List<BookItem>) cache.get("ol:search:" + q, k -> fetchHits(q));
    }

    @Override
    public BookItem resolve(UUID userId, BookRef ref) {
        return (BookItem) cache.get("ol:work:" + ref.externalId(), k -> fetchItem(ref));
    }

    private List<BookItem> fetchHits(String q) {
        var hits = new ArrayList<BookItem>();
        for (var doc : orEmpty(Texts.body(id(), api.search(q, MAX_HITS, FIELDS)).docs())) {
            if (hits.size() >= MAX_HITS) {
                break;
            }
            var key = WORK_KEY.matcher(doc.key() == null ? "" : doc.key());
            if (!key.matches() || isAudiobook(doc)) {
                continue;
            }
            String title;
            try {
                title = Texts.title(id(), doc.title());
            } catch (ProviderError e) {
                continue; // a hit without a title is unusable; it does not fail the whole search
            }
            hits.add(book(ref(key.group(1)), title, null, doc));
        }
        return List.copyOf(hits);
    }

    private BookItem fetchItem(BookRef ref) {
        var work = parallel.submit(() -> Texts.body(id(), api.work(ref.externalId())));
        var lookup = parallel.submit(() -> Texts.body(id(), api.search("key:/works/" + ref.externalId(), 1, LOOKUP_FIELDS)));
        try {
            var workBody = await(work, lookup);
            var docs = orEmpty(await(lookup, work).docs());
            var doc = docs.isEmpty() ? null : docs.getFirst();
            var found = doc != null && ("/works/" + ref.externalId()).equals(doc.key());
            var title = Texts.title(id(), workBody.title());
            // without the lookup match only the work's own fields are known
            return book(ref, title, description(workBody.description()), found ? doc : null);
        } finally {
            work.cancel(true);
            lookup.cancel(true);
        }
    }

    /** {@code doc} is a search doc (or null): author, cover, year, rating and ISBN come from it. */
    private BookItem book(BookRef ref, String title, String description, Doc doc) {
        var d = doc == null ? NO_DOC : doc;
        return new BookItem(ref, canonicalUrl(ref), title, Texts.optional(first(d.authorName()), Texts.AUTHOR_MAX),
                Texts.optional(description, Texts.DESCRIPTION_MAX), coverUrl(d.coverI()),
                year(d.firstPublishYear()), rating(d.ratingsAverage()), pickIsbn(orEmpty(d.isbn())));
    }

    private static String coverUrl(Long coverId) {
        return coverId != null && coverId > 0 ? COVERS_BASE + "/b/id/" + coverId + "-L.jpg" : null;
    }

    private static Integer year(Integer raw) {
        return raw != null && raw >= 1 && raw <= 3000 ? raw : null;
    }

    /** Absent stays absent; NaN or infinite is 0; otherwise clamped to 0..5 at one decimal. */
    static BigDecimal rating(Double raw) {
        if (raw == null) {
            return null;
        }
        return BigDecimal.valueOf(Double.isFinite(raw) ? Math.clamp(raw, 0, 5) : 0).setScale(1, RoundingMode.HALF_UP);
    }

    /** The provider's first non-blank ISBN, trimmed, only its length bounded (owner decision: no ISBN validation). */
    static String pickIsbn(List<String> raw) {
        return raw.stream().map(v -> Texts.optional(v, ISBN_MAX)).filter(Objects::nonNull).findFirst().orElse(null);
    }

    /** The result of {@code mine}; on failure stops {@code other} and rethrows the catalog failure. */
    private <T> T await(Future<T> mine, Future<?> other) {
        try {
            return mine.get();
        } catch (ExecutionException e) {
            other.cancel(true);
            throw e.getCause() instanceof CatalogException || e.getCause() instanceof InvocationRejectedException
                    ? (RuntimeException) e.getCause() : new ProviderError(id());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            other.cancel(true);
            throw new ProviderError(id());
        }
    }

    private static boolean isAudiobook(Doc doc) {
        return doc.editions() != null && orEmpty(doc.editions().docs()).stream()
                .flatMap(edition -> orEmpty(edition.format()).stream()).map(f -> f.toLowerCase(Locale.ROOT))
                .anyMatch(f -> AUDIO_FORMATS.stream().anyMatch(f::contains));
    }

    /** A work's description is a plain string or an object {@code {type, value}}. */
    private static String description(JsonNode node) {
        var text = node != null && node.isObject() ? node.get("value") : node;
        return text != null && text.isString() ? text.stringValue() : null;
    }

    private static String first(List<String> texts) {
        var all = orEmpty(texts);
        return all.isEmpty() ? null : all.getFirst();
    }

    /** A missing list is null, and so can its items be. */
    private static <T> List<T> orEmpty(List<T> list) {
        return list == null ? List.of() : list.stream().filter(Objects::nonNull).toList();
    }

    private static BookRef ref(String workId) {
        return new BookRef(BookSourceId.OPEN_LIBRARY, workId);
    }

    @Override
    public String canonicalUrl(BookRef ref) {
        return CANONICAL_BASE + ref.externalId();
    }

    @Override
    public void destroy() {
        parallel.shutdownNow();
    }
}
