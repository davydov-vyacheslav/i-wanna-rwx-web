package com.javanix.rwx.media.common;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.util.Comparator;
import java.util.stream.Stream;
import org.junit.jupiter.api.Named;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.support.ParameterDeclarations;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.ArgumentsProvider;
import org.junit.jupiter.params.provider.ArgumentsSource;
import org.springframework.test.context.junit.jupiter.SpringExtension;

/** Runs a test once per media type (book, movie); the method takes the {@link MediaKind}. */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@ParameterizedTest(name = "{0}")
@ArgumentsSource(EachKind.Kinds.class)
@interface EachKind {

    class Kinds implements ArgumentsProvider {
        @Override
        public Stream<? extends Arguments> provideArguments(ParameterDeclarations parameters,
                ExtensionContext context) {
            return SpringExtension.getApplicationContext(context).getBeansOfType(MediaKind.class).values().stream()
                    .sorted(Comparator.comparing(MediaKind::name)).map(k -> Arguments.of(Named.of(k.name(), k)));
        }
    }
}
