package com.javanix.rwx.datasource.internal.provider.persistence;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** The id starts with the user id, so every access is scoped by it. */
public interface UserSourceKeyRepository extends JpaRepository<UserSourceKeyEntity, UserSourceKeyEntity.Id> {

    List<UserSourceKeyEntity> findByIdUserId(UUID userId);
}
