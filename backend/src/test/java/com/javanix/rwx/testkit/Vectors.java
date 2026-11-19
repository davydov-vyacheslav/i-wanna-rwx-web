package com.javanix.rwx.testkit;

import java.nio.file.Files;
import java.nio.file.Path;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** {@code api/test-vectors/source-urls.json}: the cases shared by the Java rules and their frontend twins. */
public final class Vectors {

    private static final JsonNode SOURCE_URLS = load();

    private Vectors() {}

    public static JsonNode sourceUrls() {
        return SOURCE_URLS;
    }

    private static JsonNode load() {
        try {
            return JsonMapper.builder().build().readTree(
                    Files.readString(Path.of("..", "api", "test-vectors", "source-urls.json")));
        } catch (Exception e) {
            throw new IllegalStateException("api/test-vectors/source-urls.json must be readable from backend/", e);
        }
    }
}
