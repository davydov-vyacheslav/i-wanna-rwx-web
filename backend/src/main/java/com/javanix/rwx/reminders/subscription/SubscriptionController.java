package com.javanix.rwx.reminders.subscription;

import com.javanix.rwx.api.SubscriptionsApi;
import com.javanix.rwx.api.model.CreateSubscriptionRequest;
import com.javanix.rwx.api.model.RenewRequest;
import com.javanix.rwx.api.model.Subscription;
import com.javanix.rwx.api.model.UpdateSubscriptionRequest;
import com.javanix.rwx.identity.CurrentUserProvider;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
class SubscriptionController implements SubscriptionsApi {

    private final CurrentUserProvider currentUser;
    private final SubscriptionService subscriptions;
    private final SubscriptionApiMapper mapper;

    SubscriptionController(CurrentUserProvider currentUser, SubscriptionService subscriptions,
            SubscriptionApiMapper mapper) {
        this.currentUser = currentUser;
        this.subscriptions = subscriptions;
        this.mapper = mapper;
    }

    @Override
    public ResponseEntity<List<Subscription>> listSubscriptions() {
        return ResponseEntity.ok(subscriptions.list(currentUser.current().id()).stream().map(mapper::toApi).toList());
    }

    @Override
    public ResponseEntity<Subscription> createSubscription(CreateSubscriptionRequest request) {
        var result = subscriptions.create(currentUser.current().id(), request.getId(), mapper.toFields(request));
        var status = result.created() ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(mapper.toApi(result.entity()));
    }

    @Override
    public ResponseEntity<Subscription> getSubscription(UUID id) {
        return ResponseEntity.ok(mapper.toApi(subscriptions.get(currentUser.current().id(), id)));
    }

    @Override
    public ResponseEntity<Subscription> updateSubscription(UUID id, UpdateSubscriptionRequest request) {
        return ResponseEntity.ok(mapper.toApi(
                subscriptions.patch(currentUser.current().id(), id, mapper.toFields(request))));
    }

    @Override
    public ResponseEntity<Void> deleteSubscription(UUID id) {
        subscriptions.delete(currentUser.current().id(), id);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Subscription> renewSubscription(UUID id, RenewRequest request) {
        return ResponseEntity.ok(mapper.toApi(
                subscriptions.renew(currentUser.current().id(), id, request.getExpectedExpiryDate())));
    }
}
