package com.javanix.rwx.reminders.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.javanix.rwx.common.GoneException;
import com.javanix.rwx.common.InvalidRequestException;
import com.javanix.rwx.common.NotFoundException;
import com.javanix.rwx.common.Violation;
import com.javanix.rwx.reminders.common.ReminderEntity.Fields;
import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.locks.LockSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.Parameter;
import org.junit.jupiter.params.ParameterizedClass;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** The shared service behaviour on real Postgres, once per reminder type. */
@IntegrationTest
@ParameterizedClass
@ValueSource(strings = {"subscription", "license"})
class ReminderServiceTests {

    @Parameter String type;

    @Autowired TestUsers users;
    @Autowired ApplicationContext context;
    @Autowired JdbcClient jdbc;
    @Autowired PlatformTransactionManager tm;

    // the feature classes are package-private; their public bases are all a test in common can name
    ReminderService<ReminderEntity> service;
    ReminderRepository<ReminderEntity, ReminderKey> repository;
    String table;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void resolve() {
        service = (ReminderService<ReminderEntity>) context.getBean(type + "Service");
        repository = (ReminderRepository<ReminderEntity, ReminderKey>) context.getBean(type + "Repository");
        table = type + "s";
    }

    @Test
    void createStoresVersionOneAndARepeatReturnsTheStoredRecord() {
        var user = users.create().id();
        var id = UUID.randomUUID();

        var first = service.create(user, id, full("Netflix", "monthly", "2026-03-15", null));
        var again = service.create(user, id, full("Other", "yearly", "2030-01-01", null));

        assertThat(first.created()).isTrue();
        assertThat(first.entity().getVersion()).isEqualTo(1);
        assertThat(first.entity().getCreatedAt()).isEqualTo(first.entity().getUpdatedAt());
        assertThat(again.created()).isFalse();
        assertThat(again.entity().getName()).isEqualTo("Netflix");
        assertThat(service.list(user)).hasSize(1);
    }

    @Test
    void createOfADeletedIdIsGone() {
        var user = users.create().id();
        var id = created(user, "monthly", "2026-03-15");
        service.delete(user, id);

        assertThatThrownBy(() -> service.create(user, id, full("Again", "monthly", "2026-03-15", null)))
                .isInstanceOf(GoneException.class);
    }

    @Test
    void invalidContentIsRejectedAndNothingIsStored() {
        var user = users.create().id();

        assertInvalid("expiryDate", () -> service.create(user, UUID.randomUUID(), full("A", "yearly", null, null)));
        assertInvalid("expiryDate",
                () -> service.create(user, UUID.randomUUID(), full("A", "none", "3000-01-01", null)));
        assertInvalid("customRenewalDays",
                () -> service.create(user, UUID.randomUUID(), full("A", "custom", "2026-03-15", null)));
        assertInvalid("customRenewalDays",
                () -> service.create(user, UUID.randomUUID(), full("A", "custom", "2026-03-15", 0)));
        assertThat(service.list(user)).isEmpty();
    }

    @Test
    void lifetimeHasNoExpiryAndCustomDaysExistOnlyForCustom() {
        var user = users.create().id();

        var lifetime = service.create(user, UUID.randomUUID(), full("A", "lifetime", "2026-03-15", 7)).entity();

        assertThat(lifetime.getExpiryDate()).isNull();
        assertThat(lifetime.getCustomRenewalDays()).isNull();
    }

    @Test
    void patchChecksTheMergedRecord() {
        var user = users.create().id();
        var id = service.create(user, UUID.randomUUID(), full("Forever", "lifetime", null, null)).entity().getId();

        assertInvalid("expiryDate", () -> service.patch(user, id, patch("monthly", null)));
        var patched = service.patch(user, id, patch("monthly", "2026-03-15"));
        assertThat(patched.getRenewalPattern()).isEqualTo("monthly");
        assertThat(patched.getExpiryDate()).isEqualTo("2026-03-15");

        var back = service.patch(user, id, patch("lifetime", null));
        assertThat(back.getExpiryDate()).isNull();
        assertThat(back.getVersion()).isEqualTo(3);
    }

    @Test
    void patchSetsOnlyTheGivenFieldsAndABlankDescriptionClears() {
        var user = users.create().id();
        var id = service.create(user, UUID.randomUUID(),
                new Fields("Netflix", LocalDate.parse("2026-03-15"), "monthly", null, 3, "$9", "Family plan", null)).entity()
                .getId();

        var renamed = service.patch(user, id, new Fields("Netflix HD", null, null, null, null, null, "", null));

        assertThat(renamed.getName()).isEqualTo("Netflix HD");
        assertThat(renamed.getCost()).isEqualTo("$9");
        assertThat(renamed.getDescription()).isNull();
        assertThat(renamed.getRemindDays()).isEqualTo(3);
        assertThat(renamed.getVersion()).isEqualTo(2);
    }

    @Test
    void identicalPatchWritesNothing() {
        var user = users.create().id();
        var id = created(user, "monthly", "2026-03-15");
        var changed = service.patch(user, id, new Fields("Renamed", null, null, null, null, null, null, null));

        var again = service.patch(user, id, new Fields("Renamed", LocalDate.parse("2026-03-15"), "monthly", null, 3,
                null, null, null));

        assertThat(again.getVersion()).isEqualTo(2).isEqualTo(changed.getVersion());
        assertThat(again.getUpdatedAt()).isEqualTo(changed.getUpdatedAt());
        assertThat(service.get(user, id).getUpdatedAt()).isEqualTo(changed.getUpdatedAt());
    }

    @ParameterizedTest(name = "{0} {1} days {2}: {3} becomes {4}")
    @CsvSource(nullValues = "null", textBlock = """
            monthly, null, 2026-03-15, 2026-04-15
            monthly, null, 2026-01-31, 2026-02-28
            monthly, null, 2028-01-31, 2028-02-29
            yearly,  null, 2028-02-29, 2029-02-28
            yearly,  null, 2026-06-01, 2027-06-01
            custom,  45,   2026-03-15, 2026-04-29
            monthly, null, 2020-01-31, 2020-02-29
            """)
    void renewAddsOnePeriod(String pattern, Integer customDays, String from, String to) {
        var user = users.create().id();
        var id = service.create(user, UUID.randomUUID(), full("S", pattern, from, customDays)).entity().getId();

        var renewed = service.renew(user, id, LocalDate.parse(from));

        assertThat(renewed.getExpiryDate()).isEqualTo(to);
        assertThat(renewed.getVersion()).isEqualTo(2);
        assertThat(service.get(user, id).getExpiryDate()).isEqualTo(to);
    }

    @Test
    void clampDoesNotKeepTheAnchor() {
        var user = users.create().id();
        var id = created(user, "monthly", "2026-01-31");

        service.renew(user, id, LocalDate.parse("2026-01-31"));
        var second = service.renew(user, id, LocalDate.parse("2026-02-28"));

        assertThat(second.getExpiryDate()).isEqualTo("2026-03-28");
    }

    @Test
    void anOverdueRecordStaysOverdueAfterRenewal() {
        var user = users.create().id();
        var id = created(user, "monthly", "2020-03-15");

        assertThat(service.renew(user, id, LocalDate.parse("2020-03-15")).getExpiryDate()).isEqualTo("2020-04-15");
    }

    @Test
    void lifetimeAndNoneCannotBeRenewedEvenForAStaleDate() {
        var user = users.create().id();
        var none = created(user, "none", "2026-03-15");
        var lifetime = service.create(user, UUID.randomUUID(), full("A", "lifetime", null, null)).entity().getId();

        assertInvalid("renewalPattern", () -> service.renew(user, none, LocalDate.parse("2026-03-15")));
        assertInvalid("renewalPattern", () -> service.renew(user, none, LocalDate.parse("1999-01-01")));
        assertInvalid("renewalPattern", () -> service.renew(user, lifetime, LocalDate.parse("2026-03-15")));
        assertThat(service.get(user, none).getVersion()).isEqualTo(1);
    }

    @Test
    void aStaleExpectedDateIsANoOpThatReturnsTheCurrentRecord() {
        var user = users.create().id();
        var id = created(user, "monthly", "2026-03-15");
        var renewed = service.renew(user, id, LocalDate.parse("2026-03-15"));

        var stale = service.renew(user, id, LocalDate.parse("2026-03-15"));

        assertThat(stale.getExpiryDate()).isEqualTo("2026-04-15");
        assertThat(stale.getVersion()).isEqualTo(2);
        assertThat(stale.getUpdatedAt()).isEqualTo(renewed.getUpdatedAt());
    }

    @Test
    void aRenewalPastTheBoundIsRejectedAndNothingChanges() {
        var user = users.create().id();
        var id = created(user, "yearly", "2999-06-01");
        var last = created(user, "monthly", "2999-12-31");

        assertInvalid("expiryDate", () -> service.renew(user, id, LocalDate.parse("2999-06-01")));
        assertInvalid("expiryDate", () -> service.renew(user, last, LocalDate.parse("2999-12-31")));
        assertThat(service.get(user, id).getExpiryDate()).isEqualTo("2999-06-01");
        assertThat(service.get(user, id).getVersion()).isEqualTo(1);
    }

    @Test
    void twoConcurrentRenewalsWithTheSameExpectedDateApplyOnce() throws Exception {
        var user = users.create().id();
        var id = created(user, "monthly", "2026-03-15");
        var expected = LocalDate.parse("2026-03-15");

        // the test holds the row, queues both renewals behind it, then releases; without the row lock they never
        // queue and the wait fails
        try (var pool = Executors.newFixedThreadPool(2)) {
            var renewals = new TransactionTemplate(tm).execute(status -> {
                repository.findForUpdateByIdAndUserId(id, user);
                var first = pool.submit(() -> service.renew(user, id, expected));
                awaitQueued("%for%update%", 1);
                var second = pool.submit(() -> service.renew(user, id, expected));
                awaitQueued("%for%update%", 2);
                return List.of(first, second);
            });
            for (var renewal : renewals) {
                assertThat(renewal.get().getExpiryDate()).isEqualTo("2026-04-15");
            }
        }

        var stored = service.get(user, id);
        assertThat(stored.getExpiryDate()).isEqualTo("2026-04-15");
        assertThat(stored.getVersion()).isEqualTo(2);
    }

    @Test
    void deleteClearsTheDescriptionHidesTheRecordAndIsIdempotent() {
        var user = users.create().id();
        var id = service.create(user, UUID.randomUUID(),
                new Fields("A", LocalDate.parse("2026-03-15"), "monthly", null, 3, null, "Plan", null)).entity().getId();
        var other = created(user, "monthly", "2026-03-15");

        service.delete(user, id);
        service.delete(user, id);

        assertThat(service.list(user)).extracting(ReminderEntity::getId).containsExactly(other);
        assertThatThrownBy(() -> service.get(user, id)).isInstanceOf(NotFoundException.class);
        assertThat(jdbc.sql("select version from " + table + " where user_id = ? and id = ?").param(user).param(id)
                .query(Long.class).single()).isEqualTo(2);
        assertThat(jdbc.sql("select description from " + table + " where user_id = ? and id = ?").param(user)
                .param(id).query(String.class).optional()).isEmpty();
    }

    @Test
    void aDeletedIdIsGoneForPatchAndRenewAndUnknownIsNotFound() {
        var user = users.create().id();
        var id = created(user, "monthly", "2026-03-15");
        service.delete(user, id);

        assertThatThrownBy(() -> service.patch(user, id, patch("yearly", null))).isInstanceOf(GoneException.class);
        assertThatThrownBy(() -> service.renew(user, id, LocalDate.parse("2026-03-15")))
                .isInstanceOf(GoneException.class);
        assertThatThrownBy(() -> service.delete(user, UUID.randomUUID())).isInstanceOf(NotFoundException.class);
    }

    @ParameterizedTest
    @CsvSource({"false", "true"})
    void aRacingCreateOfTheSameIdReadsTheWinnersRowAgain(boolean winnerDeleted) throws Exception {
        var user = users.create().id();
        var id = UUID.randomUUID();

        // the winner's insert is uncommitted, so the loser's read finds nothing and its insert waits on the key
        try (var pool = Executors.newFixedThreadPool(1)) {
            var loser = new TransactionTemplate(tm).execute(status -> {
                jdbc.sql("insert into " + table + " (id, user_id, name, renewal_pattern, expiry_date, remind_days,"
                        + " deleted_at) values (?, ?, 'Winner', 'monthly', date '2026-03-15', 3, "
                        + (winnerDeleted ? "now()" : "null") + ")").params(id, user).update();
                var future = pool.submit(() -> service.create(user, id, full("Loser", "yearly", "2030-01-01", null)));
                awaitQueued("insert into " + table + "%", 1);
                return future;
            });

            if (winnerDeleted) {
                assertThatThrownBy(loser::get).isInstanceOf(ExecutionException.class)
                        .hasCauseInstanceOf(GoneException.class);
            } else {
                var result = loser.get();
                assertThat(result.created()).isFalse();
                assertThat(result.entity().getName()).isEqualTo("Winner");
            }
        }
    }

    private UUID created(UUID user, String pattern, String expiry) {
        return service.create(user, UUID.randomUUID(), full("S", pattern, expiry, null)).entity().getId();
    }

    private static Fields full(String name, String pattern, String expiry, Integer customDays) {
        return new Fields(name, expiry == null ? null : LocalDate.parse(expiry), pattern, customDays, 3, null, null, null);
    }

    private static Fields patch(String pattern, String expiry) {
        return new Fields(null, expiry == null ? null : LocalDate.parse(expiry), pattern, null, null, null, null, null);
    }

    private static void assertInvalid(String field, org.assertj.core.api.ThrowableAssert.ThrowingCallable call) {
        assertThatThrownBy(call).isInstanceOfSatisfying(InvalidRequestException.class,
                e -> assertThat(e.errors()).extracting(Violation::field).contains(field));
    }

    /** Polls from another thread: inside the holder's transaction Postgres serves a snapshot that never shows the queue. */
    private void awaitQueued(String queryPattern, int expected) {
        CompletableFuture.runAsync(() -> {
            var deadline = System.nanoTime() + Duration.ofSeconds(10).toNanos();
            long queued = 0;
            while (System.nanoTime() < deadline) {
                queued = jdbc.sql("""
                        select count(*) from pg_stat_activity
                        where datname = current_database() and wait_event_type = 'Lock' and query ilike ?
                        """).param(queryPattern).query(Long.class).single();
                if (queued == expected) {
                    return;
                }
                LockSupport.parkNanos(Duration.ofMillis(20).toNanos());
            }
            assertThat(queued).as("writers queued behind the held lock").isEqualTo(expected);
        }).join();
    }
}
