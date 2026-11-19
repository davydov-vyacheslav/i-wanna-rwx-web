package com.javanix.rwx.common.validators;

import static org.assertj.core.api.Assertions.assertThat;

import com.javanix.rwx.testkit.Vectors;
import java.util.List;
import org.junit.jupiter.api.Test;

class HttpUrlsTests {

    @Test
    void keepsTheRawPartsOfTheJdkUriAndAcceptsSchemeCaseInsensitively() {
        var u = HttpUrls.parse("HTTP://Example.COM:8080/a/b%2Fc?x=1#f").orElseThrow();
        assertThat(u.getHost()).isEqualTo("Example.COM");
        assertThat(u.getPort()).isEqualTo(8080);
        assertThat(u.getUserInfo()).isNull();
        assertThat(u.getRawPath()).isEqualTo("/a/b%2Fc");
        assertThat(u.getRawQuery()).isEqualTo("x=1");
        assertThat(HttpUrls.parse("https://a.com").orElseThrow().getPort()).isEqualTo(-1);
        assertThat(HttpUrls.parse("https://u:p@a.com/").orElseThrow().getUserInfo()).isEqualTo("u:p");
    }

    @Test
    void acceptsOnlyHttpOrHttpsWithAHost() {
        for (var bad : List.of("mailto:a@b.c", "ftp://a.com/", "https:///x", "/relative", "a.com/x", "https://a.com/a b")) {
            assertThat(HttpUrls.parse(bad)).as(bad).isEmpty();
        }
        assertThat(HttpUrls.parse(null)).isEmpty();
        assertThat(HttpUrls.parse("")).isEmpty();
    }

    // the provider recognizers themselves are tested against these vectors in datasource (ProviderUrlVectorTests)
    @Test
    void providerVectorsAreWellFormedAndParse() {
        var providers = Vectors.sourceUrls().get("providerUrls");
        for (var id : List.of("open_library", "tmdb")) {
            assertThat(providers.get(id).get("accept").size()).isPositive();
            assertThat(providers.get(id).get("reject").size()).isPositive();
            providers.get(id).get("accept").forEach(n -> assertThat(HttpUrls.parse(n.get("url").asString())).isPresent());
        }
    }
}
