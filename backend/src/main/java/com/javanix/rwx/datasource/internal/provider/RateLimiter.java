package com.javanix.rwx.datasource.internal.provider;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.javanix.rwx.datasource.CatalogException.RateLimited;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.UUID;

/**
 * Per-user, per-kind limits kept in memory (single replica assumed, see design section 5). Each kind has a sustained
 * limit per minute and a burst limit over a short window, both sliding: a user may spend {@code burst} calls at once
 * but not more than {@code perMinute} in any minute. A denied call is not recorded, so retrying after
 * {@code Retry-After} succeeds.
 */
public class RateLimiter {

    public enum Kind {
        SEARCH(30, 10), DETAILS(60, 20), KEY_SAVE(5, 5);

        private final int perMinute;
        private final int burst;

        Kind(int perMinute, int burst) {
            this.perMinute = perMinute;
            this.burst = burst;
        }
    }

    private static final Duration WINDOW = Duration.ofMinutes(1);
    private static final Duration BURST_WINDOW = Duration.ofSeconds(10);

    private record Key(UUID userId, Kind kind) {
    }

    // an entry idle for a whole window holds only expired calls, so dropping it changes nothing; this replaces a manual sweep
    private final Cache<Key, Deque<Long>> calls = Caffeine.newBuilder().expireAfterAccess(WINDOW).build();
    private final Clock clock;

    public RateLimiter(Clock clock) {
        this.clock = clock;
    }

    /** @throws RateLimited with the time until the next call would pass */
    public void acquire(UUID userId, Kind kind) {
        var now = clock.millis();
        var history = calls.get(new Key(userId, kind), k -> new ArrayDeque<>());
        synchronized (history) {
            while (!history.isEmpty() && now - history.peekFirst() >= WINDOW.toMillis()) {
                history.pollFirst();
            }
            var wait = 0L;
            if (history.size() >= kind.perMinute) {
                wait = history.peekFirst() + WINDOW.toMillis() - now;
            }
            if (history.size() >= kind.burst) {
                // the burst-th most recent call leaves the burst window at this point
                var recent = history.toArray(new Long[0]);
                var anchor = recent[recent.length - kind.burst];
                wait = Math.max(wait, anchor + BURST_WINDOW.toMillis() - now);
            }
            if (wait > 0) {
                throw new RateLimited(Duration.ofSeconds(Math.max(1, (wait + 999) / 1000)));
            }
            history.addLast(now);
        }
    }
}
