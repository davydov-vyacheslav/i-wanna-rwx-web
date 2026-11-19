package com.javanix.rwx.settings.internal.web;

import com.javanix.rwx.api.model.UserSettings;
import com.javanix.rwx.identity.AccountExportContributor;
import com.javanix.rwx.settings.SettingsService;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** The settings block of {@code GET /me/export}. */
@Component
class SettingsExport implements AccountExportContributor {

    private final SettingsService settings;
    private final SettingsMapper mapper;

    SettingsExport(SettingsService settings, SettingsMapper mapper) {
        this.settings = settings;
        this.mapper = mapper;
    }

    @Override
    public Optional<UserSettings> settings(UUID userId) {
        return Optional.of(mapper.toSettings(settings.get(userId)));
    }
}
