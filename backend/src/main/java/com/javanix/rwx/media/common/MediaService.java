package com.javanix.rwx.media.common;

import com.javanix.rwx.common.DuplicateException;
import com.javanix.rwx.common.GoneException;
import com.javanix.rwx.common.InvalidRequestException;
import com.javanix.rwx.common.NotFoundException;
import com.javanix.rwx.datasource.CatalogException;
import com.javanix.rwx.datasource.MediaItem;
import com.javanix.rwx.datasource.MediaRef;
import com.javanix.rwx.datasource.MediaResolver;
import com.javanix.rwx.identity.UserLock;
import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

/**
 * What a user's list of one resource type does the same way: the create flow, get, list and delete. The subclass
 * (package-private in its feature package) supplies the identity and duplicate rules and builds the entity.
 */
public abstract class MediaService<E extends MediaEntity, R extends MediaRef, I extends MediaItem<R>> {

    /** {@code created} is false when the id was already live (re-POST), which the API answers with 200. */
    public record CreateResult<E>(E entity, boolean created) {
    }

    private final MediaRepository<E, ?> repository;
    private final MediaResolver<R, I> drafts;
    private final MediaResolver<R, I> catalog;
    private final UserLock userLock;
    private final Clock clock;
    private final TransactionTemplate tx;

    protected MediaService(MediaRepository<E, ?> repository, MediaResolver<R, I> drafts, MediaResolver<R, I> catalog,
            UserLock userLock, Clock clock, TransactionTemplate tx) {
        this.repository = repository;
        this.drafts = drafts;
        this.catalog = catalog;
        this.userLock = userLock;
        this.clock = clock;
        this.tx = tx;
    }

    /** The live row of this provider identity, looked up from the URL alone. */
    protected abstract Optional<E> findByIdentity(UUID userId, R ref);

    /** The table checks beyond a title and a link, surfaced as a provider error instead of a 500. */
    protected abstract boolean isStorable(I item);

    /**
     * The id of the live row this item clashes with. Runs under the user lock, otherwise two concurrent adds both
     * pass; the lock also means the unique indexes cannot be lost to a racing writer, so there is no unique-violation
     * fallback. The caller already returned a live row of this id, so a clash is always another item.
     */
    protected abstract Optional<UUID> findDuplicate(UUID userId, I item, String externalId);

    protected abstract E newEntity(UUID userId, UUID id, String externalId, I item, Clock clock);

    /**
     * Not transactional here, so a provider call never runs under the lock: the same-id read, the URL recognition,
     * the identity pre-check and the resolve are lock-free and only the insert holds the user lock. A live id answers
     * with the stored row without looking at the URL; a tombstone is gone. A failed resolve stores nothing.
     */
    public CreateResult<E> create(UUID userId, UUID id, String sourceUrl) {
        var existing = repository.findByIdAndUserId(id, userId);
        if (existing.isPresent()) {
            return existing(existing.get());
        }
        var draft = drafts.identify(sourceUrl);
        if (draft.isPresent()) {
            var item = drafts.resolve(userId, draft.get());
            // the draft's identity is its title key, not the resolver's raw text
            return tx.execute(status -> insert(userId, id, item, TitleKey.of(item.title())));
        }
        var ref = catalog.identify(sourceUrl)
                .orElseThrow(() -> InvalidRequestException.unrecognizedSourceUrl());
        // the identity comes from the URL, so a known item costs no provider call (and no key)
        findByIdentity(userId, ref).ifPresent(e -> {
            throw new DuplicateException(e.getId());
        });
        var item = catalog.resolve(userId, ref);
        assertStorable(item);
        return tx.execute(status -> insert(userId, id, item, ref.externalId()));
    }

    private void assertStorable(I item) {
        if (!StringUtils.hasText(item.title()) || !StringUtils.hasText(item.externalLink())
                || item.externalLink().length() > 4096 || !isStorable(item)) {
            throw new CatalogException.ProviderError(item.ref().sourceId());
        }
    }

    private CreateResult<E> insert(UUID userId, UUID id, I item, String externalId) {
        userLock.lock(userId);
        var existing = repository.findByIdAndUserId(id, userId);
        if (existing.isPresent()) {
            return existing(existing.get());
        }
        findDuplicate(userId, item, externalId).ifPresent(existingId -> {
            throw new DuplicateException(existingId);
        });
        return new CreateResult<>(repository.saveAndFlush(newEntity(userId, id, externalId, item, clock)), true);
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

    /** Idempotent: deleting a tombstone succeeds. Unknown or foreign ids are 404. */
    @Transactional
    public void delete(UUID userId, UUID id) {
        userLock.lock(userId);
        var entity = repository.findByIdAndUserId(id, userId).orElseThrow(NotFoundException::new);
        if (entity.tombstone(clock.instant())) {
            repository.saveAndFlush(entity);
        }
    }

    /** For a PATCH, inside its transaction: the user lock, then the live row (a tombstone is gone). */
    protected final E lockLive(UUID userId, UUID id) {
        userLock.lock(userId);
        var entity = repository.findByIdAndUserId(id, userId).orElseThrow(NotFoundException::new);
        if (entity.isDeleted()) {
            throw new GoneException();
        }
        return entity;
    }

    protected final void save(E entity) {
        repository.saveAndFlush(entity);
    }

    protected final Clock clock() {
        return clock;
    }
}
