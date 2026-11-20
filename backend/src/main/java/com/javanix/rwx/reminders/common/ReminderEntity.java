package com.javanix.rwx.reminders.common;

import com.javanix.rwx.common.InvalidRequestException;
import com.javanix.rwx.common.Violation;
import jakarta.persistence.Column;
import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.util.StringUtils;

/**
 * The columns and rules subscriptions and licenses share. The subclass names the table and the {@code @IdClass}.
 * No {@code toString}: a subclass holding a license key must not print it.
 */
@MappedSuperclass
public abstract class ReminderEntity {

    /** Year 3000 would serialize beyond what the client parses; V001 has the same bound. */
    static final LocalDate MAX_EXPIRY = LocalDate.of(2999, 12, 31);

    /**
     * The editable content. In a patch a null component means unchanged, so a field cannot be set back to null
     * there; blank {@code cost} and {@code description} clear the value, and the rules below make the other
     * two derived: a lifetime has no expiry date, days exist only for {@code custom}. {@code licenseKey} is only
     * read by licenses; the shared rules never carry it, and it stays out of {@code toString}.
     */
    public record Fields(String name, LocalDate expiryDate, String renewalPattern, Integer customRenewalDays,
            Integer remindDays, String cost, String description, String licenseKey) {

        @Override
        public String toString() {
            return "Fields[name=" + name + "]";
        }

        Fields over(Fields current) {
            return new Fields(name != null ? name : current.name, expiryDate != null ? expiryDate : current.expiryDate,
                    renewalPattern != null ? renewalPattern : current.renewalPattern,
                    customRenewalDays != null ? customRenewalDays : current.customRenewalDays,
                    remindDays != null ? remindDays : current.remindDays, cost != null ? cost : current.cost,
                    description != null ? description : current.description, null);
        }

        /** Applies the derived rules and checks what the contract cannot see: the merged record. */
        Fields valid() {
            var lifetime = "lifetime".equals(renewalPattern);
            var custom = "custom".equals(renewalPattern);
            var normalized = new Fields(name, lifetime ? null : expiryDate, renewalPattern,
                    custom ? customRenewalDays : null, remindDays, StringUtils.hasText(cost) ? cost : null,
                    StringUtils.hasText(description) ? description : null, null);
            var errors = new ArrayList<Violation>();
            if (!lifetime && normalized.expiryDate == null) {
                errors.add(new Violation("expiryDate", "required unless the pattern is lifetime"));
            } else if (normalized.expiryDate != null && normalized.expiryDate.isAfter(MAX_EXPIRY)) {
                errors.add(new Violation("expiryDate", "must not be after " + MAX_EXPIRY));
            }
            if (custom && (customRenewalDays == null || customRenewalDays <= 0)) {
                errors.add(new Violation("customRenewalDays", "required and positive for the custom pattern"));
            }
            if (!errors.isEmpty()) {
                throw new InvalidRequestException(errors);
            }
            return normalized;
        }
    }

    @Id
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(name = "expiry_date")
    private LocalDate expiryDate;

    @Column(name = "renewal_pattern", nullable = false)
    private String renewalPattern;

    @Column(name = "custom_renewal_days")
    private Integer customRenewalDays;

    @Column(name = "remind_days", nullable = false)
    private int remindDays;

    private String cost;

    private String description;

    @Column(nullable = false)
    private long version;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ReminderEntity() {
    }

    /** A new record at version 1; throws {@link InvalidRequestException} when the content is not valid. */
    protected ReminderEntity(UUID userId, UUID id, Fields fields, Instant now) {
        this.userId = userId;
        this.id = id;
        set(fields.valid());
        this.version = 1;
        this.createdAt = now;
        this.updatedAt = now;
    }

    /** Merges the non-null components; false, writing nothing, when the result equals the stored content. */
    public boolean apply(Fields patch, Instant now) {
        var merged = patch.over(fields()).valid();
        if (merged.equals(fields())) {
            return false;
        }
        set(merged);
        touch(now);
        return true;
    }

    /**
     * Adds one renewal period when {@code expectedExpiryDate} is the stored date; false, writing nothing, when it is
     * not (a stale repeat). Month and year additions clamp to the month's last day and the clamp is not remembered.
     */
    public boolean renew(LocalDate expectedExpiryDate, Instant now) {
        var next = switch (renewalPattern) {
            case "monthly" -> expiryDate.plusMonths(1);
            case "yearly" -> expiryDate.plusYears(1);
            case "custom" -> expiryDate.plusDays(customRenewalDays);
            default -> null; // lifetime and none never renew, even for a stale date
        };
        if (next == null) {
            throw new InvalidRequestException(
                    List.of(new Violation("renewalPattern", "a " + renewalPattern + " record cannot be renewed")));
        }
        if (!expiryDate.equals(expectedExpiryDate)) {
            return false;
        }
        if (next.isAfter(MAX_EXPIRY)) {
            throw new InvalidRequestException(
                    List.of(new Violation("expiryDate", "the renewed date would be after " + MAX_EXPIRY)));
        }
        expiryDate = next;
        touch(now);
        return true;
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

    private Fields fields() {
        return new Fields(name, expiryDate, renewalPattern, customRenewalDays, remindDays, cost, description, null);
    }

    private void set(Fields f) {
        name = f.name;
        expiryDate = f.expiryDate;
        renewalPattern = f.renewalPattern;
        customRenewalDays = f.customRenewalDays;
        remindDays = f.remindDays;
        cost = f.cost;
        description = f.description;
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

    public String getName() {
        return name;
    }

    public LocalDate getExpiryDate() {
        return expiryDate;
    }

    public String getRenewalPattern() {
        return renewalPattern;
    }

    public Integer getCustomRenewalDays() {
        return customRenewalDays;
    }

    public int getRemindDays() {
        return remindDays;
    }

    public String getCost() {
        return cost;
    }

    public String getDescription() {
        return description;
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
