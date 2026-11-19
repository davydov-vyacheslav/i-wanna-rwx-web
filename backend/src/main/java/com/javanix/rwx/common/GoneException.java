package com.javanix.rwx.common;

/** The id was deleted; a tombstoned id is never recreated or changed. Maps to 410 {@code gone}. */
public class GoneException extends RuntimeException {

    public GoneException() {
        super("Deleted.");
    }
}
