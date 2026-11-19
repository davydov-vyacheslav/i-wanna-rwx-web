package com.javanix.rwx.identity.internal.web;

import com.javanix.rwx.common.Problems;
import com.javanix.rwx.identity.NotAuthenticatedException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Identity's problems (authentication, CSRF, access) with a stable {@code code}; ahead of Boot's generic
 * handler, which has none. Also serves the security filters (via {@code ProblemSecurityHandlers}). Generic
 * validation problems come from the common module. Details are static: nothing user-controlled is echoed.
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
class IdentityProblemAdvice {

    @ExceptionHandler({NotAuthenticatedException.class, AuthenticationException.class})
    ProblemDetail unauthorized(Exception ex) {
        return Problems.of(HttpStatus.UNAUTHORIZED, "unauthorized", "Authentication is required.");
    }

    @ExceptionHandler(CsrfException.class)
    ProblemDetail csrf(CsrfException ex) {
        return Problems.of(HttpStatus.FORBIDDEN, "csrf", "Missing or invalid X-XSRF-TOKEN header.");
    }

    @ExceptionHandler(AccessDeniedException.class)
    ProblemDetail forbidden(AccessDeniedException ex) {
        return Problems.of(HttpStatus.FORBIDDEN, "forbidden", "Access denied.");
    }
}
