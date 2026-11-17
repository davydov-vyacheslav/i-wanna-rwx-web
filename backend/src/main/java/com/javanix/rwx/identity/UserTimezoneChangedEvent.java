package com.javanix.rwx.identity;

import java.time.ZoneId;
import java.util.UUID;

/** Published only when the stored zone actually changes; the reminders scheduler will listen. */
public record UserTimezoneChangedEvent(UUID userId, ZoneId oldZone, ZoneId newZone) {
}
