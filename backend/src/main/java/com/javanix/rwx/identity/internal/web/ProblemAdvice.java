package com.javanix.rwx.identity.internal.web;

import com.javanix.rwx.identity.NotAuthenticatedException;
import com.javanix.rwx.identity.internal.exception.InvalidSettingsException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Problems with a stable {@code code}; ahead of Boot's generic handler, which has none. Also serves the security
 * filters (via {@code ProblemSecurityHandlers}). Details are static: nothing user-controlled is echoed.
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
class ProblemAdvice {

    @ExceptionHandler(InvalidSettingsException.class)
    ProblemDetail invalid(InvalidSettingsException ex) {
        return problem(HttpStatus.BAD_REQUEST, ex.code(), ex.getMessage());
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class})
    ProblemDetail malformed(Exception ex) {
        return problem(HttpStatus.BAD_REQUEST, "validation", "Invalid request body.");
    }

    @ExceptionHandler({NotAuthenticatedException.class, AuthenticationException.class})
    ProblemDetail unauthorized(Exception ex) {
        return problem(HttpStatus.UNAUTHORIZED, "unauthorized", "Authentication is required.");
    }

    @ExceptionHandler(CsrfException.class)
    ProblemDetail csrf(CsrfException ex) {
        return problem(HttpStatus.FORBIDDEN, "csrf", "Missing or invalid X-XSRF-TOKEN header.");
    }

    @ExceptionHandler(AccessDeniedException.class)
    ProblemDetail forbidden(AccessDeniedException ex) {
        return problem(HttpStatus.FORBIDDEN, "forbidden", "Access denied.");
    }

    private static ProblemDetail problem(HttpStatus status, String code, String detail) {
        var p = ProblemDetail.forStatusAndDetail(status, detail);
        p.setTitle(status.getReasonPhrase());
        p.setProperty("code", code);
        return p;
    }
}
