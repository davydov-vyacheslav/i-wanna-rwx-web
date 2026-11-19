package com.javanix.rwx.settings;

import com.javanix.rwx.api.model.UiLocale;
import java.time.Instant;
import java.util.UUID;

/** A user's settings as the module publishes them; the JPA entity stays internal. */
public record UserSettingsView(UUID userId, String timeZone, UiLocale locale, Instant createdAt, Instant updatedAt) {
}
