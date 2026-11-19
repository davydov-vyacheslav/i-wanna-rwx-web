package com.javanix.rwx.settings.internal.web;

import com.javanix.rwx.api.SettingsApi;
import com.javanix.rwx.api.model.UpdateSettingsRequest;
import com.javanix.rwx.api.model.UserSettings;
import com.javanix.rwx.identity.CurrentUserProvider;
import com.javanix.rwx.settings.SettingsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
class SettingsController implements SettingsApi {

    private final CurrentUserProvider currentUser;
    private final SettingsService settings;
    private final SettingsMapper mapper;

    SettingsController(CurrentUserProvider currentUser, SettingsService settings, SettingsMapper mapper) {
        this.currentUser = currentUser;
        this.settings = settings;
        this.mapper = mapper;
    }

    @Override
    public ResponseEntity<UserSettings> getSettings() {
        return ResponseEntity.ok(mapper.toSettings(settings.get(currentUser.current().id())));
    }

    @Override
    public ResponseEntity<UserSettings> updateSettings(UpdateSettingsRequest request) {
        var row = settings.update(currentUser.current().id(), request.getTimeZone(), request.getLocale());
        return ResponseEntity.ok(mapper.toSettings(row));
    }
}
