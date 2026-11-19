package com.javanix.rwx.media.common;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.repository.NoRepositoryBean;
import org.springframework.data.repository.Repository;

/**
 * Extends the marker interface, not JpaRepository, so no unscoped findById/findAll/deleteById is exposed. Every
 * lookup carries the user id; {@code saveAndFlush} is scoped by the entity's own {@code userId}.
 */
@NoRepositoryBean
public interface MediaRepository<E extends MediaEntity, K> extends Repository<E, K> {

    Optional<E> findByIdAndUserId(UUID id, UUID userId);

    List<E> findByUserIdAndDeletedAtIsNullOrderByCreatedAtAscIdAsc(UUID userId);

    E saveAndFlush(E entity);
}
