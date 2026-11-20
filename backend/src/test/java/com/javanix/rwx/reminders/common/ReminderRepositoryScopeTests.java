package com.javanix.rwx.reminders.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Isolation guard for both repositories (they share {@link ReminderRepository}): a new method must be added to the
 * whitelist consciously, and a user-scoped one must take the user id. saveAndFlush is scoped by the entity's own
 * userId. The repositories are package-private, hence the names.
 */
class ReminderRepositoryScopeTests {

    private static final Set<String> METHODS = Set.of("findByIdAndUserId", "findForUpdateByIdAndUserId",
            "findByUserIdAndDeletedAtIsNullOrderByCreatedAtAscIdAsc", "saveAndFlush");

    @ParameterizedTest
    @ValueSource(strings = {"subscription.SubscriptionRepository", "license.LicenseRepository"})
    void everyMethodIsWhitelistedAndTakesTheUserId(String repository) throws ClassNotFoundException {
        var type = Class.forName("com.javanix.rwx.reminders." + repository);
        var methods = Arrays.stream(type.getMethods()).toList(); // inherited ones too
        assertThat(methods.stream().map(Method::getName).collect(Collectors.toSet())).isEqualTo(METHODS);
        for (var method : methods) {
            if (!method.getName().equals("saveAndFlush")) {
                assertThat(Arrays.asList(method.getParameterTypes())).as(method.toString()).contains(UUID.class);
                assertThat(method.getName()).as(method.toString()).contains("UserId");
            }
        }
    }
}
