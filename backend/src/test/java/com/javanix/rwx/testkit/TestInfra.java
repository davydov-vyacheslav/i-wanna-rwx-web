package com.javanix.rwx.testkit;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.javanix.rwx.identity.internal.persistence.CredentialRepository;
import com.javanix.rwx.identity.internal.persistence.UserRepository;
import com.javanix.rwx.settings.internal.UserSettingsRepository;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.session.SessionRepository;
import org.springframework.test.context.DynamicPropertyRegistrar;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.postgresql.PostgreSQLContainer;

@TestConfiguration(proxyBeanMethods = false)
class TestInfra {

    // keep in sync with deploy/docker/docker-compose.yml
    @Bean
    @ServiceConnection
    PostgreSQLContainer postgres() {
        return new PostgreSQLContainer("postgres:18-alpine");
    }

    @Bean(destroyMethod = "stop")
    GithubStub githubStub() {
        return new GithubStub();
    }

    @Bean
    DynamicPropertyRegistrar githubEndpoints(GithubStub github) {
        return registry -> {
            var provider = "spring.security.oauth2.client.provider.github.";
            registry.add(provider + "authorization-uri", () -> github.baseUrl() + "/login/oauth/authorize");
            registry.add(provider + "token-uri", () -> github.baseUrl() + "/login/oauth/access_token");
            registry.add(provider + "user-info-uri", () -> github.baseUrl() + "/user");
        };
    }

    /** Stand-in for openlibrary.org and api.themoviedb.org (external HTTP only); tests reset it and stub what they call. */
    @Bean(destroyMethod = "stop")
    WireMockServer providerStub() {
        var server = new WireMockServer(WireMockConfiguration.wireMockConfig().dynamicPort());
        server.start();
        return server;
    }

    @Bean
    DynamicPropertyRegistrar providerEndpoints(WireMockServer providerStub) {
        return registry -> {
            registry.add("rwx.datasource.books.open-library.base-url", providerStub::baseUrl);
            registry.add("rwx.datasource.movies.tmdb.base-url", () -> providerStub.baseUrl() + "/3");
        };
    }

    @Bean
    TestUsers testUsers(SessionRepository<?> sessions, UserRepository users,
            CredentialRepository credentials, UserSettingsRepository settings,
            ApplicationEventPublisher events) {
        return new TestUsers(sessions, users, credentials, settings, events);
    }

    @Bean
    Api api(MockMvc mvc) {
        return new Api(mvc);
    }
}
