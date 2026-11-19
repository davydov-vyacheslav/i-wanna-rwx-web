package com.javanix.rwx.common;

import java.util.List;

/** Rejected input; maps to 400 {@code validation} with {@code errors[]}. */
public class InvalidRequestException extends RuntimeException {

    private final List<Violation> errors;

    public InvalidRequestException(List<Violation> errors) {
        super("Invalid request.");
        this.errors = List.copyOf(errors);
    }

    /** No source recognizes the sourceUrl; the URL is user input and is never echoed. */
    public static InvalidRequestException unrecognizedSourceUrl() {
        return new InvalidRequestException(List.of(new Violation("sourceUrl", "not a supported source URL")));
    }

    public List<Violation> errors() {
        return errors;
    }
}
