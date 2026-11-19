package com.javanix.rwx.media.common;

import jakarta.persistence.Column;
import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;
import java.time.Instant;
import java.util.UUID;
import org.springframework.util.StringUtils;

/**
 * The columns and state rules books and movies share. The subclass names the table and the {@code @IdClass}; only
 * the status and favorite rules are common, its own fields it applies itself and then calls {@link #touch}.
 */
@MappedSuperclass
public abstract class MediaEntity {

    @Id
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String status;

    @Column(name = "is_favorite", nullable = false)
    private boolean favorite;

    private String description;

    @Column(name = "external_id", nullable = false, updatable = false)
    private String externalId;

    @Column(name = "external_link", nullable = false, updatable = false)
    private String externalLink;

    @Column(nullable = false)
    private long version;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected MediaEntity() {
    }

    /** A new item: {@code planned}, not a favorite, version 1. The caller supplies the identity it computed. */
    protected MediaEntity(UUID userId, UUID id, String externalId, String externalLink, String title,
            String description, Instant now) {
        this.userId = userId;
        this.id = id;
        this.externalId = externalId;
        this.externalLink = externalLink;
        this.title = title;
        this.description = StringUtils.hasText(description) ? description : null; // blank means no description
        this.status = "planned";
        this.version = 1;
        this.createdAt = now;
        this.updatedAt = now;
    }

    /** Applies the non-null status and favorite; true when one differs from the stored value. Does not touch. */
    protected boolean applyCommon(String newStatus, Boolean newFavorite) {
        var changed = false;
        if (newStatus != null && !newStatus.equals(status)) {
            status = newStatus;
            changed = true;
        }
        if (newFavorite != null && newFavorite != favorite) {
            favorite = newFavorite;
            changed = true;
        }
        return changed;
    }

    /** Idempotent: a second call leaves the first tombstone as it was. The description goes with the content. */
    public boolean tombstone(Instant now) {
        if (deletedAt != null) {
            return false;
        }
        deletedAt = now;
        description = null;
        touch(now);
        return true;
    }

    protected void touch(Instant now) {
        version++;
        updatedAt = now;
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public String getStatus() {
        return status;
    }

    public boolean isFavorite() {
        return favorite;
    }

    public String getDescription() {
        return description;
    }

    public String getExternalId() {
        return externalId;
    }

    public String getExternalLink() {
        return externalLink;
    }

    public long getVersion() {
        return version;
    }

    public Instant getDeletedAt() {
        return deletedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
