package com.javanix.rwx.datasource.internal.provider;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.github.tomakehurst.wiremock.http.Fault;
import com.github.tomakehurst.wiremock.junit5.WireMockExtension;
import com.javanix.rwx.api.model.DataSourceId;
import com.javanix.rwx.datasource.CatalogException;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.web.service.annotation.GetExchange;
import org.springframework.web.service.registry.ImportHttpServices;
import tools.jackson.databind.JsonNode;

/** Every failure of the HTTP foundation names the provider it happened at (the wire id of the data source). */
class ProviderFailureSourceTests {

    @RegisterExtension
    static WireMockExtension wm = WireMockExtension.newInstance().options(wireMockConfig().dynamicPort()).build();

    interface Probe {
        @GetExchange("/x")
        JsonNode get();
    }

    @TestConfiguration(proxyBeanMethods = false)
    @ImportHttpServices(group = "open-library", types = Probe.class)
    static class OpenLibraryGroup {
    }

    @TestConfiguration(proxyBeanMethods = false)
    @ImportHttpServices(group = "tmdb", types = Probe.class)
    static class TmdbGroup {
    }

    private static Probe probe(String id) {
        return "tmdb".equals(id)
                ? TestClients.client(Probe.class, TmdbGroup.class, "rwx.datasource.movies.tmdb.base-url=" + wm.baseUrl() + "/3")
                : TestClients.client(Probe.class, OpenLibraryGroup.class, "rwx.datasource.books.open-library.base-url=" + wm.baseUrl());
    }

    private static String path(String id, String tail) {
        return ("tmdb".equals(id) ? "/3" : "") + tail;
    }

    private void fails(String provider, int status, Class<? extends CatalogException> type) {
        wm.stubFor(get(urlPathEqualTo(path(provider, "/x"))).willReturn(aResponse().withStatus(status)));
        assertThatThrownBy(() -> probe(provider).get()).isInstanceOf(type)
                .satisfies(e -> assertThat(((CatalogException) e).source()).isEqualTo(provider));
    }

    @ParameterizedTest
    @ValueSource(strings = {"open_library", "tmdb"})
    void everyFailureKindCarriesTheProviderId(String provider) {
        fails(provider, 404, CatalogException.SourceNotFound.class);
        fails(provider, 429, CatalogException.ProviderRateLimited.class);
        fails(provider, 500, CatalogException.ProviderError.class);
        fails(provider, 401, ProviderUnauthorized.class);
        wm.stubFor(get(urlPathEqualTo(path(provider, "/x"))).willReturn(aResponse().withFault(Fault.CONNECTION_RESET_BY_PEER)));
        assertThatThrownBy(() -> probe(provider).get())
                .isInstanceOf(CatalogException.ProviderTimeout.class)
                .satisfies(e -> assertThat(((CatalogException) e).source()).isEqualTo(provider));
    }

    @ParameterizedTest
    @ValueSource(strings = {"open_library", "tmdb"})
    void theProviderIdsAreContractDataSourceIds(String provider) {
        DataSourceId.fromValue(provider);
    }
}
