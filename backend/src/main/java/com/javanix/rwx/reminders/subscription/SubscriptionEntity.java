package com.javanix.rwx.reminders.subscription;

import com.javanix.rwx.reminders.common.ReminderEntity;
import com.javanix.rwx.reminders.common.ReminderKey;
import jakarta.persistence.Entity;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "subscriptions")
@IdClass(ReminderKey.class)
class SubscriptionEntity extends ReminderEntity {

    protected SubscriptionEntity() {
    }

    SubscriptionEntity(UUID userId, UUID id, Fields fields, Instant now) {
        super(userId, id, fields, now);
    }
}
