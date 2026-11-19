package com.javanix.rwx.testkit;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;

import com.github.tomakehurst.wiremock.WireMockServer;

/** Stubs for the provider stand-in bean ({@code providerStub} in {@link TestInfra}). */
public final class ProviderStubs {

    private ProviderStubs() {}

    public static void json(WireMockServer provider, String path, int status, String body) {
        json(provider, path, status, body, 0);
    }

    public static void json(WireMockServer provider, String path, int status, String body, int delayMillis) {
        provider.stubFor(get(urlPathEqualTo(path)).willReturn(aResponse().withStatus(status)
                .withHeader("Content-Type", "application/json").withBody(body).withFixedDelay(delayMillis)));
    }
}
