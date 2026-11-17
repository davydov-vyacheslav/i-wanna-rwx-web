package com.javanix.rwx.identity.internal.web;

import com.javanix.rwx.api.SettingsApi;
import com.javanix.rwx.api.model.ConfigureExternalDataSourceRequest;
import com.javanix.rwx.api.model.ExternalDataSourceConfig;
import com.javanix.rwx.api.model.UpdateSettingsRequest;
import com.javanix.rwx.api.model.UserSettings;
import com.javanix.rwx.identity.CurrentUserProvider;
import com.javanix.rwx.identity.internal.AccountService;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
class SettingsController implements SettingsApi {

    private final CurrentUserProvider currentUser;
    private final AccountService accounts;
    private final IdentityMapper mapper;

    SettingsController(CurrentUserProvider currentUser, AccountService accounts, IdentityMapper mapper) {
        this.currentUser = currentUser;
        this.accounts = accounts;
        this.mapper = mapper;
    }

    @Override
    public ResponseEntity<UserSettings> getSettings() {
        return ResponseEntity.ok(mapper.toSettings(accounts.settings(currentUser.current().id())));
    }

    @Override
    public ResponseEntity<UserSettings> updateSettings(UpdateSettingsRequest request) {
        var locale = request.getLocale() == null ? null : request.getLocale().getValue();
        var row = accounts.update(currentUser.current().id(), request.getTimeZone(), locale,
                request.getPushNotificationsEnabled());
        return ResponseEntity.ok(mapper.toSettings(row));
    }

    // External data sources belong to media-search, not to this task.
    @Override
    public ResponseEntity<ExternalDataSourceConfig> configureExternalDataSource(
            ConfigureExternalDataSourceRequest request) {
        throw new ResponseStatusException(HttpStatus.NOT_IMPLEMENTED);
    }

    @Override
    public ResponseEntity<List<ExternalDataSourceConfig>> listExternalDataSources() {
        throw new ResponseStatusException(HttpStatus.NOT_IMPLEMENTED);
    }

    @Override
    public ResponseEntity<Void> removeExternalDataSource(String sourceType) {
        throw new ResponseStatusException(HttpStatus.NOT_IMPLEMENTED);
    }
}
