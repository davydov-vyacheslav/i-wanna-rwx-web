package com.javanix.rwx.identity.internal.persistence;

import com.javanix.rwx.identity.internal.ExternalProfile;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "credentials")
public class CredentialEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(nullable = false, updatable = false)
    private String type;

    @Column(name = "external_id", nullable = false, updatable = false)
    private String externalId;

    // Identity metadata only (login, name, avatar_url); never a token.
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> data;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "last_used_at")
    private Instant lastUsedAt;

    protected CredentialEntity() {
    }

    public CredentialEntity(UUID id, UUID userId, ExternalProfile profile, Instant now) {
        this.id = id;
        this.userId = userId;
        this.type = profile.provider();
        this.externalId = profile.externalId();
        this.data = metadata(profile);
        this.createdAt = now;
        this.updatedAt = now;
        this.lastUsedAt = now;
    }

    public void refresh(ExternalProfile profile, Instant now) {
        this.data = metadata(profile);
        this.updatedAt = now;
        this.lastUsedAt = now;
    }

    public String login() {
        return text("login");
    }

    public String name() {
        return text("name");
    }

    public String avatarUrl() {
        return text("avatar_url");
    }

    private String text(String key) {
        return data != null && data.get(key) instanceof String s && !s.isBlank() ? s : null;
    }

    private static Map<String, Object> metadata(ExternalProfile profile) {
        var data = new LinkedHashMap<String, Object>();
        data.put("login", profile.login());
        data.put("name", profile.name());
        data.put("avatar_url", profile.avatarUrl());
        return data;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getType() {
        return type;
    }

    public String getExternalId() {
        return externalId;
    }

    public Map<String, Object> getData() {
        return data;
    }

    public Instant getLastUsedAt() {
        return lastUsedAt;
    }
}
