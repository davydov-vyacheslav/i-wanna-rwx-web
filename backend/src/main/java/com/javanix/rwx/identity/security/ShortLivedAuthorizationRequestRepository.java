package com.javanix.rwx.identity.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import org.springframework.security.oauth2.client.web.AuthorizationRequestRepository;
import org.springframework.security.oauth2.client.web.HttpSessionOAuth2AuthorizationRequestRepository;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;

/**
 * Spring's session-backed state repository plus a short TTL for a session that only exists for the OAuth round
 * trip, so anonymous visitors leave no 30-day rows behind (the login success handler restores the full TTL).
 */
class ShortLivedAuthorizationRequestRepository implements AuthorizationRequestRepository<OAuth2AuthorizationRequest> {

    private static final Duration PRE_AUTH_TTL = Duration.ofMinutes(10);

    private final HttpSessionOAuth2AuthorizationRequestRepository delegate =
            new HttpSessionOAuth2AuthorizationRequestRepository();

    @Override
    public OAuth2AuthorizationRequest loadAuthorizationRequest(HttpServletRequest request) {
        return delegate.loadAuthorizationRequest(request);
    }

    @Override
    public void saveAuthorizationRequest(OAuth2AuthorizationRequest authorizationRequest,
            HttpServletRequest request, HttpServletResponse response) {
        delegate.saveAuthorizationRequest(authorizationRequest, request, response);
        if (authorizationRequest == null) {
            return;
        }
        var session = request.getSession();
        if (session.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY) == null) {
            session.setMaxInactiveInterval((int) PRE_AUTH_TTL.toSeconds());
        }
    }

    @Override
    public OAuth2AuthorizationRequest removeAuthorizationRequest(HttpServletRequest request,
            HttpServletResponse response) {
        // single use
        return delegate.removeAuthorizationRequest(request, response);
    }
}
