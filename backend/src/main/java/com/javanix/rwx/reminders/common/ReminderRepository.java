package com.javanix.rwx.reminders.common;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.repository.NoRepositoryBean;
import org.springframework.data.repository.Repository;

/**
 * Extends the marker interface, not JpaRepository, so no unscoped findById/findAll/deleteById is exposed. Every
 * lookup carries the user id; {@code saveAndFlush} is scoped by the entity's own {@code userId}.
 */
@NoRepositoryBean
public interface ReminderRepository<E extends ReminderEntity, K> extends Repository<E, K> {

    Optional<E> findByIdAndUserId(UUID id, UUID userId);

    /** For writes: the row lock serializes concurrent writers of one record (two renewals apply once). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<E> findForUpdateByIdAndUserId(UUID id, UUID userId);

    List<E> findByUserIdAndDeletedAtIsNullOrderByCreatedAtAscIdAsc(UUID userId);

    E saveAndFlush(E entity);
}
