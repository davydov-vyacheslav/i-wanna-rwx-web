package com.javanix.rwx.datasource.internal.provider;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.time.Clock;
import com.javanix.rwx.datasource.CatalogException.ProviderError;
import com.javanix.rwx.datasource.CatalogException.ProviderRateLimited;
import com.javanix.rwx.datasource.CatalogException.ProviderTimeout;
import com.javanix.rwx.datasource.CatalogException.SourceNotFound;
import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ResolvableType;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.web.client.support.RestClientHttpServiceGroupConfigurer;
import tools.jackson.core.StreamReadConstraints;
import tools.jackson.core.json.JsonFactory;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.info.BuildProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.resilience.annotation.EnableResilientMethods;

/**
 * Provider-side beans only: {@code provider} must not see {@code book} or {@code movie}, so their registries,
 * catalogs and sources are components of their own packages.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(DataSourceProperties.class)
@EnableResilientMethods
public class DataSourceConfig {

    private static final Logger log = LoggerFactory.getLogger(DataSourceConfig.class);

    /**
     * What every provider client shares; base URL, timeouts and "no redirects" are {@code spring.http.serviceclient.*}
     * properties, the concurrency limit sits on the client interfaces. Nothing here may carry a URI, query or token
     * into a log line or an exception: failures become {@code CatalogException}s with fixed text.
     */
    @Bean
    RestClientHttpServiceGroupConfigurer providerClientConfigurer(DataSourceProperties props, BuildProperties build) {
        var userAgent = "RWX/" + build.getVersion() + " (" + props.contact().strip() + ")";
        var factory = JsonFactory.builder().streamReadConstraints(
                StreamReadConstraints.builder().maxDocumentLength(props.http().maxResponse().toBytes()).build()).build();
        var mapper = JsonMapper.builder(factory).disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();
        return groups -> groups.forEachClient((group, client) -> {
            var id = group.name().replace('-', '_'); // group open-library is the data source open_library
            client.defaultHeader(HttpHeaders.USER_AGENT, userAgent).defaultHeader(HttpHeaders.ACCEPT, "application/json")
                    .configureMessageConverters(c -> c.withJsonConverter(new JsonConverter(mapper, id)))
                    .requestInterceptor((request, body, next) -> {
                        var started = System.nanoTime();
                        try {
                            var response = next.execute(request, body);
                            log.info("provider={} status={} latencyMs={}", id, response.getStatusCode().value(),
                                    (System.nanoTime() - started) / 1_000_000);
                            return response;
                        } catch (IOException e) {
                            // the client's own message carries the URI, so no cause is kept
                            log.info("provider={} outcome=io_failure latencyMs={}", id, (System.nanoTime() - started) / 1_000_000);
                            throw new ProviderTimeout(id);
                        }
                    })
                    .defaultStatusHandler(status -> !status.is2xxSuccessful(), (request, response) -> {
                        throw switch (response.getStatusCode().value()) {
                            case 404 -> new SourceNotFound(id);
                            case 429 -> new ProviderRateLimited(id, retryAfter(response.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)));
                            case 401 -> new ProviderUnauthorized(id);
                            default -> new ProviderError(id);
                        };
                    });
        });
    }

    /** A malformed or oversized body (the size cap is the mapper's) is a provider error, not a client exception. */
    private static final class JsonConverter extends JacksonJsonHttpMessageConverter {
        private final String id;

        JsonConverter(JsonMapper mapper, String id) {
            super(mapper);
            this.id = id;
            setSupportedMediaTypes(List.of(MediaType.APPLICATION_JSON, MediaType.ALL)); // JSON whatever a provider labels it
        }

        @Override
        public Object read(ResolvableType type, HttpInputMessage message, Map<String, Object> hints) {
            try {
                return super.read(type, message, hints);
            } catch (IOException | HttpMessageNotReadableException e) {
                throw new ProviderError(id);
            }
        }
    }

    /** Seconds only (the HTTP-date form falls back to 30 s), clamped to 1 s..5 min. */
    private static Duration retryAfter(String header) {
        return Duration.ofSeconds(header == null || !header.strip().matches("[0-9]{1,6}") ? 30
                : Math.clamp(Long.parseLong(header.strip()), 1, 300));
    }

    @Bean
    RateLimiter rateLimiter(Clock clock) {
        return new RateLimiter(clock);
    }

    /**
     * Short-lived cache of normalized provider results (public catalogue data only, never a token or anything
     * user-owned). {@code get(key, loader)} is atomic: concurrent identical misses load once, a failed load is not cached
     * and its exception propagates unchanged. Disabled = size 0, so nothing is retained.
     */
    @Bean
    Cache<String, Object> providerCache(DataSourceProperties props) {
        return newCache(props.cache());
    }

    public static Cache<String, Object> newCache(DataSourceProperties.Cache cache) {
        var builder = Caffeine.newBuilder();
        return (cache.enabled() ? builder.expireAfterWrite(cache.ttl()).maximumSize(cache.maxSize())
                : builder.maximumSize(0)).build();
    }

    // ObjectProvider: with no source beans a plain List injection point would fail instead of being empty
    @Bean
    SourceDirectory sourceDirectory(ObjectProvider<SourceInfo> beans, DataSourceProperties props) {
        return new SourceDirectory(beans.orderedStream().toList(), props.books().defaultSource(),
                props.movies().defaultSource());
    }
}
