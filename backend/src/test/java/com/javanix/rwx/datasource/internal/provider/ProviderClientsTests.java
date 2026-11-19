package com.javanix.rwx.datasource.internal.provider;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.anyRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.anyUrl;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.github.tomakehurst.wiremock.http.Fault;
import com.github.tomakehurst.wiremock.junit5.WireMockExtension;
import com.javanix.rwx.datasource.CatalogException.ProviderError;
import com.javanix.rwx.datasource.CatalogException.ProviderRateLimited;
import com.javanix.rwx.datasource.CatalogException.ProviderTimeout;
import com.javanix.rwx.datasource.CatalogException.SourceNotFound;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.client.RestClientException;
import org.springframework.web.service.annotation.GetExchange;
import org.springframework.web.service.registry.ImportHttpServices;

/** The HTTP foundation against WireMock (the only stub allowed, and only for external HTTP). */
@ExtendWith(OutputCaptureExtension.class)
class ProviderClientsTests {

    interface Probe {
        @GetExchange("/{path}")
        Body get(@PathVariable("path") String path);

        @GetExchange("/search/multi")
        Body search(@RequestParam("query") String query, @RequestHeader("Authorization") String authorization);
    }

    record Body(String a, Integer n, List<String> list) {
    }

    @RegisterExtension
    static WireMockExtension wm = WireMockExtension.newInstance().options(wireMockConfig().dynamicPort()).build();

    @TestConfiguration(proxyBeanMethods = false)
    @ImportHttpServices(group = "open-library", types = Probe.class)
    static class Clients {
    }

    private static Probe probeAt(String baseUrl, String... props) {
        var all = new ArrayList<>(List.of("rwx.datasource.books.open-library.base-url=" + baseUrl));
        all.addAll(List.of(props));
        return TestClients.client(Probe.class, Clients.class, all.toArray(String[]::new));
    }

    private static Probe probe(String... props) {
        return probeAt(wm.baseUrl(), props);
    }

    @Test
    void returnsParsedBodyAndSendsUserAgentWithContact() {
        wm.stubFor(get(urlPathEqualTo("/x")).willReturn(aResponse().withBody("{\"a\":\"Dune\",\"unknown\":1}")));

        assertThat(probe().get("x").a()).isEqualTo("Dune");
        wm.verify(getRequestedFor(urlPathEqualTo("/x"))
                .withHeader("User-Agent", equalTo("RWX/1.0 (ops@example.com)")));
    }

    @Test
    void missingAndNullValuesAreNull() {
        wm.stubFor(get(urlPathEqualTo("/nulls")).willReturn(aResponse().withBody("{\"a\":null,\"list\":[null,\"b\"]}")));
        wm.stubFor(get(urlPathEqualTo("/none")).willReturn(aResponse().withBody("{}")));

        assertThat(probe().get("nulls")).isEqualTo(new Body(null, null, Arrays.asList(null, "b")));
        assertThat(probe().get("none")).isEqualTo(new Body(null, null, null));
    }

    @Test
    void aValueOfTheWrongTypeIsProviderError() {
        wm.stubFor(get(urlPathEqualTo("/odd")).willReturn(aResponse().withBody("{\"a\":{\"x\":[1]}}")));
        wm.stubFor(get(urlPathEqualTo("/odd2")).willReturn(aResponse().withBody("{\"list\":{\"k\":1}}")));

        assertThatThrownBy(() -> probe().get("odd")).isExactlyInstanceOf(ProviderError.class);
        assertThatThrownBy(() -> probe().get("odd2")).isExactlyInstanceOf(ProviderError.class);
    }

    @Test
    void queryValuesAreEncodedAndTheBasePathIsKept() {
        wm.stubFor(get(urlPathEqualTo("/3/search/multi")).willReturn(aResponse().withBody("{}")));

        probeAt(wm.baseUrl() + "/3").search("a&b c=d", "Bearer x");

        wm.verify(getRequestedFor(urlPathEqualTo("/3/search/multi"))
                .withQueryParam("query", equalTo("a&b c=d")).withHeader("Authorization", equalTo("Bearer x")));
    }

    @Test
    void readTimeoutIsProviderTimeout() {
        wm.stubFor(get(anyUrl()).willReturn(aResponse().withBody("{}").withFixedDelay(1500)));

        assertThatThrownBy(() -> probe("spring.http.serviceclient.open-library.read-timeout=300ms").get("x")).isInstanceOf(ProviderTimeout.class);
    }

    @Test
    void connectFailureIsProviderTimeout() {
        // nothing listens on port 1
        assertThatThrownBy(() -> probeAt("http://127.0.0.1:1").get("x")).isInstanceOf(ProviderTimeout.class);
    }

    @Test
    void serverErrorIsProviderErrorWithoutRetry() {
        wm.stubFor(get(urlPathEqualTo("/boom")).willReturn(aResponse().withStatus(500).withBody("secret upstream text")));

        assertThatThrownBy(() -> probe().get("boom"))
                .isExactlyInstanceOf(ProviderError.class)
                .satisfies(e -> assertThat(e.getMessage()).doesNotContain("secret").doesNotContain("boom")
                        .doesNotContain(wm.baseUrl()));
        wm.verify(1, getRequestedFor(urlPathEqualTo("/boom")));
    }

    @Test
    void otherClientErrorsAreProviderError() {
        wm.stubFor(get(urlPathEqualTo("/teapot")).willReturn(aResponse().withStatus(418)));
        wm.stubFor(get(urlPathEqualTo("/forbidden")).willReturn(aResponse().withStatus(403)));

        assertThatThrownBy(() -> probe().get("teapot")).isExactlyInstanceOf(ProviderError.class);
        assertThatThrownBy(() -> probe().get("forbidden")).isExactlyInstanceOf(ProviderError.class);
    }

    @Test
    void unauthorizedIsADistinguishableProviderError() {
        wm.stubFor(get(urlPathEqualTo("/auth")).willReturn(aResponse().withStatus(401)));

        assertThatThrownBy(() -> probe().get("auth"))
                .isInstanceOf(ProviderUnauthorized.class).isInstanceOf(ProviderError.class);
    }

    @Test
    void notFoundIsSourceNotFound() {
        wm.stubFor(get(urlPathEqualTo("/missing")).willReturn(aResponse().withStatus(404)));

        assertThatThrownBy(() -> probe().get("missing")).isInstanceOf(SourceNotFound.class);
    }

    @Test
    void tooManyRequestsCarriesRetryAfterClamped() {
        wm.stubFor(get(urlPathEqualTo("/limited")).willReturn(aResponse().withStatus(429).withHeader("Retry-After", "7")));
        wm.stubFor(get(urlPathEqualTo("/huge")).willReturn(aResponse().withStatus(429).withHeader("Retry-After", "99999")));
        wm.stubFor(get(urlPathEqualTo("/dated")).willReturn(aResponse().withStatus(429)
                .withHeader("Retry-After", "Wed, 21 Oct 2026 07:28:00 GMT")));

        assertThat(retryAfterOf("limited")).isEqualTo(Duration.ofSeconds(7));
        assertThat(retryAfterOf("huge")).isEqualTo(Duration.ofMinutes(5));
        assertThat(retryAfterOf("dated")).isEqualTo(Duration.ofSeconds(30));
    }

    private Duration retryAfterOf(String path) {
        try {
            probe().get(path);
        } catch (ProviderRateLimited e) {
            return e.retryAfter();
        }
        throw new AssertionError("expected ProviderRateLimited");
    }

    @Test
    void oversizedBodyIsProviderError() {
        wm.stubFor(get(urlPathEqualTo("/big")).willReturn(aResponse().withBody("{\"a\":\"" + "x".repeat(4096) + "\"}")));

        assertThatThrownBy(() -> probe("rwx.datasource.http.max-response=1KB").get("big")).isExactlyInstanceOf(ProviderError.class);
    }

    @Test
    void bodyJustUnderTheCapIsAccepted() {
        wm.stubFor(get(urlPathEqualTo("/fits")).willReturn(aResponse().withBody("{\"a\":\"" + "x".repeat(900) + "\"}")));

        assertThat(probe("rwx.datasource.http.max-response=1KB").get("fits").a()).hasSize(900);
    }

    @Test
    void chunkedOversizedBodyWithoutContentLengthIsProviderError() {
        wm.stubFor(get(urlPathEqualTo("/chunked")).willReturn(aResponse()
                .withChunkedDribbleDelay(4, 50).withBody("{\"a\":\"" + "x".repeat(4096) + "\"}")));

        assertThatThrownBy(() -> probe("rwx.datasource.http.max-response=1KB").get("chunked")).isExactlyInstanceOf(ProviderError.class);
    }

    @Test
    void malformedBodyIsProviderError() {
        wm.stubFor(get(urlPathEqualTo("/junk")).willReturn(aResponse().withBody("<html>nope")));

        assertThatThrownBy(() -> probe().get("junk")).isExactlyInstanceOf(ProviderError.class);
    }

    @Test
    void redirectsAreNotFollowed() {
        wm.stubFor(get(urlPathEqualTo("/moved")).willReturn(aResponse().withStatus(302).withHeader("Location", "/target")));
        wm.stubFor(get(urlPathEqualTo("/target")).willReturn(aResponse().withBody("{}")));

        assertThatThrownBy(() -> probe().get("moved")).isExactlyInstanceOf(ProviderError.class);
        wm.verify(0, getRequestedFor(urlPathEqualTo("/target")));
    }

    @Test
    void aPathArgumentCannotLeaveTheConfiguredOrigin() {
        // a value that looks like userinfo or a second segment is encoded as part of one segment on the configured host
        wm.stubFor(get(anyUrl()).willReturn(aResponse().withBody("{}")));

        assertThat(probe().get("@evil.com/x")).isNotNull();
        assertThat(probe().get("http://evil.com/x")).isNotNull();
        wm.verify(2, anyRequestedFor(anyUrl()));
        wm.verify(0, anyRequestedFor(urlPathEqualTo("/x")));
    }

    @Test
    void aSlowDripBodyIsBoundedByTheReadTimeout() {
        // headers at once, the 2 KB body dribbled over 3 s: only a bound on the whole exchange stops it
        wm.stubFor(get(urlPathEqualTo("/drip")).willReturn(aResponse().withBody("{\"a\":\"" + "x".repeat(2000) + "\"}")
                .withChunkedDribbleDelay(10, 3000)));
        var probe = probe("spring.http.serviceclient.open-library.read-timeout=500ms");

        var started = System.nanoTime();
        Throwable thrown = null;
        try {
            probe.get("drip");
        } catch (RuntimeException e) {
            thrown = e;
        }
        var elapsedMs = (System.nanoTime() - started) / 1_000_000;

        // measured: the request timeout of the JDK client also stops a stalled body (about 500 ms here, not 3 s); a
        // failure before the first body byte reaches the converter as a plain RestClientException with a fixed message
        assertThat(thrown).isInstanceOfAny(ProviderTimeout.class, ProviderError.class, RestClientException.class);
        assertThat(thrown.getMessage()).doesNotContain(wm.baseUrl()).doesNotContain("drip");
        assertThat(elapsedMs).isLessThan(1500);
    }

    @Test
    void infoLogsCarryNeitherQueryNorTokenNorUrl(CapturedOutput output) {
        wm.stubFor(get(urlPathEqualTo("/3/search/multi")).willReturn(aResponse().withBody("{}")));

        probeAt(wm.baseUrl() + "/3").search("very-private-query", "Bearer very-secret-token");

        assertThat(output.getAll()).contains("provider=open_library status=200")
                .doesNotContain("very-private-query").doesNotContain("very-secret-token").doesNotContain("/3/search");
    }

    @Test
    void ioFailuresCarryFixedTextWithNoUriOrApiKey(CapturedOutput output) {
        assertThatThrownBy(() -> probeAt("http://127.0.0.1:1/3").search("very-private-query", "Bearer very-secret-api-key"))
                .isExactlyInstanceOf(ProviderTimeout.class)
                .satisfies(e -> assertThat(e.toString() + e.getMessage() + e.getCause()).doesNotContain("secret", "private", "127.0.0.1", "search"));
        wm.stubFor(get(urlPathEqualTo("/3/search/multi")).willReturn(aResponse()
                .withFault(Fault.MALFORMED_RESPONSE_CHUNK)));
        assertThatThrownBy(() -> probeAt(wm.baseUrl() + "/3").search("very-private-query", "Bearer very-secret-api-key"))
                .isInstanceOfAny(ProviderTimeout.class, ProviderError.class)
                .satisfies(e -> assertThat(e.toString() + e.getMessage() + e.getCause()).doesNotContain("secret", "private", "search"));
        assertThat(output.getAll()).doesNotContain("very-secret-api-key").doesNotContain("very-private-query");
    }
}
