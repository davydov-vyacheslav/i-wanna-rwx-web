package com.javanix.rwx.datasource.internal.provider.persistence;

import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;

/** The source a user chose as default of a resource type (wire values); the primary key allows one per type. */
@Entity
@Table(name = "user_default_sources")
public class UserDefaultSourceEntity {

    @Embeddable
    public record Id(UUID userId, String resourceType) {
    }

    @EmbeddedId
    private Id id;

    private String source;

    protected UserDefaultSourceEntity() {
    }

    public UserDefaultSourceEntity(UUID userId, String resourceType, String source) {
        this.id = new Id(userId, resourceType);
        this.source = source;
    }

    public String getResourceType() {
        return id.resourceType();
    }

    public String getSource() {
        return source;
    }
}
