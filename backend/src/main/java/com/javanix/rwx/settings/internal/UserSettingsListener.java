package com.javanix.rwx.settings.internal;

import com.javanix.rwx.identity.UserCreatedEvent;
import java.time.Clock;
import java.util.UUID;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/** Synchronous on purpose: it runs in the sign-up transaction, so the user never exists without a settings record. */
@Component
class UserSettingsListener {

    private final UserSettingsRepository settings;

    private final Clock clock;

    UserSettingsListener(UserSettingsRepository settings, Clock clock) {
        this.settings = settings;
        this.clock = clock;
    }

    @EventListener
    void on(UserCreatedEvent event) {
        settings.save(new UserSettingsEntity(UUID.randomUUID(), event.userId(), "UTC", event.locale(), clock.instant()));
    }
}
