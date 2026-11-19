package com.javanix.rwx.datasource.internal.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.javanix.rwx.datasource.CatalogException.RateLimited;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RateLimiterTests {

    static class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-01-01T00:00:00Z");

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    private final MutableClock clock = new MutableClock();
    private final RateLimiter limiter = new RateLimiter(clock);
    private final UUID user = UUID.randomUUID();

    @Test
    void the31stSearchInAMinuteIsRateLimitedWithRetryAfter() {
        // spread over the minute so the burst limit is not what trips
        for (var i = 0; i < 30; i++) {
            limiter.acquire(user, RateLimiter.Kind.SEARCH);
            clock.advance(Duration.ofSeconds(2));
        }
        // 60 s after the first call: its slot is free again, so step back to 59 s
        clock.advance(Duration.ofSeconds(-1));

        assertThatThrownBy(() -> limiter.acquire(user, RateLimiter.Kind.SEARCH))
                .isInstanceOfSatisfying(RateLimited.class, e -> assertThat(e.retryAfter()).isEqualTo(Duration.ofSeconds(1)));

        clock.advance(Duration.ofSeconds(1));
        limiter.acquire(user, RateLimiter.Kind.SEARCH);
    }

    @Test
    void burstIsTenThenWaitsForTheBurstWindow() {
        for (var i = 0; i < 10; i++) {
            limiter.acquire(user, RateLimiter.Kind.SEARCH);
        }

        assertThatThrownBy(() -> limiter.acquire(user, RateLimiter.Kind.SEARCH))
                .isInstanceOfSatisfying(RateLimited.class, e -> assertThat(e.retryAfter()).isEqualTo(Duration.ofSeconds(10)));

        clock.advance(Duration.ofSeconds(10));
        limiter.acquire(user, RateLimiter.Kind.SEARCH);
    }

    @Test
    void aDeniedCallIsNotRecorded() {
        for (var i = 0; i < 10; i++) {
            limiter.acquire(user, RateLimiter.Kind.SEARCH);
        }
        for (var i = 0; i < 5; i++) {
            assertThatThrownBy(() -> limiter.acquire(user, RateLimiter.Kind.SEARCH)).isInstanceOf(RateLimited.class);
        }
        clock.advance(Duration.ofSeconds(10));

        // all 10 left the burst window and only 10 were ever recorded
        for (var i = 0; i < 10; i++) {
            limiter.acquire(user, RateLimiter.Kind.SEARCH);
        }
    }

    @Test
    void usersAndKindsAreIndependent() {
        var other = UUID.randomUUID();
        for (var i = 0; i < 10; i++) {
            limiter.acquire(user, RateLimiter.Kind.SEARCH);
        }

        limiter.acquire(other, RateLimiter.Kind.SEARCH);
        limiter.acquire(user, RateLimiter.Kind.DETAILS);
        assertThatThrownBy(() -> limiter.acquire(user, RateLimiter.Kind.SEARCH)).isInstanceOf(RateLimited.class);
    }

    @Test
    void keySaveAllowsFivePerMinute() {
        for (var i = 0; i < 5; i++) {
            limiter.acquire(user, RateLimiter.Kind.KEY_SAVE);
        }

        assertThatThrownBy(() -> limiter.acquire(user, RateLimiter.Kind.KEY_SAVE))
                .isInstanceOfSatisfying(RateLimited.class, e -> assertThat(e.retryAfter()).isEqualTo(Duration.ofSeconds(60)));
    }

    @Test
    void detailsAllowsTwentyBurstAndSixtyPerMinute() {
        for (var i = 0; i < 20; i++) {
            limiter.acquire(user, RateLimiter.Kind.DETAILS);
        }
        assertThatThrownBy(() -> limiter.acquire(user, RateLimiter.Kind.DETAILS)).isInstanceOf(RateLimited.class);

        clock.advance(Duration.ofSeconds(10));
        for (var i = 0; i < 40; i++) {
            limiter.acquire(user, RateLimiter.Kind.DETAILS);
            clock.advance(Duration.ofMillis(500));
        }
        // 60 calls within 30 s: the minute limit is what stops the next one
        assertThatThrownBy(() -> limiter.acquire(user, RateLimiter.Kind.DETAILS)).isInstanceOf(RateLimited.class);
    }
}
