package com.javanix.rwx.common;

/** Unknown id or another user's id: indistinguishable on purpose. Maps to 404 {@code not_found}. */
public class NotFoundException extends RuntimeException {

    public NotFoundException() {
        super("Not found.");
    }
}
