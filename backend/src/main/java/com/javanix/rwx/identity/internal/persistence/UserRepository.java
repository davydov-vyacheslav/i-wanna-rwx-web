package com.javanix.rwx.identity.internal.persistence;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** Keyed by the user's own id; no finder can return another user's row without that id. */
public interface UserRepository extends JpaRepository<UserEntity, UUID> {
}
