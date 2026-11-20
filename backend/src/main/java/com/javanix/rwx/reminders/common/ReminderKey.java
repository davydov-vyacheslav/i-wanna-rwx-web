package com.javanix.rwx.reminders.common;

import java.util.UUID;

/** Ids are client UUIDs, unique per user only. */
public record ReminderKey(UUID userId, UUID id) {
}
