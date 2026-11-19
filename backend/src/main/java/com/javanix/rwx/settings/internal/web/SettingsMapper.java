package com.javanix.rwx.settings.internal.web;

import com.javanix.rwx.api.model.UserSettings;
import com.javanix.rwx.settings.UserSettingsView;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.mapstruct.Mapper;

@Mapper(componentModel = "spring")
interface SettingsMapper {

    UserSettings toSettings(UserSettingsView settings);

    default OffsetDateTime utc(Instant instant) {
        return instant == null ? null : instant.atOffset(ZoneOffset.UTC);
    }
}
