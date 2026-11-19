package com.javanix.rwx.common;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

/** The one place a problem+json body is assembled: RFC 9457 with a stable {@code code} and a static detail. */
public final class Problems {

    private Problems() {}

    public static ProblemDetail of(HttpStatus status, String code, String detail) {
        var problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(status.getReasonPhrase());
        problem.setProperty("code", code);
        return problem;
    }

    /**
     * Names the data source a problem is about in the {@code source} member (the wire id, e.g. {@code tmdb}); the
     * client reads this member and never parses {@code detail}. A null id leaves the problem untouched, so the codes
     * that name no source (our own rate limit, our own full outbound guard) pass through unchanged.
     */
    public static ProblemDetail withSource(ProblemDetail problem, String sourceId) {
        if (sourceId != null) {
            problem.setProperty("source", sourceId);
        }
        return problem;
    }
}
