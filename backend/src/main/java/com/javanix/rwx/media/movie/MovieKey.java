package com.javanix.rwx.media.movie;

import java.util.UUID;

/** Ids are client UUIDs, unique per user only. */
record MovieKey(UUID userId, UUID id) {
}
