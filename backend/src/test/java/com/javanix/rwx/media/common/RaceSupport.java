package com.javanix.rwx.media.common;

import static org.assertj.core.api.Assertions.assertThat;

import com.javanix.rwx.identity.UserLock;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.locks.LockSupport;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Forces a known order on two concurrent writes of one user: the test holds the user's lock, starts the first
 * writer and waits until Postgres shows it queued on the lock, then does the same for the second, then releases. The
 * lock queue is FIFO, so the first writer commits before the second starts. Without the lock in the service the
 * writers never queue and the wait fails, so these tests fail if {@code writeLock.lock} is removed.
 */
final class RaceSupport {

    record Outcomes(Object first, Object second) {}

    private RaceSupport() {}

    static Outcomes race(PlatformTransactionManager tm, JdbcClient jdbc, UserLock lock, UUID user,
            Callable<?> first, Callable<?> second) throws Exception {
        try (var pool = Executors.newFixedThreadPool(2)) {
            // the writers are released when this callback returns and the transaction commits
            var writers = new TransactionTemplate(tm).execute(status -> {
                lock.lock(user);
                var f1 = pool.submit(() -> attempt(first));
                awaitQueued(jdbc, 1);
                var f2 = pool.submit(() -> attempt(second));
                awaitQueued(jdbc, 2);
                return List.of(f1, f2);
            });
            return new Outcomes(writers.get(0).get(), writers.get(1).get());
        }
    }

    private static Object attempt(Callable<?> call) {
        try {
            return call.call();
        } catch (Exception e) {
            return e;
        }
    }

    /**
     * Polls from another thread: inside the holder's transaction Postgres would serve a cached snapshot of
     * pg_stat_activity that never shows the queue.
     */
    private static void awaitQueued(JdbcClient jdbc, int expected) {
        CompletableFuture.runAsync(() -> {
            var deadline = System.nanoTime() + Duration.ofSeconds(10).toNanos();
            long queued = 0;
            while (System.nanoTime() < deadline) {
                queued = jdbc.sql("""
                        select count(*) from pg_stat_activity
                        where datname = current_database() and wait_event_type = 'Lock' and query ilike '%for%update%'
                        """).query(Long.class).single();
                if (queued == expected) {
                    return;
                }
                LockSupport.parkNanos(Duration.ofMillis(20).toNanos());
            }
            assertThat(queued).as("writers queued on the user's lock").isEqualTo(expected);
        }).join();
    }
}
