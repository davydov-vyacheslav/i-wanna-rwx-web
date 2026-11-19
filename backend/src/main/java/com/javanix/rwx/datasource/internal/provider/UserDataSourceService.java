package com.javanix.rwx.datasource.internal.provider;

import com.javanix.rwx.api.model.DataSourceId;
import com.javanix.rwx.api.model.DefaultDataSource;
import com.javanix.rwx.api.model.ResourceType;
import com.javanix.rwx.common.NotFoundException;
import com.javanix.rwx.datasource.internal.provider.persistence.UserDefaultSourceEntity;
import com.javanix.rwx.datasource.internal.provider.persistence.UserDefaultSourceRepository;
import com.javanix.rwx.datasource.internal.provider.persistence.UserSourceKeyEntity;
import com.javanix.rwx.datasource.internal.provider.persistence.UserSourceKeyRepository;
import com.javanix.rwx.identity.AccountExportContributor;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

/**
 * A user's choices about data sources: the default per resource type ({@code user_default_sources}) and the API key
 * per source ({@code user_source_keys}), design 16.2. Every call takes the user id and every query is scoped by it.
 * The derived state (default, effective, available) is computed here from the registered sources and the user's rows.
 * Keys are stored as is (owner decision, docs/TODO.md: no encryption yet), are write-only, and appear in no return
 * value, log line or exception message.
 */
@Service
public class UserDataSourceService implements SourceKeys, AccountExportContributor {

    /** One source as one user sees it: never the key. */
    public record SourceState(SourceInfo source, boolean isDefault, boolean isEffective, boolean available,
            boolean tokenSaved) {
    }

    private final UserDefaultSourceRepository defaults;
    private final UserSourceKeyRepository keys;
    private final SourceDirectory directory;
    private final RateLimiter limiter;

    public UserDataSourceService(UserDefaultSourceRepository defaults, UserSourceKeyRepository keys,
            SourceDirectory directory, RateLimiter limiter) {
        this.defaults = defaults;
        this.keys = keys;
        this.directory = directory;
        this.limiter = limiter;
    }

    /** The lists per resource type, each in registry order with exactly one default and one effective source. */
    public Map<ResourceType, List<SourceState>> list(UUID userId) {
        var chosen = defaults.findByIdUserId(userId).stream()
                .collect(Collectors.toMap(UserDefaultSourceEntity::getResourceType, UserDefaultSourceEntity::getSource));
        var saved = keys.findByIdUserId(userId).stream().map(UserSourceKeyEntity::getSource).collect(Collectors.toSet());
        var result = new EnumMap<ResourceType, List<SourceState>>(ResourceType.class);
        for (var type : ResourceType.values()) {
            result.put(type, derive(directory.of(type), directory.defaultOf(type), chosen.get(type.getValue()), saved));
        }
        return result;
    }

    /** Stores the configured default of every type, at sign-up, in the sign-up transaction. */
    void createDefaults(UUID userId) {
        for (var type : ResourceType.values()) {
            var source = directory.defaultOf(type);
            if (source != null) {
                defaults.save(new UserDefaultSourceEntity(userId, type.getValue(), source.id()));
            }
        }
    }

    /**
     * Makes the source the default of its type. Idempotent; allowed for an unavailable source. The row of (user, type)
     * exists from sign-up, so this is an update; the last of two parallel changes wins.
     *
     * @throws NotFoundException the pair is not registered
     */
    public Map<ResourceType, List<SourceState>> setDefault(UUID userId, ResourceType type, String source) {
        var info = registered(type, source);
        defaults.save(new UserDefaultSourceEntity(userId, type.getValue(), info.id()));
        return list(userId);
    }

    /**
     * Per-user limit, the source's format check and provider check, then upsert. Nothing is stored on any failure and
     * an older key stays. Parallel writes of one user's key for one source (two first saves both insert; a save
     * whose row a delete removed in between updates nothing) make the database refuse the loser. That is not an
     * error: the outcome is the same as if the loser had run first, so it is ignored, never retried.
     *
     * @throws NotFoundException                                    the pair is not registered or needs no key
     * @throws com.javanix.rwx.datasource.CatalogException.RateLimited our own limit (429)
     * @throws com.javanix.rwx.common.InvalidRequestException       the key breaks the source's format (400)
     * @throws SourceKeyRejectedException                           the provider refused the key (422)
     */
    public Map<ResourceType, List<SourceState>> saveKey(UUID userId, ResourceType type, String source, String rawKey) {
        var info = keyed(type, source);
        var key = rawKey == null ? "" : rawKey.strip();
        limiter.acquire(userId, RateLimiter.Kind.KEY_SAVE);
        info.validateKey(key);
        try {
            keys.save(new UserSourceKeyEntity(userId, info.id(), key));
        } catch (DataIntegrityViolationException | ConcurrencyFailureException e) {
            // lost a race with a parallel save or delete of the same key, see above
        }
        return list(userId);
    }

    /**
     * Idempotent (a parallel delete of the same key that wins is the same outcome). A default row stays (the choice
     * survives, the source becomes unavailable).
     *
     * @throws NotFoundException the pair is not registered or needs no key
     */
    public Map<ResourceType, List<SourceState>> deleteKey(UUID userId, ResourceType type, String source) {
        var id = new UserSourceKeyEntity.Id(userId, keyed(type, source).id());
        try {
            keys.deleteById(id);
        } catch (ConcurrencyFailureException e) {
            // a parallel delete removed the row between our read and our delete
        }
        return list(userId);
    }

    @Override
    public Optional<String> keyOf(UUID userId, SourceInfo source) {
        return keys.findById(new UserSourceKeyEntity.Id(userId, source.id())).map(UserSourceKeyEntity::getApiKey);
    }

    /** The chosen defaults only, never a key (the account export): one per resource type. */
    @Override
    public List<DefaultDataSource> dataSources(UUID userId) {
        return defaults.findByIdUserId(userId).stream()
                .sorted(Comparator.comparing(UserDefaultSourceEntity::getResourceType))
                .map(r -> new DefaultDataSource(ResourceType.fromValue(r.getResourceType()),
                        DataSourceId.fromValue(r.getSource())))
                .toList();
    }

    /**
     * The derived state of one list (design 16.2). {@code default} is the stored choice, else the configured default
     * (no row, or its source is no longer registered); {@code effective} is the default when available, else the first
     * available, else the default again. Never writes anything.
     *
     * @param chosen the stored default's source id, null when none
     * @param saved  the sources the user saved a key for
     */
    static List<SourceState> derive(List<SourceInfo> sources, SourceInfo configuredDefault, String chosen,
            Set<String> saved) {
        if (sources.isEmpty()) {
            return List.of();
        }
        var theDefault = sources.stream().filter(s -> s.id().equals(chosen)).findFirst().orElse(configuredDefault);
        var effective = available(theDefault, saved) ? theDefault
                : sources.stream().filter(s -> available(s, saved)).findFirst().orElse(theDefault);
        return sources.stream().map(s -> new SourceState(s, s.id().equals(theDefault.id()), s.id().equals(effective.id()),
                available(s, saved),
                s.requiresKey() && saved.contains(s.id()))).toList();
    }

    private static boolean available(SourceInfo source, Set<String> saved) {
        return !source.requiresKey() || saved.contains(source.id());
    }

    private SourceInfo registered(ResourceType type, String source) {
        return directory.find(type, source).orElseThrow(NotFoundException::new);
    }

    private SourceInfo keyed(ResourceType type, String source) {
        var info = registered(type, source);
        if (!info.requiresKey()) {
            throw new NotFoundException();
        }
        return info;
    }
}
