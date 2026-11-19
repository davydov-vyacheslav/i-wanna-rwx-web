package com.javanix.rwx.settings.internal;

/** Rejected /settings update; {@code code} is the problem code returned to the client. */
public class InvalidSettingsException extends RuntimeException {

    private final String code;
    private final String field;

    public InvalidSettingsException(String code, String field, String message) {
        super(message);
        this.code = code;
        this.field = field;
    }

    /** The offending property, or {@code body} when the request as a whole is wrong; reported in {@code errors[]}. */
    public String field() {
        return field;
    }

    public String code() {
        return code;
    }
}
