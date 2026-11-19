package com.javanix.rwx.datasource.internal.provider;

import jakarta.validation.constraints.NotBlank;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.boot.context.properties.bind.Name;
import org.springframework.util.unit.DataSize;
import org.springframework.validation.annotation.Validated;

/**
 * {@code rwx.datasource.*}. {@code contact} (env {@code RWX_DATASOURCE_CONTACT}) goes into the User-Agent so a provider can
 * reach us; a blank value fails startup. It is required in every profile (compose runs the {@code dev} profile and
 * must fail fast too); tests set it in {@code application.properties}.
 *
 * @param books      the default source (every user gets it stored at creation)
 * @param movies     same for movies and TV
 * @param cache      the short in-memory cache of normalized provider results (design section 4)
 */
@ConfigurationProperties("rwx.datasource")
@Validated
public record DataSourceProperties(
        @NotBlank(message = "RWX_DATASOURCE_CONTACT (rwx.datasource.contact) must be set: a contact for the provider User-Agent")
        String contact,
        @DefaultValue Http http,
        @DefaultValue Books books,
        @DefaultValue Movies movies,
        @DefaultValue Cache cache) {

    // timeouts, redirects and base URLs are spring.http.serviceclient.<open-library|tmdb>.* (application.yaml)
    public record Http(
            @DefaultValue("2MB") DataSize maxResponse,
            // read by @ConcurrencyLimit on the client interfaces through its placeholder; declared so a typo is flagged
            @DefaultValue("8") int maxConcurrent) {
    }

    public record Cache(@DefaultValue("true") boolean enabled, @DefaultValue("10m") Duration ttl,
            @DefaultValue("1000") long maxSize) {
    }

    // The default ids ("open_library", "tmdb") are set in application.yaml, so a bare context has no default.
    // defaultSource is the YAML key "default" ("default" is a Java keyword).
    public record Books(@Name("default") String defaultSource) {
    }

    public record Movies(@Name("default") String defaultSource) {
    }
}
