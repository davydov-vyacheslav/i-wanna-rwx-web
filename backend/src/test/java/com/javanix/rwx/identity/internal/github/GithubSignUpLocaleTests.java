package com.javanix.rwx.identity.internal.github;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Locale;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * Pins how the standard AcceptHeaderLocaleResolver, configured with the contract's locales, picks the sign-up locale.
 * A lone {@code q=0} entry is dropped by Tomcat itself before the resolver sees it (the mock request does not), so it
 * is not pinned here.
 */
class GithubSignUpLocaleTests {

    @ParameterizedTest
    @CsvSource(delimiter = '|', textBlock = """
            ru                       | ru
            uk,en;q=0.5              | uk
            en;q=0.4, uk;q=0.8, de   | uk
            ru-RU,ru;q=0.9,en;q=0.5  | ru
            en-GB                    | en
            uk-UA                    | uk
            de                       | en
            de-DE,de;q=0.9           | en
            fr, ru;q=0.1             | ru
            ru;q=0, en;q=0.5         | en
            *                        | en
            """)
    void picksTheBestSupportedLanguage(String header, String expected) {
        var request = new MockHttpServletRequest();
        request.addHeader("Accept-Language", header);

        assertThat(GithubOAuth2UserService.signUpLocale(request)).isEqualTo(expected);
    }

    @Test
    void noHeaderIsEnglishNotTheServerDefault() {
        var previous = Locale.getDefault();
        Locale.setDefault(Locale.of("uk"));
        try {
            assertThat(GithubOAuth2UserService.signUpLocale(new MockHttpServletRequest())).isEqualTo("en");
        } finally {
            Locale.setDefault(previous);
        }
    }

    @Test
    void malformedHeaderDoesNotFailAndIsEnglish() {
        var request = new MockHttpServletRequest();
        request.addHeader("Accept-Language", ";;q=,,,-");

        assertThat(GithubOAuth2UserService.signUpLocale(request)).isEqualTo("en");
    }
}
