/**
 * Module "settings": the user's single settings record (IANA timezone, UI locale) and its API. Published API
 * is this package: {@link com.javanix.rwx.settings.SettingsService} and the {@link com.javanix.rwx.settings.UserSettingsView} it returns. The record is created with defaults (UTC, and the locale chosen at sign-up from the event) when the user is, by a synchronous listener on {@code identity.UserCreatedEvent}.
 */
@ApplicationModule(displayName = "Settings", allowedDependencies = {"identity", "common", "api"})
package com.javanix.rwx.settings;

import org.springframework.modulith.ApplicationModule;
