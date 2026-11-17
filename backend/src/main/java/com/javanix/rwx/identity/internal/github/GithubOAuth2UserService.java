package com.javanix.rwx.identity.internal.github;

import com.javanix.rwx.identity.internal.AccountService;
import com.javanix.rwx.identity.internal.ExternalProfile;
import com.javanix.rwx.identity.internal.exception.AccountDisabledException;
import com.javanix.rwx.identity.security.UserPrincipal;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Component;

/**
 * Reads the GitHub profile (attribute names {@code id}/{@code login}/{@code name}/{@code avatar_url} are GitHub's, so
 * this stays in the github package), logs the user in or creates it, and hands back the session principal (id only).
 */
@Component
class GithubOAuth2UserService implements OAuth2UserService<OAuth2UserRequest, OAuth2User> {

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
            return new UserPrincipal(accounts.loginOrCreate(profile));
        } catch (AccountDisabledException e) {
            // surfaces as the generic login failure; no session is created
            throw new OAuth2AuthenticationException(new OAuth2Error("account_disabled"), e);
        }
    }

    private static String text(Object value) {
        return value instanceof String s ? s : null;
    }
}
