package com.javanix.rwx.datasource.internal.provider;

import java.time.Clock;
import java.util.Properties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.http.client.autoconfigure.imperative.ImperativeHttpClientAutoConfiguration;
import org.springframework.boot.http.client.autoconfigure.service.HttpServiceClientPropertiesAutoConfiguration;
import org.springframework.boot.info.BuildProperties;
import org.springframework.boot.restclient.autoconfigure.service.HttpServiceClientAutoConfiguration;
import org.springframework.boot.test.util.TestPropertyValues;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;

/**
 * A provider client built the way the application builds it: the real {@code application.yaml} (timeouts, redirects),
 * the real {@link DataSourceConfig} configurer and the Spring proxy, over a small context. {@code config} carries the
 * {@code @ImportHttpServices} of the client; {@code properties} are {@code key=value} overrides (base URL, limits).
 */
public final class TestClients {

    private TestClients() {}

    @TestConfiguration(proxyBeanMethods = false)
    @Import(DataSourceConfig.class)
    static class Base {
        @Bean
        Clock clock() {
            return Clock.systemUTC();
        }

        @Bean
        BuildProperties buildProperties() {
            var entries = new Properties();
            entries.setProperty("version", "1.0");
            return new BuildProperties(entries);
        }
    }

    public static <T> T client(Class<T> api, Class<?> config, String... properties) {
        var ctx = new AnnotationConfigApplicationContext();
        TestPropertyValues.of("rwx.datasource.contact=ops@example.com").and(properties).applyTo(ctx);
        new ConfigDataApplicationContextInitializer().initialize(ctx);
        ctx.register(Base.class, config, HttpServiceClientAutoConfiguration.class,
                HttpServiceClientPropertiesAutoConfiguration.class, ImperativeHttpClientAutoConfiguration.class);
        ctx.registerShutdownHook();
        ctx.refresh();
        return ctx.getBean(api);
    }
}
