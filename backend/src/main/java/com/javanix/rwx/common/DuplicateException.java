package com.javanix.rwx.common;

import java.util.UUID;

/** Another live item of the user already holds this content; maps to 409 {@code duplicate} with {@code existingId}. */
public class DuplicateException extends RuntimeException {

    private final UUID existingId;

    public DuplicateException(UUID existingId) {
        super("Already in the library.");
        this.existingId = existingId;
    }

    public UUID existingId() {
        return existingId;
    }
}
