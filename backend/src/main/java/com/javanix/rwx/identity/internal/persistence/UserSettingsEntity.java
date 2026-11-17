package com.javanix.rwx.identity.internal.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_settings")
public class UserSettingsEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false, unique = true)
    private UUID userId;

    @Column(nullable = false)
    private String timezone;

    private String locale;

    @Column(name = "push_notifications_enabled", nullable = false)
    private boolean pushNotificationsEnabled;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserSettingsEntity() {
    }

    public UserSettingsEntity(UUID id, UUID userId, String timezone, Instant now) {
        this.id = id;
        this.userId = userId;
        this.timezone = timezone;
        this.pushNotificationsEnabled = true;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void update(String timezone, String locale, Instant now) {
        this.timezone = timezone;
        this.locale = locale;
        this.updatedAt = now;
    }

    /** Null arguments leave the field as it is. */
    public void apply(String timezone, String locale, Boolean pushNotificationsEnabled, Instant now) {
        if (timezone != null) {
            this.timezone = timezone;
        }
        if (locale != null) {
            this.locale = locale;
        }
        if (pushNotificationsEnabled != null) {
            this.pushNotificationsEnabled = pushNotificationsEnabled;
        }
        this.updatedAt = now;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getTimezone() {
        return timezone;
    }

    public String getLocale() {
        return locale;
    }

    public boolean isPushNotificationsEnabled() {
        return pushNotificationsEnabled;
    }
}
