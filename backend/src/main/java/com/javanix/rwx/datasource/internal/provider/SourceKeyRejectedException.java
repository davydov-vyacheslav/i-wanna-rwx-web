package com.javanix.rwx.datasource.internal.provider;

/**
 * The provider refused the key the user is saving (TMDb answered 401 to the validation call): nothing was stored
 * (422 {@code source_key_rejected}). Carries the wire id of the source so the problem can name it.
 */
public class SourceKeyRejectedException extends RuntimeException {

    private final String source;

    public SourceKeyRejectedException(String source) {
        super("The source rejected the key.", null, false, false);
        this.source = source;
    }

    public String source() {
        return source;
    }
}
