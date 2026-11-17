package com.javanix.rwx.identity;

/** Mapped to a 401 problem+json. */
public class NotAuthenticatedException extends RuntimeException {

    public NotAuthenticatedException() {
        super("Authentication is required.");
    }
}
