package com.javanix.rwx.settings.internal.web;

import com.javanix.rwx.common.Problems;
import com.javanix.rwx.common.Violation;
import com.javanix.rwx.settings.internal.InvalidSettingsException;
import java.util.List;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Settings problems with a stable {@code code}; details are static, nothing user-controlled is echoed. */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
class SettingsProblemAdvice {

    @ExceptionHandler(InvalidSettingsException.class)
    ProblemDetail invalid(InvalidSettingsException ex) {
        var p = Problems.of(HttpStatus.BAD_REQUEST, ex.code(), ex.getMessage());
        p.setProperty("errors", List.of(new Violation(ex.field(), ex.getMessage())));
        return p;
    }
}
