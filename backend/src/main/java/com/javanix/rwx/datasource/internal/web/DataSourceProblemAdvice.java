package com.javanix.rwx.datasource.internal.web;

import com.javanix.rwx.common.Problems;
import com.javanix.rwx.datasource.CatalogException.ProviderError;
import com.javanix.rwx.datasource.CatalogException.ProviderRateLimited;
import com.javanix.rwx.datasource.CatalogException.ProviderTimeout;
import com.javanix.rwx.datasource.CatalogException.RateLimited;
import com.javanix.rwx.datasource.CatalogException.SourceKeyInvalid;
import com.javanix.rwx.datasource.CatalogException.SourceKeyMissing;
import com.javanix.rwx.datasource.CatalogException.SourceNotFound;
import com.javanix.rwx.datasource.internal.provider.SourceKeyRejectedException;
import java.time.Duration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.resilience.InvocationRejectedException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.RestClientException;

/**
 * The design section 6 table for data source failures, on every endpoint that lets them propagate (create in media,
 * the search and data-source endpoints). Source-agnostic: the codes name no provider, the {@code source} member does
 * (absent for our own limit and our own full outbound guard). {@code SourceNotFound} is 422 here (a create from a
 * reference); the details controllers answer 404 {@code not_found} themselves. Details are fixed neutral text: no
 * provider body, URL, query, key or source name.
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
class DataSourceProblemAdvice {

    @ExceptionHandler(SourceNotFound.class)
    ProblemDetail sourceNotFound(SourceNotFound ex) {
        return Problems.withSource(Problems.of(HttpStatus.UNPROCESSABLE_CONTENT, "source_not_found",
                "The item no longer exists at the source."), ex.source());
    }

    @ExceptionHandler(SourceKeyRejectedException.class)
    ProblemDetail keyRejected(SourceKeyRejectedException ex) {
        return Problems.withSource(Problems.of(HttpStatus.UNPROCESSABLE_CONTENT, "source_key_rejected",
                "The source rejected the API key."), ex.source());
    }

    @ExceptionHandler(SourceKeyMissing.class)
    ProblemDetail keyMissing(SourceKeyMissing ex) {
        return Problems.withSource(Problems.of(HttpStatus.CONFLICT, "source_key_missing",
                "This source needs an API key."), ex.source());
    }

    @ExceptionHandler(SourceKeyInvalid.class)
    ProblemDetail keyInvalid(SourceKeyInvalid ex) {
        return Problems.withSource(Problems.of(HttpStatus.CONFLICT, "source_key_invalid",
                "The source rejected the saved API key."), ex.source());
    }

    @ExceptionHandler(ProviderTimeout.class)
    ProblemDetail timeout(ProviderTimeout ex) {
        return Problems.withSource(Problems.of(HttpStatus.GATEWAY_TIMEOUT, "provider_timeout",
                "The source did not answer in time."), ex.source());
    }

    @ExceptionHandler(ProviderError.class)
    ProblemDetail providerError(ProviderError ex) {
        return Problems.withSource(Problems.of(HttpStatus.BAD_GATEWAY, "provider_error",
                "The source returned an error."), ex.source());
    }

    /**
     * Anything the client throws that is not a {@code CatalogException}, e.g. an IOException while the body is read
     * (after the interceptor): no source is known and the exception's message carries the URI, so the text is fixed.
     */
    @ExceptionHandler(RestClientException.class)
    ProblemDetail clientFailure(RestClientException ex) {
        return Problems.of(HttpStatus.BAD_GATEWAY, "provider_error", "The source returned an error.");
    }

    /** The client's {@code @ConcurrencyLimit} is full: a transient overload on our side (design section 5), no source. */
    @ExceptionHandler(InvocationRejectedException.class)
    ProblemDetail busy(InvocationRejectedException ex) {
        return Problems.of(HttpStatus.SERVICE_UNAVAILABLE, "provider_error", "The source is busy, try again shortly.");
    }

    @ExceptionHandler(ProviderRateLimited.class)
    ResponseEntity<ProblemDetail> providerRateLimited(ProviderRateLimited ex) {
        return withRetryAfter(Problems.withSource(Problems.of(HttpStatus.SERVICE_UNAVAILABLE,
                "provider_rate_limited", "The source is rate limiting requests."), ex.source()), ex.retryAfter());
    }

    @ExceptionHandler(RateLimited.class)
    ResponseEntity<ProblemDetail> rateLimited(RateLimited ex) {
        return withRetryAfter(Problems.of(HttpStatus.TOO_MANY_REQUESTS, "rate_limited", "Too many requests."),
                ex.retryAfter());
    }

    private static ResponseEntity<ProblemDetail> withRetryAfter(ProblemDetail problem, Duration retryAfter) {
        var seconds = Math.max(1, (retryAfter.toMillis() + 999) / 1000);
        return ResponseEntity.status(problem.getStatus()).header(HttpHeaders.RETRY_AFTER, Long.toString(seconds))
                .body(problem);
    }
}
