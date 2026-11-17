package com.javanix.rwx.identity.internal.github;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

/** Restores the 30-day TTL (the pre-auth session had 10 minutes) and always lands on {@code /}. */
@Component
class LoginSuccessHandler implements AuthenticationSuccessHandler {

    private final SimpleUrlAuthenticationSuccessHandler redirect = new SimpleUrlAuthenticationSuccessHandler("/");
    private final Duration sessionTtl;

    LoginSuccessHandler(@Value("${spring.session.timeout:30d}") Duration sessionTtl) {
        this.sessionTtl = sessionTtl;
        redirect.setAlwaysUseDefaultTargetUrl(true);
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
            Authentication authentication) throws IOException, ServletException {
        // the session id was already rotated by the filter's session strategy
        request.getSession().setMaxInactiveInterval((int) sessionTtl.toSeconds());
        redirect.onAuthenticationSuccess(request, response, authentication);
    }
}
