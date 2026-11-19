package com.javanix.rwx.datasource.internal.book.openlibrary;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.client.WireMock.containing;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.github.tomakehurst.wiremock.junit5.WireMockExtension;
import com.javanix.rwx.api.model.BookSourceId;
import com.javanix.rwx.common.validators.HttpUrls;
import com.javanix.rwx.datasource.BookItem;
import com.javanix.rwx.datasource.BookRef;
import com.javanix.rwx.datasource.CatalogException.ProviderError;
import com.javanix.rwx.datasource.CatalogException.SourceNotFound;
import com.javanix.rwx.datasource.internal.provider.Fixtures;
import com.javanix.rwx.datasource.internal.provider.TestClients;
import com.javanix.rwx.datasource.internal.provider.TestProps;
import java.math.BigDecimal;
import java.net.URI;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.web.service.registry.ImportHttpServices;

/** Open Library over WireMock with the recorded responses in {@code providers/open_library}. No database involved. */
class OpenLibrarySourceTests {

    @RegisterExtension
    static WireMockExtension wm = WireMockExtension.newInstance().options(wireMockConfig().dynamicPort()).build();

    private static final String DUNE = "OL893414W";
    private static final String HOBBIT = "OL27482W";

    private final UUID user = UUID.randomUUID();
    @TestConfiguration(proxyBeanMethods = false)
    @ImportHttpServices(group = "open-library", types = OpenLibraryApi.class)
    static class Clients {
    }

    private final OpenLibraryApi http = TestClients.client(OpenLibraryApi.class, Clients.class,
            "rwx.datasource.books.open-library.base-url=" + wm.baseUrl());
    private final OpenLibrarySource source = new OpenLibrarySource(http, TestProps.cache(false));

    @AfterEach
    void close() {
        source.destroy();
    }

    private static BookRef ref(String id) {
        return new BookRef(BookSourceId.OPEN_LIBRARY, id);
    }

    private static void json(String path, String body) {
        wm.stubFor(get(urlPathEqualTo(path)).willReturn(aResponse().withHeader("Content-Type", "application/json").withBody(body)));
    }

    private static void searchReturns(String body) {
        json("/search.json", body);
    }

    private static String docs(String... docs) {
        return "{\"numFound\":" + docs.length + ",\"docs\":[" + String.join(",", docs) + "]}";
    }

    private static String doc(String key, String title, String isbns) {
        return "{\"key\":\"" + key + "\",\"title\":\"" + title + "\",\"isbn\":" + isbns + "}";
    }

    // ---- search

    @Test
    void searchMapsTheRecordedFixture() {
        searchReturns(Fixtures.read("open_library/search-dune.json"));

        var hits = source.search(user, "dune frank herbert");

        assertThat(hits).hasSize(10);
        var first = hits.getFirst();
        assertThat(first.ref()).isEqualTo(ref(DUNE));
        assertThat(first.title()).isEqualTo("Dune");
        assertThat(first.author()).isEqualTo("Frank Herbert");
        assertThat(first.year()).isEqualTo(1965);
        assertThat(first.rating()).isEqualByComparingTo(new BigDecimal("4.3"));
        assertThat(first.coverUrl()).isEqualTo("https://covers.openlibrary.org" + "/b/id/11481354-L.jpg");
        assertThat(first.isbn()).isEqualTo("9780450000898");
        assertThat(first.description()).isNull();
        // the main author only
        assertThat(hits.get(8).author()).isEqualTo("Kevin J. Anderson");
        wm.verify(getRequestedFor(urlPathEqualTo("/search.json")).withQueryParam("q", equalTo("dune frank herbert"))
                .withQueryParam("limit", equalTo("10")).withQueryParam("fields", containing("author_name"))
                .withHeader("User-Agent", equalTo("RWX/1.0 (ops@example.com)")));
    }

    @Test
    void everyHitsSourceUrlIsTheCanonicalWorkPage() {
        searchReturns(Fixtures.read("open_library/search-dune.json"));

        var hits = source.search(user, "dune");

        assertThat(hits).allSatisfy(h -> {
            assertThat(h.externalLink()).isEqualTo("https://openlibrary.org/works/" + h.ref().externalId());
            assertThat(h.ref().externalId()).matches("OL[1-9][0-9]{0,11}W");
            assertThat(h.ref().source()).isEqualTo(BookSourceId.OPEN_LIBRARY);
            // a hit's link is recognized back to the same ref
            assertThat(source.recognize(HttpUrls.parse(h.externalLink()).orElseThrow())).contains(h.ref());
        });
    }

    @Test
    void anAudiobookHitIsDropped() {
        searchReturns(Fixtures.read("open_library/search-hobbit-with-audio.json"));

        var hits = source.search(user, "the hobbit audiobook");

        assertThat(hits).extracting(h -> h.ref().externalId()).containsExactly(HOBBIT, "OL27448W", "OL20370345W");
    }

    @Test
    void hitsWithoutAValidWorkKeyOrATitleAreDropped() {
        searchReturns(docs(doc("/works/OL1W", "Good", "[]"), doc("/books/OL1M", "Edition", "[]"),
                doc("/works/OL0W", "Zero", "[]"), doc("/works/OL1234567890123W", "Long", "[]"),
                doc("/works/ol2w", "Lower", "[]"), doc("/works/OL3W", "  ", "[]"),
                "{\"title\":\"No key\"}", doc("/works/OL4W/evil", "Tail", "[]"), doc("/works/OL5W", "Also good", "[]")));

        assertThat(source.search(user, "x")).extracting(h -> h.ref().externalId()).containsExactly("OL1W", "OL5W");
    }

    @Test
    void anEmptyResultIsAnEmptyListAndAtMostTenHitsAreKept() {
        searchReturns(docs());
        assertThat(source.search(user, "nothing")).isEmpty();

        var many = new String[12];
        for (var i = 0; i < many.length; i++) {
            many[i] = doc("/works/OL" + (i + 1) + "W", "T" + i, "[]");
        }
        searchReturns(docs(many));
        assertThat(source.search(user, "many")).hasSize(10);
    }

    @Test
    void theIsbnOfAHitIsTheFirstNonBlankOneAsIs() {
        searchReturns(docs(
                doc("/works/OL1W", "Hyphenated", "[\"0-306-40615-2\",\"9780306406157\"]"),
                doc("/works/OL2W", "Blank first", "[\"\",\" \",\"9780306406157\"]"),
                doc("/works/OL3W", "Empty list", "[]"),
                doc("/works/OL4W", "All blank", "[\"\",\"  \"]"),
                "{\"key\":\"/works/OL5W\",\"title\":\"No isbn field\"}",
                doc("/works/OL6W", "Null first", "[null,\" 080442957x \"]")));

        var hits = source.search(user, "isbn");

        assertThat(hits).extracting(BookItem::isbn).containsExactly("0-306-40615-2", "9780306406157", null, null, null,
                "080442957x");
    }

    @Test
    void anIsbnIsCutAtThirtyTwoCodePointsButNotValidated() {
        searchReturns(docs(doc("/works/OL1W", "Long", "[\" not-an-isbn-" + "x".repeat(40) + "\"]")));

        var isbn = source.search(user, "isbn").get(0).isbn();

        assertThat(isbn).hasSize(32).startsWith("not-an-isbn-x");
    }

    @Test
    void theHitIsbnEqualsWhatResolveStoresForTheSameFixture() {
        searchReturns(Fixtures.read("open_library/search-dune.json"));
        json("/works/" + DUNE + ".json", Fixtures.read("open_library/work-" + DUNE + ".json"));
        wm.stubFor(get(urlPathEqualTo("/search.json")).withQueryParam("q", equalTo("key:/works/" + DUNE))
                .willReturn(aResponse().withBody(Fixtures.read("open_library/lookup-" + DUNE + ".json"))));

        var hit = source.search(user, "dune").stream().filter(h -> h.ref().externalId().equals(DUNE)).findFirst().orElseThrow();
        var item = source.resolve(user, ref(DUNE));

        assertThat(item.isbn()).isNotNull().isEqualTo(hit.isbn());
    }

    // ---- resolve

    private void stubWork(String id) {
        json("/works/" + id + ".json", Fixtures.read("open_library/work-" + id + ".json"));
    }

    private void stubLookup(String id, String body) {
        wm.stubFor(get(urlPathEqualTo("/search.json")).withQueryParam("q", equalTo("key:/works/" + id))
                .willReturn(aResponse().withHeader("Content-Type", "application/json").withBody(body)));
    }

    @Test
    void resolveCombinesTheWorkAndTheKeyLookup() {
        stubWork(HOBBIT);
        stubLookup(HOBBIT, Fixtures.read("open_library/lookup-" + HOBBIT + ".json"));

        var item = source.resolve(user, ref(HOBBIT));

        assertThat(item.ref()).isEqualTo(ref(HOBBIT));
        assertThat(item.title()).isEqualTo("The Hobbit");
        assertThat(item.description()).startsWith("The Hobbit is a tale of high adventure");
        assertThat(item.author()).isEqualTo("J.R.R. Tolkien");
        assertThat(item.year()).isEqualTo(1937);
        assertThat(item.coverUrl()).isEqualTo("https://covers.openlibrary.org" + "/b/id/14627509-L.jpg");
        assertThat(item.rating()).isNotNull().isBetween(BigDecimal.ZERO, new BigDecimal("5"));
        assertThat(item.isbn()).isEqualTo("9788422615866");
        wm.verify(getRequestedFor(urlPathEqualTo("/works/" + HOBBIT + ".json")).withHeader("User-Agent", containing("RWX/1.0")));
        wm.verify(getRequestedFor(urlPathEqualTo("/search.json")).withQueryParam("limit", equalTo("1")));
    }

    @Test
    void theWorkAndTheLookupRunInParallel() {
        json("/works/" + HOBBIT + ".json", Fixtures.read("open_library/work-" + HOBBIT + ".json"));
        wm.stubFor(get(urlPathEqualTo("/works/" + HOBBIT + ".json")).willReturn(
                aResponse().withBody(Fixtures.read("open_library/work-" + HOBBIT + ".json")).withFixedDelay(700)));
        wm.stubFor(get(urlPathEqualTo("/search.json")).willReturn(
                aResponse().withBody(Fixtures.read("open_library/lookup-" + HOBBIT + ".json")).withFixedDelay(700)));

        var started = System.nanoTime();
        source.resolve(user, ref(HOBBIT));
        var millis = (System.nanoTime() - started) / 1_000_000;

        assertThat(millis).as("two 700 ms calls in sequence would take 1400 ms").isLessThan(1300);
    }

    @Test
    void aDescriptionAsAPlainStringIsAccepted() {
        json("/works/OL7W.json", "{\"title\":\"Plain\",\"description\":\"Just text.\"}");
        stubLookup("OL7W", docs());

        assertThat(source.resolve(user, ref("OL7W")).description()).isEqualTo("Just text.");
    }

    @Test
    void aDescriptionAsAValueObjectIsAccepted() {
        json("/works/OL8W.json", "{\"title\":\"Object\",\"description\":{\"type\":\"/type/text\",\"value\":\"From value.\"}}");
        stubLookup("OL8W", docs());

        assertThat(source.resolve(user, ref("OL8W")).description()).isEqualTo("From value.");
    }

    @Test
    void anEmptyLookupLeavesAuthorIsbnRatingCoverAndYearAbsent() {
        json("/works/OL9W.json", "{\"title\":\"Obscure\"}");
        stubLookup("OL9W", docs());

        var item = source.resolve(user, ref("OL9W"));

        assertThat(item.title()).isEqualTo("Obscure");
        assertThat(item.description()).isNull();
        assertThat(item.author()).isNull();
        assertThat(item.isbn()).isNull();
        assertThat(item.rating()).isNull();
        assertThat(item.coverUrl()).isNull();
        assertThat(item.year()).isNull();
    }

    @Test
    void aLookupHitForAnotherWorkIsIgnored() {
        json("/works/OL9W.json", "{\"title\":\"Obscure\"}");
        stubLookup("OL9W", docs("{\"key\":\"/works/OL10W\",\"author_name\":[\"Other\"],\"isbn\":[\"9780306406157\"]}"));

        var item = source.resolve(user, ref("OL9W"));

        assertThat(item.author()).isNull();
        assertThat(item.isbn()).isNull();
    }

    @Test
    void aMissingWorkIsSourceNotFound() {
        wm.stubFor(get(urlPathEqualTo("/works/OL99999999W.json")).willReturn(
                aResponse().withStatus(404).withBody(Fixtures.read("open_library/work-404.json"))));
        stubLookup("OL99999999W", docs());

        assertThatThrownBy(() -> source.resolve(user, ref("OL99999999W"))).isInstanceOf(SourceNotFound.class);
    }

    @Test
    void aFailingLookupFailsTheWholeResolve() {
        stubWork(HOBBIT);
        wm.stubFor(get(urlPathEqualTo("/search.json")).willReturn(aResponse().withStatus(500)));

        assertThatThrownBy(() -> source.resolve(user, ref(HOBBIT))).isInstanceOf(ProviderError.class);
    }

    @Test
    void anEmptySuccessBodyIsAProviderErrorOfOpenLibraryNotANullPointer() {
        wm.stubFor(get(urlPathEqualTo("/search.json")).willReturn(aResponse().withStatus(200)));
        wm.stubFor(get(urlPathEqualTo("/works/OL13W.json")).willReturn(aResponse().withStatus(200)));

        assertThatThrownBy(() -> source.search(user, "empty")).isInstanceOfSatisfying(ProviderError.class,
                e -> assertThat(e.source()).isEqualTo("open_library"));
        assertThatThrownBy(() -> source.resolve(user, ref("OL13W"))).isInstanceOfSatisfying(ProviderError.class,
                e -> assertThat(e.source()).isEqualTo("open_library"));
    }

    @Test
    void aWorkWithoutATitleIsAProviderError() {
        json("/works/OL11W.json", "{\"description\":\"no title\"}");
        stubLookup("OL11W", docs());

        assertThatThrownBy(() -> source.resolve(user, ref("OL11W"))).isInstanceOfSatisfying(ProviderError.class,
                e -> assertThat(e.source()).isEqualTo("open_library"));
    }

    @Test
    void textIsStrippedAndBoundedAndTheCoverIsBuiltFromAPositiveIdOnly() {
        json("/works/OL12W.json", "{\"title\":\"  " + "t".repeat(600) + " \",\"description\":\"" + "d".repeat(30_000) + "\"}");
        stubLookup("OL12W", docs("{\"key\":\"/works/OL12W\",\"author_name\":[\"" + "a".repeat(900)
                + "\"],\"cover_i\":0,\"first_publish_year\":3001,\"ratings_average\":7.0}"));

        var item = source.resolve(user, ref("OL12W"));

        assertThat(item.title()).hasSize(500);
        assertThat(item.author()).hasSize(500);
        assertThat(item.description()).hasSize(20_000);
        assertThat(item.coverUrl()).isNull();
        assertThat(item.year()).isNull();
        assertThat(item.rating()).isEqualByComparingTo("5.0");
    }

    @ParameterizedTest
    @CsvSource({"7,5.0", "5,5.0", "4.25,4.3", "3.04,3.0", "-1,0.0", "0,0.0", "NaN,0.0", "Infinity,0.0"})
    void ratingIsClampedToFiveAtOneDecimal(double raw, String expected) {
        assertThat(OpenLibrarySource.rating(raw)).isEqualByComparingTo(new BigDecimal(expected));
        assertThat(OpenLibrarySource.rating(raw).scale()).isEqualTo(1);
        assertThat(OpenLibrarySource.rating(null)).isNull();
    }

    @Test
    void pickIsbnTakesTheFirstNonBlankOneAsIsTrimmed() {
        assertThat(OpenLibrarySource.pickIsbn(List.of("", "  ", " 0-306-40615-2 ", "9780441172719"))).isEqualTo("0-306-40615-2");
        assertThat(OpenLibrarySource.pickIsbn(List.of("abc", "9780441172719"))).isEqualTo("abc");
        assertThat(OpenLibrarySource.pickIsbn(List.of(" ", ""))).isNull();
        assertThat(OpenLibrarySource.pickIsbn(List.of())).isNull();
    }

    @Test
    void theCacheServesARepeatedSearchAndResolveWithoutAnotherRequest() {
        var cached = new OpenLibrarySource(http, TestProps.cache(true));
        searchReturns(Fixtures.read("open_library/search-dune.json"));
        stubWork(HOBBIT);
        stubLookup(HOBBIT, Fixtures.read("open_library/lookup-" + HOBBIT + ".json"));

        cached.search(user, "dune");
        cached.search(UUID.randomUUID(), "dune");
        cached.resolve(user, ref(HOBBIT));
        cached.resolve(user, ref(HOBBIT));
        cached.destroy();

        // 1 search + (1 work + 1 lookup)
        assertThat(wm.getAllServeEvents()).hasSize(3);
    }

    @Test
    void twoConcurrentIdenticalResolvesCallTheProviderOnce() throws Exception {
        var cached = new OpenLibrarySource(http, TestProps.cache(true));
        wm.stubFor(get(urlPathEqualTo("/works/" + HOBBIT + ".json")).willReturn(aResponse()
                .withHeader("Content-Type", "application/json").withFixedDelay(400)
                .withBody(Fixtures.read("open_library/work-" + HOBBIT + ".json"))));
        stubLookup(HOBBIT, Fixtures.read("open_library/lookup-" + HOBBIT + ".json"));

        try (var pool = Executors.newFixedThreadPool(2)) {
            var a = pool.submit(() -> cached.resolve(user, ref(HOBBIT)));
            var b = pool.submit(() -> cached.resolve(UUID.randomUUID(), ref(HOBBIT)));
            assertThat(a.get()).isEqualTo(b.get());
        }
        cached.destroy();

        // single flight: one work request and one lookup, not two of each
        assertThat(wm.getAllServeEvents()).hasSize(2);
    }

    @Test
    void aFailedLoadIsNotCached() {
        var cached = new OpenLibrarySource(http, TestProps.cache(true));
        stubWork(HOBBIT);
        wm.stubFor(get(urlPathEqualTo("/search.json")).willReturn(aResponse().withStatus(500)));
        assertThatThrownBy(() -> cached.resolve(user, ref(HOBBIT))).isInstanceOf(ProviderError.class);

        wm.resetAll();
        stubWork(HOBBIT);
        stubLookup(HOBBIT, Fixtures.read("open_library/lookup-" + HOBBIT + ".json"));
        assertThat(cached.resolve(user, ref(HOBBIT)).title()).isNotBlank();
        cached.destroy();

        // the second resolve went to the provider again (work + lookup)
        assertThat(wm.getAllServeEvents()).hasSize(2);
    }

    // ---- recognize

    private Optional<BookRef> recognize(String url) {
        return HttpUrls.parse(url).flatMap(source::recognize);
    }

    @Test
    void everyFormOfAWorkPageIsTheSameCanonicalRef() {
        var expected = ref("OL45804W");
        for (var url : new String[] {"https://openlibrary.org/works/OL45804W",
                "https://openlibrary.org/works/OL45804W/Fantastic_Mr._Fox", "https://openlibrary.org/works/OL45804W/borrow",
                "https://openlibrary.org/works/OL45804W?edition=ia%3Afoo#x", "http://openlibrary.org/works/OL45804W",
                "https://www.openlibrary.org/works/OL45804W", "HTTPS://OpenLibrary.ORG/works/OL45804W"}) {
            assertThat(recognize(url)).as(url).contains(expected);
        }
    }

    @Test
    void everythingElseIsNotRecognized() {
        for (var url : new String[] {"https://openlibrary.org/books/OL1M", "https://openlibrary.org/works/OL1",
                "https://openlibrary.org/works/OL1234567890123W", "https://openlibrary.org/works/OL0W",
                "https://openlibrary.org/works/OL1W.json", "https://openlibrary.org/works/ol1w",
                "https://openlibrary.org.evil.com/works/OL1W", "https://openlibrary.org@evil.com/works/OL1W",
                "https://openlibrary.org:8443/works/OL1W", "https://openlibrary.org./works/OL1W",
                "ftp://openlibrary.org/works/OL1W", "https://openlibrary.org/works/OL1W%2F..", "https://openlibrary.org/search?q=x",
                "https://themoviedb.org/works/OL1W", "https://openlibrary.org/authors/OL1A"}) {
            assertThat(recognize(url)).as(url).isEmpty();
        }
    }

    @Test
    void recognizeOfACanonicalUrlIsIdempotent() {
        var ref = recognize("https://www.openlibrary.org/works/OL45804W/slug").orElseThrow();

        assertThat(recognize(source.canonicalUrl(ref))).contains(ref);
    }

    @Test
    void recognizeNeverCallsTheProvider() {
        recognize("https://openlibrary.org/works/OL45804W/x");
        recognize("https://openlibrary.org/books/OL1M");
        source.isAvailable(user);

        assertThat(wm.getAllServeEvents()).isEmpty();
    }
}
