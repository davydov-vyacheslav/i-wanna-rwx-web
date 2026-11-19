package com.javanix.rwx.common;

import java.util.List;

/** Rejected input; maps to 400 {@code validation} with {@code errors[]}. */
public class InvalidRequestException extends RuntimeException {

    private final List<Violation> errors;

    public InvalidRequestException(List<Violation> errors) {
        super("Invalid request.");
        this.errors = List.copyOf(errors);
    }

    public List<Violation> errors() {
        return errors;
    }
}
