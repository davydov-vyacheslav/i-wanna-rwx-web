package com.javanix.rwx.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@IntegrationTest
class UserLockTests {

    @Autowired UserLock lock;
    @Autowired TestUsers users;
    @Autowired PlatformTransactionManager transactions;

    private ExecutorService pool;
    private TransactionTemplate tx;

    @BeforeEach
    void setUp() {
        pool = Executors.newFixedThreadPool(4);
        tx = new TransactionTemplate(transactions);
    }

    @AfterEach
    void tearDown() {
        pool.shutdownNow();
    }

    @Test
    void secondTransactionOfTheSameUserWaitsForTheFirstCommit() throws Exception {
        var user = users.create().id();
        var holding = new CountDownLatch(1);
        var release = new CountDownLatch(1);

        var first = CompletableFuture.runAsync(() -> tx.executeWithoutResult(s -> {
            lock.lock(user);
            holding.countDown();
            await(release);
        }), pool);
        assertThat(holding.await(10, TimeUnit.SECONDS)).isTrue();
        var second = CompletableFuture.runAsync(() -> tx.executeWithoutResult(s -> lock.lock(user)), pool);

        Thread.sleep(200);
        assertThat(second).isNotDone();
        release.countDown();
        first.get(10, TimeUnit.SECONDS);
        second.get(10, TimeUnit.SECONDS);
    }

    @Test
    void differentUsersDoNotBlockEachOther() throws Exception {
        var f = users.two();
        var holding = new CountDownLatch(1);
        var release = new CountDownLatch(1);

        var first = CompletableFuture.runAsync(() -> tx.executeWithoutResult(s -> {
            lock.lock(f.a().id());
            holding.countDown();
            await(release);
        }), pool);
        assertThat(holding.await(10, TimeUnit.SECONDS)).isTrue();

        CompletableFuture.runAsync(() -> tx.executeWithoutResult(s -> lock.lock(f.b().id())), pool)
                .get(5, TimeUnit.SECONDS);

        release.countDown();
        first.get(10, TimeUnit.SECONDS);
    }

    @Test
    void requiresATransaction() {
        assertThatThrownBy(() -> lock.lock(users.create().id())).isInstanceOf(IllegalTransactionStateException.class);
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(30, TimeUnit.SECONDS)) {
                throw new IllegalStateException("latch timeout");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }
}
