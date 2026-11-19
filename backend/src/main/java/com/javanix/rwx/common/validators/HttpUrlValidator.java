package com.javanix.rwx.common.validators;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/** Null is valid (the contract's required/nullable rules own that). */
public class HttpUrlValidator implements ConstraintValidator<HttpUrl, String> {

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        return value == null || HttpUrls.parse(value).isPresent();
    }
}
