package com.javanix.rwx.media.book;

import java.util.UUID;

/** Ids are client UUIDs, unique per user only. */
record BookKey(UUID userId, UUID id) {
}
