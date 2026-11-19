package com.javanix.rwx.identity;

import java.util.UUID;

/** The authenticated caller. Every user-owned query in other modules is scoped by {@link #id()}. */
public record CurrentUser(UUID id) {
}
