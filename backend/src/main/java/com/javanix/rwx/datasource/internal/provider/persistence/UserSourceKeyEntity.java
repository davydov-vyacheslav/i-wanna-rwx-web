package com.javanix.rwx.datasource.internal.provider.persistence;

import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;

/** The API key a user saved for a source, stored as is. Never part of {@code toString}. */
@Entity
@Table(name = "user_source_keys")
public class UserSourceKeyEntity {

    @Embeddable
    public record Id(UUID userId, String source) {
    }

    @EmbeddedId
    private Id id;

    private String apiKey;

    protected UserSourceKeyEntity() {
    }

    public UserSourceKeyEntity(UUID userId, String source, String apiKey) {
        this.id = new Id(userId, source);
        this.apiKey = apiKey;
    }

    public String getSource() {
        return id.source();
    }

    public String getApiKey() {
        return apiKey;
    }

    @Override
    public String toString() {
        return "UserSourceKeyEntity[source=" + id.source() + "]";
    }
}
