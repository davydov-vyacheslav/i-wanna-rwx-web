package com.javanix.rwx.datasource.internal.web;

import com.javanix.rwx.api.SearchApi;
import com.javanix.rwx.api.model.BookDetails;
import com.javanix.rwx.api.model.BookSearchHit;
import com.javanix.rwx.api.model.BookSearchSourceId;
import com.javanix.rwx.api.model.MovieDetails;
import com.javanix.rwx.api.model.MovieSearchHit;
import com.javanix.rwx.api.model.MovieSearchSourceId;
import com.javanix.rwx.api.model.ResourceType;
import com.javanix.rwx.common.InvalidRequestException;
import com.javanix.rwx.common.NotFoundException;
import com.javanix.rwx.common.Violation;
import com.javanix.rwx.datasource.BookItem;
import com.javanix.rwx.datasource.CatalogException.ProviderError;
import com.javanix.rwx.datasource.CatalogException.SourceNotFound;
import com.javanix.rwx.datasource.MediaItem;
import com.javanix.rwx.datasource.MovieItem;
import com.javanix.rwx.common.validators.HttpUrls;
import com.javanix.rwx.datasource.internal.AbstractDraftResolver;
import com.javanix.rwx.datasource.internal.book.BookCatalogService;
import com.javanix.rwx.datasource.internal.movie.MovieCatalogService;
import com.javanix.rwx.datasource.internal.provider.RateLimiter;
import com.javanix.rwx.datasource.internal.provider.UserDataSourceService;
import com.javanix.rwx.identity.CurrentUserProvider;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/**
 * Search is internal to the source SPI, hence here and not in {@code media}. Not transactional: a provider call never
 * holds a database connection. The query text is never logged.
 */
@RestController
class SearchController implements SearchApi {

    private static final int MAX_URL_LENGTH = 4096;

    private final CurrentUserProvider currentUser;
    private final UserDataSourceService sources;
    private final BookCatalogService books;
    private final MovieCatalogService movies;
    private final RateLimiter limiter;

    SearchController(CurrentUserProvider currentUser, UserDataSourceService sources, BookCatalogService books,
            MovieCatalogService movies, RateLimiter limiter) {
        this.currentUser = currentUser;
        this.sources = sources;
        this.books = books;
        this.movies = movies;
        this.limiter = limiter;
    }

    @Override
    public ResponseEntity<List<BookSearchHit>> searchBooks(String q, BookSearchSourceId source) {
        var text = text(q);
        var userId = currentUser.current().id();
        var id = source != null ? source.getValue() : sources.effective(userId, ResourceType.BOOK).id();
        var chosen = books.source(id).orElseThrow(SearchController::unknownSource);
        limiter.acquire(userId, RateLimiter.Kind.SEARCH);
        var hits = new ArrayList<>(chosen.search(userId, text).stream().map(SearchController::hit).toList());
        hits.add(new BookSearchHit(BookSearchHit.KindEnum.DRAFT, URI.create(AbstractDraftResolver.build(text)), text));
        return ResponseEntity.ok(hits);
    }

    @Override
    public ResponseEntity<List<MovieSearchHit>> searchMovies(String q, MovieSearchSourceId source) {
        var text = text(q);
        var userId = currentUser.current().id();
        var id = source != null ? source.getValue() : sources.effective(userId, ResourceType.MOVIE).id();
        var chosen = movies.source(id).orElseThrow(SearchController::unknownSource);
        limiter.acquire(userId, RateLimiter.Kind.SEARCH);
        var hits = new ArrayList<>(chosen.search(userId, text).stream().map(SearchController::hit).toList());
        hits.add(new MovieSearchHit(MovieSearchHit.KindEnum.DRAFT, URI.create(AbstractDraftResolver.build(text)), text));
        return ResponseEntity.ok(hits);
    }

    // identify spends no limiter token; resolve spends one DETAILS token and shares the cache with create
    @Override
    public ResponseEntity<BookDetails> getBookDetails(String sourceUrl) {
        var ref = books.identify(sourceUrl(sourceUrl)).orElseThrow(() -> InvalidRequestException.unrecognizedSourceUrl());
        try {
            return ResponseEntity.ok(details(books.resolve(currentUser.current().id(), ref)));
        } catch (SourceNotFound e) {
            throw new NotFoundException();
        }
    }

    @Override
    public ResponseEntity<MovieDetails> getMovieDetails(String sourceUrl) {
        var ref = movies.identify(sourceUrl(sourceUrl)).orElseThrow(() -> InvalidRequestException.unrecognizedSourceUrl());
        try {
            return ResponseEntity.ok(details(movies.resolve(currentUser.current().id(), ref)));
        } catch (SourceNotFound e) {
            throw new NotFoundException();
        }
    }

    private static String sourceUrl(String sourceUrl) {
        if (sourceUrl.isEmpty() || sourceUrl.length() > MAX_URL_LENGTH || HttpUrls.parse(sourceUrl).isEmpty()) {
            throw new InvalidRequestException(List.of(new Violation("sourceUrl", "must be an http(s) URL of 1 to 4096 characters")));
        }
        return sourceUrl;
    }

    /** The draft text rules, plus the search minimum. */
    private static String text(String q) {
        return Optional.ofNullable(q).flatMap(AbstractDraftResolver::normalizeText)
                .filter(t -> t.codePointCount(0, t.length()) >= AbstractDraftResolver.MIN_SEARCH_CODE_POINTS)
                .orElseThrow(() -> new InvalidRequestException(List.of(new Violation("q",
                        "must be " + AbstractDraftResolver.MIN_SEARCH_CODE_POINTS + " to "
                                + AbstractDraftResolver.MAX_TEXT_CODE_POINTS + " characters without control characters"))));
    }

    // an enum value that is not a registered source of the type (the list in /data-sources)
    private static InvalidRequestException unknownSource() {
        return new InvalidRequestException(List.of(new Violation("source", "is not a source of this type")));
    }

    // derived URLs are built by the sources, but a value the contract's uri format cannot carry must not become a 500
    static URI uri(MediaItem<?> item, String url) {
        return url == null ? null : HttpUrls.parse(url).orElseThrow(() -> new ProviderError(item.ref().sourceId()));
    }

    private static BookSearchHit hit(BookItem item) {
        return new BookSearchHit(BookSearchHit.KindEnum.PROVIDER, uri(item, item.externalLink()), item.title())
                .author(item.author()).year(item.year()).rating(item.rating())
                .coverUrl(uri(item, item.coverUrl())).isbn(item.isbn());
    }

    private static MovieSearchHit hit(MovieItem item) {
        return new MovieSearchHit(MovieSearchHit.KindEnum.PROVIDER, uri(item, item.externalLink()), item.title())
                .type(MovieSearchHit.TypeEnum.fromValue(item.ref().type().value())).originalTitle(item.originalTitle())
                .description(item.description()).year(item.year()).rating(item.rating())
                .posterUrl(uri(item, item.posterUrl()));
    }

    private static BookDetails details(BookItem item) {
        return new BookDetails(item.title(), uri(item, item.externalLink())).author(item.author())
                .description(item.description()).coverUrl(uri(item, item.coverUrl()))
                .year(item.year()).rating(item.rating()).isbn(item.isbn());
    }

    private static MovieDetails details(MovieItem item) {
        return new MovieDetails(MovieDetails.TypeEnum.fromValue(item.ref().type().value()), item.title(),
                uri(item, item.externalLink())).originalTitle(item.originalTitle()).description(item.description())
                .posterUrl(uri(item, item.posterUrl())).year(item.year())
                .rating(item.rating())
                .tvStatus(item.tvStatus() == null ? null : MovieDetails.TvStatusEnum.fromValue(item.tvStatus().value()))
                .seasonCount(item.seasonCount());
    }
}
