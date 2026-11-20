package com.javanix.rwx.reminders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.javanix.rwx.testkit.IntegrationTest;
import com.javanix.rwx.testkit.TestUsers;
import java.util.UUID;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

/** V001 constraints of subscriptions and licenses (identical column rules), hit directly with SQL, not through services. */
@IntegrationTest
class RemindersSchemaTests {

    @Autowired TestUsers users;
    @Autowired JdbcClient jdbc;

    @ParameterizedTest
    @ValueSource(strings = {"subscriptions", "licenses"})
    void sameIdUnderTwoUsersIsAllowedButNotTwiceUnderOne(String table) {
        var f = users.two();
        var id = UUID.randomUUID();

        insert(table, f.a().id(), id, "monthly", "2026-03-15", 3, null);
        insert(table, f.b().id(), id, "monthly", "2026-03-15", 3, null);

        assertThatThrownBy(() -> insert(table, f.a().id(), id, "yearly", "2026-03-15", 3, null))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"subscriptions", "licenses"})
    void validRowsAreAccepted(String table) {
        var user = users.create().id();

        insert(table, user, UUID.randomUUID(), "lifetime", null, 14, null);
        insert(table, user, UUID.randomUUID(), "none", "2999-12-31", 1, null);
        insert(table, user, UUID.randomUUID(), "custom", "2020-01-01", 3, 36500);
    }

    @ParameterizedTest
    @ValueSource(strings = {"subscriptions", "licenses"})
    void eachCheckRejectsItsViolation(String table) {
        var user = users.create().id();

        rejected(table, user, "weekly", "2026-03-15", 3, null);
        rejected(table, user, "monthly", "2026-03-15", 0, null);
        rejected(table, user, "monthly", "2026-03-15", 15, null);
        rejected(table, user, "monthly", null, 3, null);
        rejected(table, user, "custom", "2026-03-15", 3, null);
        rejected(table, user, "custom", "2026-03-15", 3, 0);
        rejected(table, user, "custom", "2026-03-15", 3, 36501);
        rejected(table, user, "monthly", "3000-01-01", 3, null);
        assertThat(jdbc.sql("select count(*) from " + table + " where user_id = ?").param(user)
                .query(Integer.class).single()).isZero();
    }

    private void rejected(String table, UUID user, String pattern, String expiry, int remindDays, Integer customDays) {
        assertThatThrownBy(() -> insert(table, user, UUID.randomUUID(), pattern, expiry, remindDays, customDays))
                .as("%s %s %s %s %s", table, pattern, expiry, remindDays, customDays)
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private void insert(String table, UUID user, UUID id, String pattern, String expiry, int remindDays, Integer customDays) {
        jdbc.sql("insert into " + table + " (id, user_id, name, renewal_pattern, expiry_date, remind_days, custom_renewal_days)"
                + " values (?, ?, 'X', ?, ?::date, ?, ?)").params(id, user, pattern, expiry, remindDays, customDays).update();
    }
}
