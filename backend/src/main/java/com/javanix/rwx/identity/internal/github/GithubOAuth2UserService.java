package com.javanix.rwx.identity.internal.github;

import com.javanix.rwx.api.model.UiLocale;
import com.javanix.rwx.identity.internal.AccountService;
import com.javanix.rwx.identity.internal.ExternalProfile;
import com.javanix.rwx.identity.internal.exception.AccountDisabledException;
import com.javanix.rwx.identity.security.UserPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.Locale;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.i18n.AcceptHeaderLocaleResolver;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Reads the GitHub profile (attribute names {@code id}/{@code login}/{@code name}/{@code avatar_url} are GitHub's, so
 * this stays in the github package), logs the user in or creates it, and hands back the session principal (id only).
 */
@Component
class GithubOAuth2UserService implements OAuth2UserService<OAuth2UserRequest, OAuth2User> {

    private static final AcceptHeaderLocaleResolver LOCALES = new AcceptHeaderLocaleResolver();

    static {
        LOCALES.setSupportedLocales(Arrays.stream(UiLocale.values()).map(l -> Locale.of(l.getValue())).toList());
        // without it a request without the header gets the server's default locale
        LOCALES.setDefaultLocale(Locale.of(UiLocale.EN.getValue()));
    }

    private final DefaultOAuth2UserService github = new DefaultOAuth2UserService();
    private final AccountService accounts;

    GithubOAuth2UserService(AccountService accounts) {
        this.accounts = accounts;
    }

    @Override
    public OAuth2User loadUser(OAuth2UserRequest request) {
        var attributes = github.loadUser(request).getAttributes();
        if (!(attributes.get("id") instanceof Number id) || !(attributes.get("login") instanceof String login)) {
            throw new OAuth2AuthenticationException(new OAuth2Error("invalid_user_info_response"));
        }
        var profile = new ExternalProfile(request.getClientRegistration().getRegistrationId(), Long.toString(id.longValue()), login,
                text(attributes.get("name")), text(attributes.get("avatar_url")));
        try {
            return new UserPrincipal(accounts.loginOrCreate(profile, signUpLocale()));
        } catch (AccountDisabledException e) {
            // surfaces as the generic login failure; no session is created
            throw new OAuth2AuthenticationException(new OAuth2Error("account_disabled"), e);
        }
    }

    /** The OAuth callback is the browser's own redirect, so its Accept-Language is the user's device language. */
    private static String signUpLocale() {
        return RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes
                ? signUpLocale(attributes.getRequest()) : UiLocale.EN.getValue();
    }

    /** The contract locale (en, ru, uk) best matching the header; {@code en} when nothing supported matches. */
    static String signUpLocale(HttpServletRequest request) {
        return LOCALES.resolveLocale(request).getLanguage();
    }

    private static String text(Object value) {
        return value instanceof String s ? s : null;
    }
}
