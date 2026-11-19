package com.javanix.rwx.datasource.internal.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.javanix.rwx.datasource.CatalogException.ProviderError;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class TextsTests {

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "　\t"})
    void aBlankTitleIsAProviderErrorNamingTheProvider(String title) {
        assertThatThrownBy(() -> Texts.title("tmdb", title)).isInstanceOfSatisfying(ProviderError.class,
                e -> assertThat(e.source()).isEqualTo("tmdb"));
    }

    @Test
    void titleIsStrippedAndCutAtFiveHundredCodePoints() {
        assertThat(Texts.title("tmdb", "  Dune 　")).isEqualTo("Dune");
        assertThat(Texts.title("tmdb", "x".repeat(600))).hasSize(500);
        // the cut keeps the first emoji whole (501 chars) and drops the second, never splitting a pair
        assertThat(Texts.title("tmdb", "x".repeat(499) + "😀😀")).hasSize(501);
    }

    @Test
    void optionalTextIsNullWhenBlankAndBounded() {
        assertThat(Texts.optional(null, 5)).isNull();
        assertThat(Texts.optional("  ", 5)).isNull();
        assertThat(Texts.optional(" abcdefgh ", 5)).isEqualTo("abcde");
        assertThat(Texts.cut("😀😀😀", 2)).isEqualTo("😀😀");
    }
}
