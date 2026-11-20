package com.javanix.rwx.reminders.license;

import com.javanix.rwx.reminders.common.ReminderEntity;
import com.javanix.rwx.reminders.common.ReminderKey;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.springframework.util.StringUtils;

@Entity
@Table(name = "licenses")
@IdClass(ReminderKey.class)
class LicenseEntity extends ReminderEntity {

    @Column(name = "license_key")
    private String licenseKey;

    protected LicenseEntity() {
    }

    LicenseEntity(UUID userId, UUID id, Fields fields, Instant now) {
        super(userId, id, fields, now);
        licenseKey = StringUtils.hasText(fields.licenseKey()) ? fields.licenseKey() : null;
    }

    /** A null key leaves the stored one, a blank key removes it; a changed key counts as a change. */
    @Override
    public boolean apply(Fields patch, Instant now) {
        var changed = super.apply(patch, now);
        if (patch.licenseKey() == null) {
            return changed;
        }
        var key = StringUtils.hasText(patch.licenseKey()) ? patch.licenseKey() : null;
        if (Objects.equals(key, licenseKey)) {
            return changed;
        }
        licenseKey = key;
        if (!changed) {
            touch(now);
        }
        return true;
    }

    @Override
    public boolean tombstone(Instant now) {
        var deleted = super.tombstone(now);
        licenseKey = null;
        return deleted;
    }

    public String getLicenseKey() {
        return licenseKey;
    }
}
