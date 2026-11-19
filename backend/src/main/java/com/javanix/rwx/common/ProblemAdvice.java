package com.javanix.rwx.common;

import java.util.ArrayList;
import java.util.List;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * Maps the generic exceptions, and the generated Bean Validation of request bodies, to problem+json. Both kinds of
 * validation failure give the same {@code validation} problem with {@code errors[]}. Ahead of Boot's default
 * handler, which has no {@code code}. Details are static: nothing user-controlled is echoed.
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
class ProblemAdvice {

    @ExceptionHandler(InvalidRequestException.class)
    ProblemDetail invalid(InvalidRequestException ex) {
        return validation(ex.errors());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail invalidBody(MethodArgumentNotValidException ex) {
        var binding = ex.getBindingResult();
        var errors = new ArrayList<Violation>();
        binding.getFieldErrors().forEach(e -> errors.add(new Violation(e.getField(), e.getDefaultMessage())));
        binding.getGlobalErrors().forEach(e -> errors.add(new Violation("body", e.getDefaultMessage())));
        return validation(errors);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ProblemDetail unreadable(HttpMessageNotReadableException ex) {
        return Problems.of(HttpStatus.BAD_REQUEST, "validation", "Invalid request.");
    }

    // a path or query value that is not what the contract allows (e.g. a value outside an enum); the value is not echoed
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ProblemDetail badParameter(MethodArgumentTypeMismatchException ex) {
        return Problems.of(HttpStatus.BAD_REQUEST, "validation", "Invalid request.");
    }

    @ExceptionHandler(NotFoundException.class)
    ProblemDetail notFound(NotFoundException ex) {
        return Problems.of(HttpStatus.NOT_FOUND, "not_found", "Not found.");
    }

    private static ProblemDetail validation(List<Violation> errors) {
        var p = Problems.of(HttpStatus.BAD_REQUEST, "validation", "Invalid request.");
        p.setProperty("errors", errors);
        return p;
    }
}
