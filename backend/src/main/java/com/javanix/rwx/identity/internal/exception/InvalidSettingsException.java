package com.javanix.rwx.identity.internal.exception;

/** Rejected /me or /settings update; {@code code} is the problem code returned to the client. */
public class InvalidSettingsException extends RuntimeException {

    private final String code;

    public InvalidSettingsException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
