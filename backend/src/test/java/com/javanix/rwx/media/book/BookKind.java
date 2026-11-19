package com.javanix.rwx.media.book;

import static com.javanix.rwx.testkit.ProviderStubs.json;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.javanix.rwx.api.model.BookSourceId;
import com.javanix.rwx.datasource.BookItem;
import com.javanix.rwx.datasource.BookRef;
import com.javanix.rwx.datasource.MediaResolver;
import com.javanix.rwx.datasource.internal.provider.Fixtures;
import com.javanix.rwx.identity.UserLock;
import com.javanix.rwx.media.common.MediaEntity;
import com.javanix.rwx.media.common.MediaKind;
import com.javanix.rwx.media.common.MediaSeed;
import com.javanix.rwx.media.common.MediaService;
import com.javanix.rwx.media.common.MediaUrls;
import java.time.Clock;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/** The book side of the shared media tests, here because the service and repository are package-private. */
@Component
class BookKind implements MediaKind {

    private static final String HOBBIT = "OL27482W";

    @Autowired BookService service;
    @Autowired BookRepository repository;
    @Autowired @Qualifier(MediaResolver.DRAFT) MediaResolver<BookRef, BookItem> drafts;
    @Autowired MediaResolver<BookRef, BookItem> catalog;
    @Autowired UserLock userLock;
    @Autowired Clock clock;
    @Autowired TransactionTemplate tx;
    @Autowired JdbcClient jdbc;

    @Override
    public String name() {
        return "book";
    }

    @Override
    public String path() {
        return "/api/v1/books";
    }

    @Override
    public String table() {
        return "books";
    }

    @Override
    public String exportKey() {
        return "books";
    }

    @Override
    public String invalidStatus() {
        return "reading";
    }

    @Override
    public MediaService<?, ?, ?> service() {
        return service;
    }

    @Override
    public MediaResolver<?, ?> drafts() {
        return drafts;
    }

    @Override
    public MediaResolver<?, ?> catalog() {
        return catalog;
    }

    @Override
    @SuppressWarnings("unchecked")
    public MediaService<?, ?, ?> service(MediaResolver<?, ?> drafts, MediaResolver<?, ?> catalog) {
        return new BookService(repository, (MediaResolver<BookRef, BookItem>) drafts,
                (MediaResolver<BookRef, BookItem>) catalog, userLock, clock, tx);
    }

    @Override
    public MediaEntity patch(UUID user, UUID id, String status, Boolean favorite) {
        return service.patch(user, id, status, favorite);
    }

    @Override
    public UUID seed(UUID user, String title) {
        return MediaSeed.book(jdbc, user, title, workId(), null);
    }

    @Override
    public MediaResolver<?, ?> provider(String title, String imageUrl) {
        var externalId = workId();
        return new MediaResolver<BookRef, BookItem>() {
            @Override
            public Optional<BookRef> identify(String sourceUrl) {
                return Optional.of(new BookRef(BookSourceId.OPEN_LIBRARY, externalId));
            }

            @Override
            public BookItem resolve(UUID userId, BookRef ref) {
                return new BookItem(ref, MediaUrls.openLibrary(externalId), title, null, null, imageUrl, null, null,
                        null);
            }
        };
    }

    @Override
    public MediaEntity entity(String description) {
        var item = new BookItem(new BookRef(BookSourceId.OPEN_LIBRARY, "OL1W"), MediaUrls.openLibrary("OL1W"), "Dune",
                null, description, null, null, null, null);
        return new BookEntity(UUID.randomUUID(), UUID.randomUUID(), BookSourceId.OPEN_LIBRARY, "OL1W", null, item,
                clock.instant());
    }

    @Override
    public String stubProviderUrl(WireMockServer provider, UUID user) {
        // an id no other test uses: the provider cache is shared across the test context
        var work = workId();
        json(provider, "/works/" + work + ".json", 200, Fixtures.read("open_library/work-" + HOBBIT + ".json"));
        json(provider, "/search.json", 200, Fixtures.read("open_library/lookup-" + HOBBIT + ".json").replace(HOBBIT, work));
        return MediaUrls.openLibrary(work);
    }

    private static String workId() {
        return "OL" + ThreadLocalRandom.current().nextLong(100_000_000L, 999_999_999L) + "W";
    }
}
