package com.javanix.rwx.reminders.subscription;

import com.javanix.rwx.api.model.Subscription;
import com.javanix.rwx.identity.AccountExportContributor;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** The subscriptions block of {@code GET /me/export}: live items only. */
@Component
class SubscriptionExport implements AccountExportContributor {

    private final SubscriptionService subscriptions;
    private final SubscriptionApiMapper mapper;

    SubscriptionExport(SubscriptionService subscriptions, SubscriptionApiMapper mapper) {
        this.subscriptions = subscriptions;
        this.mapper = mapper;
    }

    @Override
    public List<Subscription> subscriptions(UUID userId) {
        return subscriptions.list(userId).stream().map(mapper::toApi).toList();
    }
}
