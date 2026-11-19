package com.javanix.rwx.identity;

import java.util.UUID;

/**
 * Published inside the transaction that inserts the user, after the user and credential rows are flushed. Listeners
 * are synchronous and take part in that transaction: a listener failure rolls the new account back, so a module can
 * give every user its initial rows with no window where the user exists without them. {@code locale} is the UI
 * language fixed at sign-up (en, ru or uk, from the browser's Accept-Language; en when unknown).
 */
public record UserCreatedEvent(UUID userId, String locale) {
}
