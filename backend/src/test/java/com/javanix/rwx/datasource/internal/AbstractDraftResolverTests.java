package com.javanix.rwx.datasource.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.javanix.rwx.testkit.Vectors;
import java.util.Random;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/** The draft link rules over the vector file shared with the frontend: the single Java implementation. */
class AbstractDraftResolverTests {

    static Stream<Arguments> accepted() {
        return Vectors.sourceUrls().get("draftLinks").get("accept").valueStream()
                .map(n -> Arguments.of(n.get("name").asString(), n.get("url").asString(),
                        n.get("title").asString(), n.get("link").asString()));
    }

    static Stream<Arguments> rejected() {
        return Vectors.sourceUrls().get("draftLinks").get("reject").valueStream()
                .map(n -> Arguments.of(n.get("name").asString(), n.get("url").asString()));
    }

    static Stream<Arguments> builds() {
        return Vectors.sourceUrls().get("draftLinkBuild").valueStream()
                .map(n -> Arguments.of(n.get("text").asString(), n.get("link").asString()));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("accepted")
    void draftLinkAccepted(String name, String url, String title, String link) {
        var text = AbstractDraftResolver.parse(url);
        assertThat(text).contains(title);
        assertThat(AbstractDraftResolver.build(text.get())).isEqualTo(link);
        // the canonical link parses back to the same text: build(parse(u)) is idempotent
        assertThat(AbstractDraftResolver.parse(link)).contains(title);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("rejected")
    void draftLinkRejected(String name, String url) {
        assertThat(AbstractDraftResolver.parse(url)).isEmpty();
    }

    @ParameterizedTest
    @MethodSource("builds")
    void buildEncodesEveryByteOutsideUnreserved(String text, String link) {
        assertThat(AbstractDraftResolver.build(text)).isEqualTo(link);
    }

    @Test
    void buildRejectsInvalidText() {
        assertThatThrownBy(() -> AbstractDraftResolver.build("  ")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AbstractDraftResolver.build("a\nb")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AbstractDraftResolver.build("x".repeat(201))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AbstractDraftResolver.build(null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void textRulesTrimAndLimit() {
        assertThat(AbstractDraftResolver.normalizeText("　Dune ")).contains("Dune");
        assertThat(AbstractDraftResolver.normalizeText("x".repeat(AbstractDraftResolver.MAX_TEXT_CODE_POINTS))).isPresent();
        assertThat(AbstractDraftResolver.normalizeText("x".repeat(AbstractDraftResolver.MAX_TEXT_CODE_POINTS + 1))).isEmpty();
        assertThat(AbstractDraftResolver.normalizeText("😀".repeat(AbstractDraftResolver.MAX_TEXT_CODE_POINTS))).isPresent();
        assertThat(AbstractDraftResolver.normalizeText("a\u0085b")).as("C1 control").isEmpty();
        assertThat(AbstractDraftResolver.normalizeText("a\u007Fb")).as("DEL").isEmpty();
        assertThat(AbstractDraftResolver.normalizeText("a\uD800b")).as("lone surrogate").isEmpty();
        assertThat(AbstractDraftResolver.normalizeText("👨‍👩")).as("emoji joiner is allowed").isPresent();
    }

    @Test
    void replacementCharacterIsRejectedByBuildAndParseAlike() {
        assertThat(AbstractDraftResolver.normalizeText("a\uFFFDb")).isEmpty();
        assertThatThrownBy(() -> AbstractDraftResolver.build("a\uFFFDb")).isInstanceOf(IllegalArgumentException.class);
        // the literal escape and the escape of invalid UTF-8 (which decodes to U+FFFD) both fail to parse
        assertThat(AbstractDraftResolver.parse("https://www.google.com/search?q=a%EF%BF%BDb")).isEmpty();
        assertThat(AbstractDraftResolver.parse("https://www.google.com/search?q=a%FFb")).isEmpty();
    }

    @Test
    void buildEncodesPunctuationAndSpaceAsPercentTwenty() {
        assertThat(AbstractDraftResolver.build("a b!'()*")).isEqualTo("https://www.google.com/search?q=a%20b%21%27%28%29%2A");
    }

    @Test
    void parseThenBuildRoundTripsRandomValidText() {
        var random = new Random(42);
        // letters, digits, punctuation, Cyrillic, accents, emoji, the joiners, NBSP inside, combining marks
        var alphabet = "abcXYZ019 !?&=#+%/'\"()*-._~Ёёлкаé́‍‌ 😀中".codePoints().toArray();
        var checked = 0;
        for (var i = 0; i < 2000; i++) {
            var sb = new StringBuilder();
            for (var j = random.nextInt(1, 40); j > 0; j--) {
                sb.appendCodePoint(alphabet[random.nextInt(alphabet.length)]);
            }
            var raw = sb.toString();
            var normalized = AbstractDraftResolver.normalizeText(raw);
            if (normalized.isEmpty()) {
                continue; // e.g. only spaces; not a valid text
            }
            checked++;
            var link = AbstractDraftResolver.build(raw);
            assertThat(AbstractDraftResolver.parse(link)).as(raw).contains(normalized.get());
            assertThat(AbstractDraftResolver.build(AbstractDraftResolver.parse(link).get())).isEqualTo(link);
        }
        assertThat(checked).isGreaterThan(500);
    }
}
