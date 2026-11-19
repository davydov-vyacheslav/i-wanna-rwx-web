package com.javanix.rwx.datasource.internal.movie.tmdb;

import com.javanix.rwx.api.model.MovieSourceId;
import com.javanix.rwx.common.InvalidRequestException;
import java.net.URI;
import com.javanix.rwx.common.Violation;
import com.github.benmanes.caffeine.cache.Cache;
import com.javanix.rwx.datasource.CatalogException.ProviderError;
import com.javanix.rwx.datasource.CatalogException.SourceKeyInvalid;
import com.javanix.rwx.datasource.CatalogException.SourceKeyMissing;
import com.javanix.rwx.datasource.CatalogException.SourceNotFound;
import com.javanix.rwx.datasource.MovieItem;
import com.javanix.rwx.datasource.MovieRef;
import com.javanix.rwx.datasource.MovieType;
import com.javanix.rwx.datasource.TvStatus;
import com.javanix.rwx.datasource.internal.movie.MovieSource;
import com.javanix.rwx.datasource.internal.movie.tmdb.TmdbApi.Images;
import com.javanix.rwx.datasource.internal.movie.tmdb.TmdbApi.Media;
import com.javanix.rwx.datasource.internal.provider.ProviderUnauthorized;
import com.javanix.rwx.datasource.internal.provider.SourceKeyRejectedException;
import com.javanix.rwx.datasource.internal.provider.SourceKeys;
import com.javanix.rwx.datasource.internal.provider.Texts;
import com.javanix.rwx.settings.SettingsService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import org.springframework.web.service.registry.ImportHttpServices;

/**
 * Movies and TV from TMDb with the user's own key (read inside each call through {@link SourceKeys}). Available once a
 * key is saved; {@code recognize} is pure and ignores availability. The user's UI locale is the {@code language} of
 * every call and part of the cache key. A 401 sets the {@code rejected} marker and surfaces as {@code SourceKeyInvalid};
 * network errors leave the status alone. No credits calls: no stored field needs them.
 */
@Component
@ImportHttpServices(group = "tmdb", types = TmdbApi.class)
public class TmdbSource implements MovieSource {

    private static final Set<String> HOSTS = Set.of("www.themoviedb.org", "themoviedb.org");
    private static final Pattern PAGE_PATH = Pattern.compile("^/(movie|tv)/([1-9][0-9]{0,9})(-[^/]*)?(/.*)?$");
    private static final String CANONICAL_BASE = "https://www.themoviedb.org/";
    private static final String IMAGE_HOST_PREFIX = "https://image.tmdb.org/";
    private static final String DEFAULT_IMAGE_BASE = "https://image.tmdb.org/t/p/w342";
    private static final Pattern SIZE = Pattern.compile("^w([0-9]{2,4})$");
    private static final Duration IMAGE_CONFIG_TTL = Duration.ofHours(24);
    private static final Duration IMAGE_CONFIG_FALLBACK_TTL = Duration.ofMinutes(1);
    private static final int MIN_POSTER_WIDTH = 250;
    private static final int MAX_HITS = 10;
    private static final Pattern KEY_FORMAT = Pattern.compile("^[A-Za-z0-9._-]{20,512}$");
    private static final Pattern V3_KEY = Pattern.compile("^[0-9a-fA-F]{32}$");
    private static final Pattern POSTER_PATH = Pattern.compile("^/[A-Za-z0-9._-]{1,200}$");
    private static final Pattern IMAGE_BASE = Pattern.compile("^https://[a-z0-9.-]+(/[A-Za-z0-9._-]+)*/?$");

    private record ImageBase(String url, long expiresAtNanos) {
    }

    private final TmdbApi api;
    private final Cache<String, Object> cache;
    private final SourceKeys keys;
    private final SettingsService settings;
    // global, not user data: the poster base and size depend on TMDb's configuration only
    private final AtomicReference<ImageBase> imageBase = new AtomicReference<>();

    // @Lazy breaks the cycle directory -> sources -> key storage -> directory: the keys are first used by a request
    public TmdbSource(TmdbApi api, Cache<String, Object> cache, @Lazy SourceKeys keys, SettingsService settings) {
        this.api = api;
        this.cache = cache;
        this.keys = keys;
        this.settings = settings;
    }

    @Override
    public MovieSourceId sourceId() {
        return MovieSourceId.TMDB;
    }

    @Override
    public String label() {
        return "TMDb";
    }

    @Override
    public boolean requiresKey() {
        return true;
    }

    /**
     * Format check (20 to 512 characters of letters, digits, '.', '_', '-': a v4 read access token or a v3 key), then
     * {@code GET /authentication} with the key. 401 refuses the key; a missing check endpoint is a failed check (502);
     * other provider failures keep their own kind (a 429 is 503 {@code provider_rate_limited}, a timeout 504).
     */
    @Override
    public void validateKey(String key) {
        if (!KEY_FORMAT.matcher(key).matches()) {
            throw new InvalidRequestException(List.of(new Violation("apiKey",
                    "must be 20 to 512 characters: letters, digits, '.', '_' or '-'")));
        }
        try {
            api.authentication(apiKey(key), bearer(key));
        } catch (ProviderUnauthorized e) {
            throw new SourceKeyRejectedException(id());
        } catch (SourceNotFound e) {
            throw new ProviderError(id());
        }
    }

    @Override
    public boolean isAvailable(UUID userId) {
        return keys.keyOf(userId, this).isPresent();
    }

    @Override
    public Optional<MovieRef> recognize(URI url) {
        // exact host match also rejects a trailing dot; userinfo and a foreign port could point elsewhere
        var defaultPort = url.getScheme().equalsIgnoreCase("https") ? 443 : 80;
        if (!HOSTS.contains(url.getHost().toLowerCase(Locale.ROOT)) || url.getUserInfo() != null
                || url.getPort() != -1 && url.getPort() != defaultPort) {
            return Optional.empty();
        }
        var m = PAGE_PATH.matcher(url.getRawPath());
        if (!m.matches()) {
            return Optional.empty();
        }
        return Optional.of(ref("movie".equals(m.group(1)) ? MovieType.MOVIE : MovieType.TV, m.group(2)));
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<MovieItem> search(UUID userId, String q) {
        var key = keyOrThrow(userId);
        var language = language(userId);
        return (List<MovieItem>) cache.get("tmdb:search:" + language + ":" + q, k -> call(() -> {
            var found = Texts.body(id(), api.search(q, language, false, 1, apiKey(key), bearer(key)));
            return hits(found.results(), imageBase(key));
        }));
    }

    @Override
    public MovieItem resolve(UUID userId, MovieRef ref) {
        var key = keyOrThrow(userId);
        var language = language(userId);
        var type = ref.type().value();
        return (MovieItem) cache.get("tmdb:item:" + language + ":" + type + ":" + ref.externalId(), k -> call(() -> {
            var media = Texts.body(id(), api.details(type, ref.externalId(), language, apiKey(key), bearer(key)));
            return item(ref, media, imageBase(key));
        }));
    }

    private String keyOrThrow(UUID userId) {
        return keys.keyOf(userId, this).orElseThrow(() -> new SourceKeyMissing(id()));
    }

    private String language(UUID userId) {
        return settings.get(userId).locale().getValue();
    }

    /** A 401 means the saved key no longer works: tell the caller. */
    private <T> T call(Supplier<T> request) {
        try {
            return request.get();
        } catch (ProviderUnauthorized e) {
            throw new SourceKeyInvalid(id());
        }
    }

    private List<MovieItem> hits(List<Media> results, String posterBase) {
        var out = new ArrayList<MovieItem>();
        for (var result : results == null ? List.<Media>of() : results) {
            if (out.size() >= MAX_HITS) {
                break;
            }
            var type = result == null ? null : mediaType(result.mediaType());
            var id = result == null ? null : id(result.id());
            if (type == null || id == null) {
                continue; // persons and anything else we cannot add
            }
            var tv = type == MovieType.TV;
            String title;
            try {
                title = Texts.title(id(), tv ? result.name() : result.title());
            } catch (ProviderError e) {
                continue; // a hit without a title is unusable; it does not fail the whole search
            }
            out.add(movie(ref(type, id), title, result, posterBase, null, null));
        }
        return List.copyOf(out);
    }

    private MovieItem item(MovieRef ref, Media media, String posterBase) {
        var tv = ref.type() == MovieType.TV;
        var title = Texts.title(id(), tv ? media.name() : media.title());
        var seasons = media.numberOfSeasons();
        return movie(ref, title, media, posterBase, tv ? tvStatus(media.status()) : null,
                tv && seasons != null && seasons >= 0 ? seasons : null);
    }

    /** {@code media} is a search result or a details body: both use the same field names. */
    private MovieItem movie(MovieRef ref, String title, Media media, String posterBase, TvStatus status,
            Integer seasons) {
        var tv = ref.type() == MovieType.TV;
        return new MovieItem(ref, canonicalUrl(ref), title,
                Texts.optional(tv ? media.originalName() : media.originalTitle(), Texts.TITLE_MAX),
                Texts.optional(media.overview(), Texts.DESCRIPTION_MAX),
                posterUrl(posterBase, media.posterPath()),
                year(tv ? media.firstAirDate() : media.releaseDate()),
                rating(media.voteAverage()), status, seasons);
    }

    /** Built from the trusted base and a path that looks like a file path, never copied from the provider. */
    static String posterUrl(String base, String path) {
        if (base == null || path == null || !IMAGE_BASE.matcher(base).matches() || !POSTER_PATH.matcher(path).matches()) {
            return null;
        }
        return (base.endsWith("/") ? base.substring(0, base.length() - 1) : base) + path;
    }

    /** {@code Ended} and {@code Canceled} are ended, any other value is ongoing, null or blank is unknown. */
    private static TvStatus tvStatus(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        var s = raw.strip();
        return s.equalsIgnoreCase("Ended") || s.equalsIgnoreCase("Canceled") ? TvStatus.ENDED : TvStatus.ONGOING;
    }

    /** Absent stays absent; NaN or infinite is 0; otherwise clamped to 0..10 at one decimal. */
    static BigDecimal rating(Double raw) {
        if (raw == null) {
            return null;
        }
        return BigDecimal.valueOf(Double.isFinite(raw) ? Math.clamp(raw, 0, 10) : 0).setScale(1, RoundingMode.HALF_UP);
    }

    /** {@code YYYY-MM-DD}, or an empty string for an unknown date; anything else, or a year outside 1..3000, is no year. */
    private static Integer year(String date) {
        if (date == null || date.length() < 4 || !date.substring(0, 4).chars().allMatch(Character::isDigit)) {
            return null;
        }
        var year = Integer.parseInt(date.substring(0, 4));
        return year >= 1 && year <= 3000 ? year : null;
    }

    private static MovieType mediaType(String raw) {
        return "movie".equals(raw) ? MovieType.MOVIE : "tv".equals(raw) ? MovieType.TV : null;
    }

    /** A positive integer of at most 10 digits, as a string without leading zero. */
    private static String id(Long id) {
        return id != null && id > 0 && id <= 9_999_999_999L ? Long.toString(id) : null;
    }

    private static MovieRef ref(MovieType type, String id) {
        return new MovieRef(MovieSourceId.TMDB, type, id);
    }

    @Override
    public String canonicalUrl(MovieRef ref) {
        return CANONICAL_BASE + ref.type().value() + "/" + ref.externalId();
    }

    /**
     * Poster base plus size: the smallest {@code poster_sizes} entry of at least 250 px from {@code /configuration},
     * cached 24 h for everybody. Only an {@code image.tmdb.org} base is trusted; any failure of this call falls back
     * to the documented default for a minute and never fails the search or resolve (a bad key fails the main call).
     */
    private String imageBase(String key) {
        var cached = imageBase.get();
        var now = System.nanoTime();
        if (cached != null && now - cached.expiresAtNanos() < 0) {
            return cached.url();
        }
        ImageBase fresh;
        try {
            fresh = new ImageBase(posterBase(api.configuration(apiKey(key), bearer(key)).images()),
                    now + IMAGE_CONFIG_TTL.toNanos());
        } catch (RuntimeException e) {
            fresh = new ImageBase(DEFAULT_IMAGE_BASE, now + IMAGE_CONFIG_FALLBACK_TTL.toNanos());
        }
        imageBase.set(fresh);
        return fresh.url();
    }

    private static String posterBase(Images images) {
        var base = images == null ? null : images.secureBaseUrl();
        if (base == null || !base.startsWith(IMAGE_HOST_PREFIX)) {
            return DEFAULT_IMAGE_BASE;
        }
        String best = null;
        var bestWidth = Integer.MAX_VALUE;
        for (var size : images.posterSizes() == null ? List.<String>of() : images.posterSizes()) {
            var m = SIZE.matcher(size == null ? "" : size);
            if (m.matches()) {
                var width = Integer.parseInt(m.group(1));
                if (width >= MIN_POSTER_WIDTH && width < bestWidth) {
                    best = size;
                    bestWidth = width;
                }
            }
        }
        return (base.endsWith("/") ? base : base + "/") + (best == null ? "w342" : best);
    }

    /** A v3 key (32 hex) goes in the query; a v4 read access token goes as a bearer header and stays out of the URL. */
    private static String apiKey(String key) {
        return V3_KEY.matcher(key).matches() ? key : null;
    }

    private static String bearer(String key) {
        return V3_KEY.matcher(key).matches() ? null : "Bearer " + key;
    }
}
