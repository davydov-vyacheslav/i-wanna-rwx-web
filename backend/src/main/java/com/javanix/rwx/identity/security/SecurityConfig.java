package com.javanix.rwx.identity.security;

import com.javanix.rwx.api.AuthApi;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.Customizer;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.security.web.DefaultRedirectStrategy;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.savedrequest.NullRequestCache;

@Configuration(proxyBeanMethods = false)
class SecurityConfig {

    private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

    // Image hosts: cover redirects go covers.openlibrary.org -> archive.org -> ia*.us.archive.org, and CSP checks every
    // hop (a wildcard host does not match the bare domain). A new image host is added here and to COVER_HOSTS in the SW.
    private static final String CONTENT_SECURITY_POLICY = "img-src 'self' data: https://covers.openlibrary.org "
            + "https://archive.org https://*.archive.org https://image.tmdb.org https://avatars.githubusercontent.com; "
            + "object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

    // Explicit rather than server.servlet.session.cookie.*: Boot applies those only through an embedded web
    // server, so the SESSION cookie in the MockMvc tests lost HttpOnly (tried, SecurityFoundationTests failed).
    // Secure is derived from the request scheme, so it is set behind Traefik (X-Forwarded-Proto) and off on
    // plain http://localhost.
    @Bean
    CookieSerializer cookieSerializer() {
        var serializer = new DefaultCookieSerializer();
        serializer.setCookieName("SESSION");
        serializer.setUseHttpOnlyCookie(true);
        serializer.setSameSite("Lax");
        serializer.setCookiePath("/");
        serializer.setCookieMaxAge((int) Duration.ofDays(30).toSeconds());
        return serializer;
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, ProblemSecurityHandlers problems,
            OAuth2UserService<OAuth2UserRequest, OAuth2User> userService, AuthenticationSuccessHandler loginSuccess) throws Exception {
        // The SPA sends the raw cookie value, so no BREACH masking; a null attribute name makes the
        // token eager, otherwise the XSRF-TOKEN cookie would not be issued on a plain GET.
        var csrfHandler = new CsrfTokenRequestAttributeHandler();
        csrfHandler.setCsrfRequestAttributeName(null);

        var csrfRepository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrfRepository.setCookieCustomizer(c -> c.sameSite("Lax"));

        http
                .csrf(csrf -> csrf
                        .csrfTokenRepository(csrfRepository)
                        .csrfTokenRequestHandler(csrfHandler)
                        // Logout must be callable to reach a clean state; with no session there is nothing a
                        // forged request could end, so CSRF applies only once a session exists.
                        .ignoringRequestMatchers(request -> "POST".equals(request.getMethod())
                                && "/api/v1/auth/logout".equals(request.getRequestURI())
                                && hasNoClientSession(request)))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/oauth2/authorization/**", "/api/v1/auth/github/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/logout").permitAll()
                        .requestMatchers("/actuator/health/**").permitAll()
                        .requestMatchers("/api/**", "/actuator/**").authenticated()
                        // SPA shell and assets (the SPA decides what to render when /me is 401)
                        .requestMatchers(HttpMethod.GET, "/**").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(eh -> eh
                        .authenticationEntryPoint(problems)
                        .accessDeniedHandler(problems))
                .oauth2Login(login -> login
                        // a custom login page also stops Spring from serving its own page at /login (the SPA's route)
                        .loginPage("/login")
                        .authorizationEndpoint(ae -> ae
                                .authorizationRequestRepository(new ShortLivedAuthorizationRequestRepository()))
                        .redirectionEndpoint(re -> re.baseUri(AuthApi.PATH_GITHUB_LOGIN_CALLBACK))
                        .userInfoEndpoint(ui -> ui.userService(userService))
                        // the access token is discarded after login: nothing may land in the session store
                        .authorizedClientRepository(new DiscardingAuthorizedClientRepository())
                        .successHandler(loginSuccess)
                        .failureHandler(loginFailure()))
                .headers(h -> h.contentSecurityPolicy(csp -> csp.policyDirectives(CONTENT_SECURITY_POLICY)))
                .requestCache(rc -> rc.requestCache(new NullRequestCache()))
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(l -> l
                        .logoutUrl("/api/v1/auth/logout")
                        .invalidateHttpSession(true)
                        .deleteCookies("SESSION")
                        .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)))
                .cors(Customizer.withDefaults());
        return http.build();
    }

    // One generic failure, no reasons. Spring's SimpleUrlAuthenticationFailureHandler is not used: it stores the
    // exception in an existing session, and the JDBC session store cannot serialize it (tried, the pre-auth session
    // write failed). Never touches the session otherwise: a forged callback (a top-level GET) must not end a
    // signed-in user's session, and a pre-auth session simply expires after its 10 minutes.
    private static AuthenticationFailureHandler loginFailure() {
        var redirect = new DefaultRedirectStrategy();
        return (request, response, ex) -> {
            // exception class and OAuth error code only: messages and provider bodies stay out of the log
            var code = ex instanceof OAuth2AuthenticationException oauth ? oauth.getError().getErrorCode() : "-";
            log.warn("Login failed: {} (error code {})", ex.getClass().getSimpleName(), code);
            response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
            redirect.sendRedirect(request, response, "/login?error");
        };
    }

    private static final class DiscardingAuthorizedClientRepository implements OAuth2AuthorizedClientRepository {

        @Override
        @SuppressWarnings("unchecked")
        public <T extends OAuth2AuthorizedClient> T loadAuthorizedClient(String registrationId,
                Authentication principal, HttpServletRequest request) {
            return null;
        }

        @Override
        public void saveAuthorizedClient(OAuth2AuthorizedClient client, Authentication principal,
                HttpServletRequest request, HttpServletResponse response) {
        }

        @Override
        public void removeAuthorizedClient(String registrationId, Authentication principal,
                HttpServletRequest request, HttpServletResponse response) {
        }
    }

    // A session created earlier in this same request (by some filter) is not one the client holds.
    private static boolean hasNoClientSession(HttpServletRequest request) {
        var session = request.getSession(false);
        return session == null || session.isNew();
    }
}
