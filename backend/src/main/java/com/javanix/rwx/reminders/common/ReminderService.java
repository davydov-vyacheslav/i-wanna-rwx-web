package com.javanix.rwx.reminders.common;

import com.javanix.rwx.common.GoneException;
import com.javanix.rwx.common.NotFoundException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * What a user's list of one reminder type does the same way. The subclass (package-private in its feature package)
 * only builds its entity. Writes lock the row, so concurrent writers of one record queue instead of overwriting.
 */
public abstract class ReminderService<E extends ReminderEntity> {

    /** {@code created} is false when the id was already live (re-POST), which the API answers with 200. */
    public record CreateResult<E>(E entity, boolean created) {
    }

    private final ReminderRepository<E, ?> repository;
    private final Clock clock;
    private final TransactionTemplate tx;

    protected ReminderService(ReminderRepository<E, ?> repository, Clock clock, TransactionTemplate tx) {
        this.repository = repository;
        this.clock = clock;
        this.tx = tx;
    }

    protected abstract E newEntity(UUID userId, UUID id, ReminderEntity.Fields fields, Instant now);

    /**
     * A live id answers with the stored row and ignores the body; a tombstone is gone. Not transactional here: a
     * concurrent create of the same id fails on the primary key, and that rolled-back insert is answered by reading
     * the winner's row again (the live row, or gone for a tombstone).
     */
    public CreateResult<E> create(UUID userId, UUID id, ReminderEntity.Fields fields) {
        var existing = repository.findByIdAndUserId(id, userId);
        if (existing.isPresent()) {
            return existing(existing.get());
        }
        try {
            return tx.execute(status -> new CreateResult<>(
                    repository.saveAndFlush(newEntity(userId, id, fields, clock.instant())), true));
        } catch (DataIntegrityViolationException e) {
            // nothing to re-read means the violation was another constraint: not ours to hide
            return existing(repository.findByIdAndUserId(id, userId).orElseThrow(() -> e));
        }
    }

    private CreateResult<E> existing(E row) {
        if (row.isDeleted()) {
            throw new GoneException();
        }
        return new CreateResult<>(row, false);
    }

    /** Tombstones are not readable: 404, like an unknown id. */
    @Transactional(readOnly = true)
    public E get(UUID userId, UUID id) {
        return repository.findByIdAndUserId(id, userId).filter(e -> !e.isDeleted())
                .orElseThrow(NotFoundException::new);
    }

    @Transactional(readOnly = true)
    public List<E> list(UUID userId) {
        return repository.findByUserIdAndDeletedAtIsNullOrderByCreatedAtAscIdAsc(userId);
    }

    /** Merge validity is checked by the entity (400); an equal result writes nothing. */
    @Transactional
    public E patch(UUID userId, UUID id, ReminderEntity.Fields patch) {
        var entity = lockLive(userId, id);
        if (entity.apply(patch, clock.instant())) {
            repository.saveAndFlush(entity);
        }
        return entity;
    }

    /** Lifetime and none are 400 even for a stale date; a stale date is a no-op that returns the current record. */
    @Transactional
    public E renew(UUID userId, UUID id, LocalDate expectedExpiryDate) {
        var entity = lockLive(userId, id);
        if (entity.renew(expectedExpiryDate, clock.instant())) {
            repository.saveAndFlush(entity);
        }
        return entity;
    }

    /** Idempotent: deleting a tombstone succeeds. Unknown or foreign ids are 404. */
    @Transactional
    public void delete(UUID userId, UUID id) {
        var entity = repository.findForUpdateByIdAndUserId(id, userId).orElseThrow(NotFoundException::new);
        if (entity.tombstone(clock.instant())) {
            repository.saveAndFlush(entity);
        }
    }

    /** Inside the caller's transaction: the locked live row (a tombstone is gone). */
    protected final E lockLive(UUID userId, UUID id) {
        var entity = repository.findForUpdateByIdAndUserId(id, userId).orElseThrow(NotFoundException::new);
        if (entity.isDeleted()) {
            throw new GoneException();
        }
        return entity;
    }
}
