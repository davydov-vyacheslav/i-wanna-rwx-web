package com.javanix.rwx.datasource.internal.provider;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.github.tomakehurst.wiremock.junit5.WireMockExtension;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.resilience.InvocationRejectedException;
import org.springframework.resilience.annotation.ConcurrencyLimit.ThrottlePolicy;
import org.springframework.resilience.annotation.ConcurrencyLimit;
import org.springframework.web.service.annotation.GetExchange;
import org.springframework.web.service.registry.ImportHttpServices;
import tools.jackson.databind.JsonNode;

/**
 * The outbound guard, {@code @ConcurrencyLimit} on a client interface, through the real Spring proxy: the ninth
 * concurrent call is rejected at once, the other eight succeed. The advice maps the rejection to 503 (its own test).
 */
class ConcurrencyLimitTests {

    @RegisterExtension
    static WireMockExtension wm = WireMockExtension.newInstance().options(wireMockConfig().dynamicPort()).build();

    @ConcurrencyLimit(limitString = "${rwx.datasource.http.max-concurrent:8}", policy = ThrottlePolicy.REJECT)
    interface Probe {
        @GetExchange("/slow")
        JsonNode slow();
    }

    @TestConfiguration(proxyBeanMethods = false)
    @ImportHttpServices(group = "open-library", types = Probe.class)
    static class Clients {
    }

    private static Probe probe(String... extra) {
        var props = new ArrayList<>(List.of("rwx.datasource.books.open-library.base-url=" + wm.baseUrl()));
        props.addAll(List.of(extra));
        return TestClients.client(Probe.class, Clients.class, props.toArray(String[]::new));
    }

    @Test
    void theNinthConcurrentCallIsRejectedAndTheOtherEightSucceed() throws Exception {
        wm.stubFor(get(urlPathEqualTo("/slow")).willReturn(aResponse().withBody("{}").withFixedDelay(1500)));
        var http = probe();
        var started = new CountDownLatch(8);
        try (var pool = Executors.newFixedThreadPool(8)) {
            var held = new ArrayList<Future<Object>>();
            for (var i = 0; i < 8; i++) {
                Callable<Object> call = () -> {
                    started.countDown();
                    return http.slow();
                };
                held.add(pool.submit(call));
            }
            started.await();
            // wait until WireMock has all eight in flight
            var deadline = System.currentTimeMillis() + 2000;
            while (wm.getAllServeEvents().size() < 8 && System.currentTimeMillis() < deadline) {
                Thread.sleep(10);
            }
            var t0 = System.nanoTime();
            assertThatThrownBy(http::slow).isInstanceOf(InvocationRejectedException.class);
            assertThat((System.nanoTime() - t0) / 1_000_000).isLessThan(500);
            for (var f : held) {
                assertThat(f.get()).isNotNull();
            }
        }
        // the permits are back
        assertThat(http.slow()).isNotNull();
    }

    @Test
    void theLimitComesFromTheProperty() throws Exception {
        wm.stubFor(get(urlPathEqualTo("/slow")).willReturn(aResponse().withBody("{}").withFixedDelay(800)));
        var http = probe("rwx.datasource.http.max-concurrent=1");
        try (var pool = Executors.newSingleThreadExecutor()) {
            var first = pool.submit(() -> http.slow());
            var deadline = System.currentTimeMillis() + 2000;
            while (wm.getAllServeEvents().isEmpty() && System.currentTimeMillis() < deadline) {
                Thread.sleep(10);
            }
            assertThatThrownBy(http::slow).isInstanceOf(InvocationRejectedException.class);
            assertThat(first.get()).isNotNull();
        }
    }
}
