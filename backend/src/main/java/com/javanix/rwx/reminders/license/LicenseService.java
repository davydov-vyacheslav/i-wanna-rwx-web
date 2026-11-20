package com.javanix.rwx.reminders.license;

import com.javanix.rwx.reminders.common.ReminderEntity;
import com.javanix.rwx.reminders.common.ReminderService;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** The user's licenses. Entities and repository are package-private, so the controller lives in this package. */
@Service
class LicenseService extends ReminderService<LicenseEntity> {

    LicenseService(LicenseRepository licenses, Clock clock, TransactionTemplate tx) {
        super(licenses, clock, tx);
    }

    @Override
    protected LicenseEntity newEntity(UUID userId, UUID id, ReminderEntity.Fields fields, Instant now) {
        return new LicenseEntity(userId, id, fields, now);
    }
}
