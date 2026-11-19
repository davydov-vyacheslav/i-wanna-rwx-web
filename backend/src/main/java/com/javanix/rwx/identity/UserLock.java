package com.javanix.rwx.identity;

import com.javanix.rwx.identity.internal.persistence.UserRepository;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Serializes one user's writes for checks no index can express: a row lock on the user held until the transaction ends. */
@Component
public class UserLock {

    private final UserRepository users;

    UserLock(UserRepository users) {
        this.users = users;
    }

    /** @throws java.util.NoSuchElementException for an unknown user */
    @Transactional(propagation = Propagation.MANDATORY)
    public void lock(UUID userId) {
        users.findForUpdateById(userId).orElseThrow();
    }
}
