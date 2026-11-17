package com.javanix.rwx.identity.internal.exception;

/** Login of an account with {@code disabled_at} set. */
public class AccountDisabledException extends RuntimeException {

    public AccountDisabledException() {
        super("Account is disabled.");
    }
}
