package com.javanix.rwx.datasource.internal.provider;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.core.io.ClassPathResource;

/** Provider response bodies under {@code src/test/resources/providers/}; see the README there for what is recorded. */
public final class Fixtures {

    private Fixtures() {}

    public static String read(String path) {
        try (var in = new ClassPathResource("providers/" + path).getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("missing fixture " + path, e);
        }
    }
}
