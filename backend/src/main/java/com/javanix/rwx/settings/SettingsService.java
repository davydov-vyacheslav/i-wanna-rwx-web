package com.javanix.rwx.settings;

import com.javanix.rwx.api.model.UiLocale;
import com.javanix.rwx.settings.internal.InvalidSettingsException;
import com.javanix.rwx.settings.internal.UserSettingsEntity;
import com.javanix.rwx.settings.internal.UserSettingsRepository;
import java.time.Clock;
import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Published API of the module: reads and partially updates a user's settings record (created with the user, see
 * {@code UserSettingsListener}).
 */
@Service
public class SettingsService {

    private final UserSettingsRepository settings;

    private final Clock clock;

    SettingsService(UserSettingsRepository settings, Clock clock) {
        this.settings = settings;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public UserSettingsView get(UUID userId) {
        return view(load(userId));
    }

    /** Nothing is written when validation fails. */
    @Transactional
    public UserSettingsView update(UUID userId, String timeZone, UiLocale locale) {
        if (timeZone == null && locale == null) {
            throw new InvalidSettingsException("validation", "body", "At least one property is required.");
        }
        ZoneId newZone = timeZone == null ? null : parseZone(timeZone);
        var row = load(userId);
        row.apply(newZone == null ? null : newZone.getId(), locale == null ? null : locale.getValue(), clock.instant());
        settings.saveAndFlush(row);
        return view(row);
    }

    private UserSettingsEntity load(UUID userId) {
        return settings.findByUserId(userId)
                .orElseThrow(() -> new IllegalStateException("User has no settings record: " + userId));
    }

    private static UserSettingsView view(UserSettingsEntity row) {
        return new UserSettingsView(row.getUserId(), row.getTimezone(), UiLocale.fromValue(row.getLocale()),
                row.getCreatedAt(), row.getUpdatedAt());
    }

    private static ZoneId parseZone(String id) {
        // getAvailableZoneIds is the IANA list; ZoneId.of alone would also accept offsets such as "+02:00".
        if (!ZoneId.getAvailableZoneIds().contains(id)) {
            throw new InvalidSettingsException("invalid_timezone", "timeZone", "Unknown IANA time zone.");
        }
        try {
            return ZoneId.of(id);
        } catch (DateTimeException e) {
            throw new InvalidSettingsException("invalid_timezone", "timeZone", "Unknown IANA time zone.");
        }
    }
}
