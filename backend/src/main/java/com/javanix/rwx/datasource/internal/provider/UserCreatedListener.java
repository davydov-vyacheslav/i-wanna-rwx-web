package com.javanix.rwx.datasource.internal.provider;

import com.javanix.rwx.identity.UserCreatedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Plain synchronous listener on purpose (not {@code @ApplicationModuleListener}): it runs in the sign-up transaction,
 * so the user never exists without its default source rows.
 */
@Component
class UserCreatedListener {

    private final UserDataSourceService sources;

    UserCreatedListener(UserDataSourceService sources) {
        this.sources = sources;
    }

    @EventListener
    void on(UserCreatedEvent event) {
        sources.createDefaults(event.userId());
    }
}
