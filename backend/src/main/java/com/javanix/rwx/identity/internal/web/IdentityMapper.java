package com.javanix.rwx.identity.internal.web;

import com.javanix.rwx.api.model.Me;
import com.javanix.rwx.api.model.UserSettings;
import com.javanix.rwx.identity.internal.AccountService.Profile;
import com.javanix.rwx.identity.internal.persistence.UserSettingsEntity;
import java.net.URI;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
interface IdentityMapper {

    @Mapping(target = "id", source = "settings.userId")
    @Mapping(target = "timeZone", source = "settings.timezone")
    @Mapping(target = "locale", source = "settings.locale")
    @Mapping(target = "displayName", source = "profile.displayName")
    @Mapping(target = "avatarUrl", source = "profile.avatarUrl")
    Me toMe(UserSettingsEntity settings, Profile profile);

    @Mapping(target = "timeZone", source = "timezone")
    UserSettings toSettings(UserSettingsEntity settings);

    // generated enums are named EN/RU/UK with the wire value "en"; MapStruct's name-based mapping would not match
    default Me.LocaleEnum meLocale(String locale) {
        return locale == null ? null : Me.LocaleEnum.fromValue(locale);
    }

    default UserSettings.LocaleEnum settingsLocale(String locale) {
        return locale == null ? null : UserSettings.LocaleEnum.fromValue(locale);
    }

    default URI uri(String value) {
        return value == null ? null : URI.create(value);
    }

    default OffsetDateTime utc(Instant instant) {
        return instant == null ? null : instant.atOffset(ZoneOffset.UTC);
    }
}
