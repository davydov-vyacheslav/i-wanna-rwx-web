package com.javanix.rwx.identity.internal.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CredentialRepository extends JpaRepository<CredentialEntity, UUID> {

    List<CredentialEntity> findByUserId(UUID userId);

    // login lookup before any user is known; the credential identifies the user
    Optional<CredentialEntity> findByTypeAndExternalId(String type, String externalId);
}
