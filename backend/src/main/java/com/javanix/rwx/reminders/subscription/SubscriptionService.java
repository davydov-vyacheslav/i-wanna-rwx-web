package com.javanix.rwx.reminders.subscription;

import com.javanix.rwx.reminders.common.ReminderEntity;
import com.javanix.rwx.reminders.common.ReminderService;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** The user's subscriptions. Entities and repository are package-private, so the controller lives in this package. */
@Service
class SubscriptionService extends ReminderService<SubscriptionEntity> {

    SubscriptionService(SubscriptionRepository subscriptions, Clock clock, TransactionTemplate tx) {
        super(subscriptions, clock, tx);
    }

    @Override
    protected SubscriptionEntity newEntity(UUID userId, UUID id, ReminderEntity.Fields fields, Instant now) {
        return new SubscriptionEntity(userId, id, fields, now);
    }
}
