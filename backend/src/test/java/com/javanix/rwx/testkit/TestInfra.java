package com.javanix.rwx.testkit;

import com.javanix.rwx.identity.internal.persistence.CredentialRepository;
import com.javanix.rwx.identity.internal.persistence.UserRepository;
import com.javanix.rwx.identity.internal.persistence.UserSettingsRepository;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
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

    @Bean
    TestUsers testUsers(SessionRepository<?> sessions, UserRepository users,
            CredentialRepository credentials, UserSettingsRepository settings) {
        return new TestUsers(sessions, users, credentials, settings);
    }

    @Bean
    Api api(MockMvc mvc) {
        return new Api(mvc);
    }
}
