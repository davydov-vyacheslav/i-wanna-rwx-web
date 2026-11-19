package com.javanix.rwx.media.movie;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * Isolation guard: a new repository method must be added to the whitelist consciously, and a user-scoped one must
 * take the user id. saveAndFlush is scoped by the entity's own userId.
 */
class MovieRepositoryScopeTests {

    private static final Set<String> METHODS = Set.of("findByIdAndUserId",
            "findByUserIdAndDeletedAtIsNullOrderByCreatedAtAscIdAsc",
            "findByUserIdAndSourceAndTypeAndExternalIdAndDeletedAtIsNull", "findByUserIdAndDeletedAtIsNull",
            "saveAndFlush");

    @Test
    void everyMethodIsWhitelistedAndTakesTheUserId() {
        var methods = Arrays.stream(MovieRepository.class.getMethods()).toList(); // inherited ones too
        assertThat(methods.stream().map(Method::getName).collect(Collectors.toSet())).isEqualTo(METHODS);
        for (var method : methods) {
            if (!method.getName().equals("saveAndFlush")) {
                assertThat(Arrays.asList(method.getParameterTypes())).as(method.toString()).contains(UUID.class);
                assertThat(method.getName()).as(method.toString()).contains("UserId");
            }
        }
    }
}
