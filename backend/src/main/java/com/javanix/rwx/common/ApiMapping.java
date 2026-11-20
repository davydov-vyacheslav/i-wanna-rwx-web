package com.javanix.rwx.common;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

/** Conversions every API mapper needs (MapStruct `uses`). */
public final class ApiMapping {

    private ApiMapping() {
    }

    public static OffsetDateTime utc(Instant instant) {
        return instant == null ? null : instant.atOffset(ZoneOffset.UTC);
    }
}
