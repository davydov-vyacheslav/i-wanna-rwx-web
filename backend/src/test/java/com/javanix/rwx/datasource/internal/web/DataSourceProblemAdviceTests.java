package com.javanix.rwx.datasource.internal.web;

import static com.javanix.rwx.testkit.TestKeys.TMDB_KEY;
import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.github.tomakehurst.wiremock.client.WireMock;
import com.github.tomakehurst.wiremock.junit5.WireMockExtension;
import com.javanix.rwx.api.model.DataSourceId;
import com.javanix.rwx.api.model.MovieSourceId;
import com.javanix.rwx.api.model.UiLocale;
import com.javanix.rwx.datasource.CatalogException.ProviderError;
import com.javanix.rwx.datasource.CatalogException.ProviderRateLimited;
import com.javanix.rwx.datasource.CatalogException.ProviderTimeout;
import com.javanix.rwx.datasource.CatalogException.RateLimited;
import com.javanix.rwx.datasource.CatalogException.SourceKeyInvalid;
import com.javanix.rwx.datasource.CatalogException.SourceKeyMissing;
import com.javanix.rwx.datasource.CatalogException.SourceNotFound;
import com.javanix.rwx.datasource.MovieRef;
import com.javanix.rwx.datasource.MovieType;
import com.javanix.rwx.datasource.internal.movie.tmdb.TmdbSource;
import com.javanix.rwx.datasource.internal.provider.SourceKeyRejectedException;
import com.javanix.rwx.datasource.internal.provider.SourceKeys;
import com.javanix.rwx.datasource.internal.provider.TestClients;
import com.javanix.rwx.settings.SettingsService;
import com.javanix.rwx.settings.UserSettingsView;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.resilience.InvocationRejectedException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.ResourceAccessException;

/**
 * Every data source exception through a real MockMvc dispatch: status, code, the {@code source} member,
 * Retry-After, and a fixed neutral detail. One chain test goes from a real TMDb 401 to the problem body.
 */
class DataSourceProblemAdviceTests {

    @RegisterExtension
    static WireMockExtension wm = WireMockExtension.newInstance().options(wireMockConfig().dynamicPort()).build();

    @RestController
    static class Throwing {

        @GetMapping("/not-found")
        String notFound() {
            throw new SourceNotFound("open_library");
        }

        @GetMapping("/rejected")
        String rejected() {
            throw new SourceKeyRejectedException("tmdb");
        }

        @GetMapping("/missing")
        String missing() {
            throw new SourceKeyMissing("tmdb");
        }

        @GetMapping("/invalid")
        String invalid() {
            throw new SourceKeyInvalid("tmdb");
        }

        @GetMapping("/timeout")
        String timeout() {
            throw new ProviderTimeout("tmdb");
        }

        @GetMapping("/error")
        String error() {
            throw new ProviderError("open_library");
        }

        @GetMapping("/io")
        String io() {
            throw new ResourceAccessException(
                    "I/O error on GET request for \"https://api.example.test/x?api_key=secret\": reset");
        }

        @GetMapping("/busy")
        String busy() {
            throw new InvocationRejectedException("limit", this);
        }

        @GetMapping("/provider-429")
        String providerLimited() {
            throw new ProviderRateLimited("open_library", Duration.ofSeconds(42));
        }

        @GetMapping("/limited")
        String limited() {
            throw new RateLimited(Duration.ofMillis(1500));
        }

        // the real chain: TmdbSource over HTTP, a saved key that TMDb refuses on use
        @GetMapping("/tmdb-401")
        String tmdb401() {
            var source = TestClients.client(TmdbSource.class, TmdbWiring.class,
                    "rwx.datasource.movies.tmdb.base-url=" + wm.baseUrl() + "/3");
            source.resolve(UUID.randomUUID(), new MovieRef(MovieSourceId.TMDB, MovieType.MOVIE, "603"));
            return "unreachable";
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    @Import(TmdbSource.class)
    static class TmdbWiring {
        @Bean
        SourceKeys keys() {
            return (userId, source) -> Optional.of(TMDB_KEY);
        }

        @Bean
        SettingsService settings() {
            return englishUsers();
        }
    }

    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new Throwing())
            .setControllerAdvice(new DataSourceProblemAdvice()).build();

    private ResultActions problem(String path, int status, String code, String source) throws Exception {
        var result = mvc.perform(get(path)).andExpect(status().is(status))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value(code))
                // fixed neutral text: nothing a provider or a client could have put there, and no provider name
                .andExpect(jsonPath("$.detail").value(Matchers.not(
                        Matchers.anyOf(Matchers.containsString("http"),
                                Matchers.containsString("/"),
                                Matchers.containsString("TMDb"),
                                Matchers.containsString("Open Library")))));
        if (source == null) {
            result.andExpect(jsonPath("$.source").doesNotExist());
        } else {
            result.andExpect(jsonPath("$.source").value(source));
            // the contract's Problem.source is a DataSourceId: what is sent must parse as one
            DataSourceId.fromValue(source);
        }
        return result;
    }

    @Test
    void sourceNotFoundIs422() throws Exception {
        problem("/not-found", 422, "source_not_found", "open_library").andExpect(header().doesNotExist("Retry-After"));
    }

    @Test
    void keyProblemsAre409AndNameTheSource() throws Exception {
        problem("/missing", 409, "source_key_missing", "tmdb");
        problem("/invalid", 409, "source_key_invalid", "tmdb");
    }

    @Test
    void aRejectedKeyOnSaveIs422() throws Exception {
        problem("/rejected", 422, "source_key_rejected", "tmdb");
    }

    @Test
    void timeoutIs504() throws Exception {
        problem("/timeout", 504, "provider_timeout", "tmdb");
    }

    @Test
    void providerErrorIs502AndAFullGuardIs503WithoutASource() throws Exception {
        problem("/error", 502, "provider_error", "open_library").andExpect(header().doesNotExist("Retry-After"));
        problem("/busy", 503, "provider_error", null);
    }

    @Test
    void aClientFailureOutsideTheCatalogExceptionsIs502WithoutASourceOrTheUri() throws Exception {
        var body = problem("/io", 502, "provider_error", null).andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain("api.example.test", "secret");
    }

    @Test
    void providerRateLimitIs503WithRetryAfter() throws Exception {
        problem("/provider-429", 503, "provider_rate_limited", "open_library")
                .andExpect(header().string("Retry-After", "42"));
    }

    @Test
    void ourRateLimitIs429WithRetryAfterRoundedUpAndNoSource() throws Exception {
        problem("/limited", 429, "rate_limited", null).andExpect(header().string("Retry-After", "2"));
    }

    @Test
    void aTmdb401OnUseIs409SourceKeyInvalidNamingTmdb() throws Exception {
        wm.stubFor(WireMock.get(urlPathEqualTo("/3/configuration")).willReturn(aResponse().withStatus(401).withBody("{}")));
        wm.stubFor(WireMock.get(urlPathEqualTo("/3/movie/603")).willReturn(aResponse().withStatus(401)
                .withHeader("Content-Type", "application/json")
                .withBody("{\"status_message\":\"Invalid API key: secret provider text\"}")));

        var body = mvc.perform(get("/tmdb-401")).andExpect(status().isConflict()).andReturn().getResponse()
                .getContentAsString();

        assertThat(body).contains("\"code\":\"source_key_invalid\"", "\"source\":\"tmdb\"")
                .doesNotContain("secret provider text");
    }

    private static SettingsService englishUsers() {
        var settings = Mockito.mock(SettingsService.class);
        Mockito.when(settings.get(ArgumentMatchers.any())).thenReturn(new UserSettingsView(
                UUID.randomUUID(), "UTC", UiLocale.EN, Instant.now(), Instant.now()));
        return settings;
    }
}
