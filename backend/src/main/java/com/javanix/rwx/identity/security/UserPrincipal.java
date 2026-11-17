package com.javanix.rwx.identity.security;

import java.io.Serializable;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.user.OAuth2User;

/**
 * Principal stored in the session's security context; carries only the id, so no stale profile data. It is an
 * {@code OAuth2User} only so the oauth2Login filter accepts it; there are no attributes (no GitHub data in the session).
 */
public record UserPrincipal(UUID id) implements OAuth2User, Serializable {

    @Override
    public Map<String, Object> getAttributes() {
        return Map.of();
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_USER"));
    }

    @Override
    public String getName() {
        return id.toString();
    }

    @Override
    public String toString() {
        return id.toString();
    }
}
