package com.javanix.rwx.identity.security;

import com.javanix.rwx.identity.CurrentUser;
import com.javanix.rwx.identity.CurrentUserProvider;
import com.javanix.rwx.identity.NotAuthenticatedException;
import com.javanix.rwx.identity.internal.persistence.UserEntity;
import com.javanix.rwx.identity.internal.persistence.UserRepository;
import java.util.UUID;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
class SecurityContextCurrentUserProvider implements CurrentUserProvider {

    private final UserRepository users;

    SecurityContextCurrentUserProvider(UserRepository users) {
        this.users = users;
    }

    @Override
    public CurrentUser current() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || !(auth.getPrincipal() instanceof UserPrincipal(UUID id))) {
            throw new NotAuthenticatedException();
        }
        // One PK lookup per call: a missing row means the user was deleted while the session lived on, and disabling
        // an account must end its live sessions, not only block new logins.
        if (users.findById(id).map(UserEntity::isDisabled).orElse(true)) {
            throw new NotAuthenticatedException();
        }
        return new CurrentUser(id);
    }
}
