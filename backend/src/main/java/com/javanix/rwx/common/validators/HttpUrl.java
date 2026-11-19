package com.javanix.rwx.common.validators;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * The value, when present, is a URL with an http or https scheme and a host (see {@link HttpUrls}). Put on contract
 * fields with {@code x-field-extra-annotation} in {@code openapi.yaml}; a violation is the usual 400 {@code validation}.
 * Whether the URL names something we know is not this constraint's business (an unrecognized URL is also a 400 {@code validation} on {@code sourceUrl}).
 */
@Documented
@Constraint(validatedBy = HttpUrlValidator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
public @interface HttpUrl {

    String message() default "must be an http(s) URL";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
