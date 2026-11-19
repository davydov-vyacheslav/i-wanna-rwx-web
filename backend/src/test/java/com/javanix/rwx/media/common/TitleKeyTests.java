package com.javanix.rwx.media.common;

import static org.assertj.core.api.Assertions.assertThat;

import com.javanix.rwx.testkit.Vectors;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * {@code TitleKey} (the duplicate key and the stored identity of a draft) over the {@code titleKey} vectors shared with the frontend. The draft
 * link and text rules live in {@code datasource} and have their own tests there.
 */
class TitleKeyTests {

    static Stream<Arguments> keys() {
        return Vectors.sourceUrls().get("titleKey").valueStream()
                .map(n -> Arguments.of(n.get("input").asString(), n.get("key").asString()));
    }

    @ParameterizedTest
    @MethodSource("keys")
    void titleKeyVectors(String input, String key) {
        assertThat(TitleKey.of(input)).isEqualTo(key);
    }

    @Test
    void titleKeyRules() {
        assertThat(TitleKey.of("  Dune ")).isEqualTo("dune").isEqualTo(TitleKey.of("DUNE"));
        assertThat(TitleKey.of("Café")).isEqualTo(TitleKey.of("Café"));
        assertThat(TitleKey.of("Ёлка")).isEqualTo("ёлка");
        assertThat(TitleKey.of("\u3000Dune\u3000")).as("strip, not trim").isEqualTo("dune");
        assertThat(TitleKey.of("Cafe\u0301")).isEqualTo("caf\u00E9");
        assertThat(TitleKey.of("ё")).isNotEqualTo(TitleKey.of("е"));
    }

    @Test
    void titleKeyIsIdempotentAndBounded() {
        var samples = new ArrayList<>(List.of("  Dune ", "İstanbul", "ẞ", "Café", "Ångström"));
        Vectors.sourceUrls().get("titleKey").forEach(n -> samples.add(n.get("input").asString()));
        for (var s : samples) {
            var key = TitleKey.of(s);
            assertThat(TitleKey.of(key)).as(s).isEqualTo(key);
            assertThat(Normalizer.isNormalized(key, Normalizer.Form.NFC)).isTrue();
        }
        // the worst case for lower-casing growth: 200 code points of 'I with dot above'
        assertThat(TitleKey.of("İ".repeat(200)).length()).isLessThanOrEqualTo(1024);
    }
}
