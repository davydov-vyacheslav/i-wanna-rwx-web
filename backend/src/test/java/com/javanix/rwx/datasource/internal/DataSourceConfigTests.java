package com.javanix.rwx.datasource.internal;

import static org.assertj.core.api.Assertions.assertThat;

import com.javanix.rwx.api.model.BookSourceId;
import com.javanix.rwx.datasource.BookItem;
import com.javanix.rwx.datasource.BookRef;
import com.javanix.rwx.datasource.MediaResolver;
import com.javanix.rwx.datasource.MovieItem;
import com.javanix.rwx.datasource.MovieRef;
import com.javanix.rwx.datasource.internal.book.BookCatalogService;
import com.javanix.rwx.datasource.internal.movie.MovieCatalogService;
import com.javanix.rwx.datasource.internal.book.FakeBookSource;
import com.javanix.rwx.datasource.internal.provider.DataSourceConfig;
import com.javanix.rwx.datasource.internal.provider.DataSourceProperties;
import com.javanix.rwx.datasource.internal.provider.SourceDirectory;
import com.javanix.rwx.api.model.ResourceType;
import java.time.Clock;
import java.time.Duration;
import java.util.Properties;
import org.junit.jupiter.api.Test;
import org.springframework.boot.info.BuildProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.ApplicationContext;
import org.springframework.core.ResolvableType;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

/** The wiring and the startup rules, on a bare context (no database involved). */
class DataSourceConfigTests {

    private static final ResolvableType BOOKS = ResolvableType.forClassWithGenerics(MediaResolver.class, BookRef.class, BookItem.class);
    @SuppressWarnings("unchecked")
    private static MediaResolver<BookRef, BookItem> books(ApplicationContext ctx) {
        return (MediaResolver<BookRef, BookItem>) ctx.getBeanProvider(BOOKS).getObject();
    }

    private static final ResolvableType MOVIES = ResolvableType.forClassWithGenerics(MediaResolver.class, MovieRef.class, MovieItem.class);

    @Configuration(proxyBeanMethods = false)
    @Import({DataSourceConfig.class, BookCatalogService.class, MovieCatalogService.class})
    static class Base {
        @Bean
        Clock clock() {
            return Clock.systemUTC();
        }

        // Boot's build-info auto-configuration is not part of this slice
        @Bean
        BuildProperties buildProperties() {
            var entries = new Properties();
            entries.setProperty("version", "test");
            return new BuildProperties(entries);
        }
    }

    @Configuration(proxyBeanMethods = false)
    static class WithFakeBook {
        @Bean
        FakeBookSource fakeBook() {
            return new FakeBookSource(BookSourceId.OPEN_LIBRARY, "openlibrary.test");
        }
    }

    private final ApplicationContextRunner runner = new ApplicationContextRunner().withUserConfiguration(Base.class);

    @Test
    void aBlankContactFailsStartupWithAClearMessage() {
        runner.run(ctx -> assertThat(ctx).hasFailed().getFailure().rootCause()
                .hasMessageContaining("RWX_DATASOURCE_CONTACT"));
        runner.withPropertyValues("rwx.datasource.contact=   ")
                .run(ctx -> assertThat(ctx).hasFailed());
    }

    @Test
    void definedDefaultsMatchTheDesign() {
        runner.withPropertyValues("rwx.datasource.contact=ops@example.com").run(ctx -> {
            assertThat(ctx).hasNotFailed();
            var props = ctx.getBean(DataSourceProperties.class);
            assertThat(props.http().maxResponse().toBytes()).isEqualTo(2L * 1024 * 1024);
            assertThat(props.cache().enabled()).isTrue();
            assertThat(props.cache().ttl()).isEqualTo(Duration.ofMinutes(10));
            assertThat(props.cache().maxSize()).isEqualTo(1000);
        });
    }

    @Test
    void catalogsAreBeansOfTheParameterizedResolver() {
        runner.withPropertyValues("rwx.datasource.contact=ops@example.com").run(ctx -> {
            assertThat(ctx.getBeanProvider(BOOKS).stream()).hasSize(1);
            assertThat(ctx.getBeanProvider(MOVIES).stream()).hasSize(1);
            assertThat(books(ctx).identify("https://openlibrary.org/works/OL1W")).isEmpty();
        });
    }

    @Test
    void aRegisteredSourceIsIdentified() {
        runner.withUserConfiguration(WithFakeBook.class)
                .withPropertyValues("rwx.datasource.contact=ops@example.com", "rwx.datasource.books.default=open_library")
                .run(ctx -> {
                    assertThat(ctx).hasNotFailed();
                    assertThat(books(ctx).identify("https://openlibrary.test/works/OL1W")).isPresent();
                    assertThat(ctx.getBean(DataSourceProperties.class).books().defaultSource()).isEqualTo("open_library");
                    assertThat(ctx.getBean(SourceDirectory.class).defaultOf(ResourceType.BOOK).id()).isEqualTo("open_library");
                });
    }

    @Test
    void aDefaultThatIsNotRegisteredFailsStartup() {
        runner.withUserConfiguration(WithFakeBook.class)
                .withPropertyValues("rwx.datasource.contact=ops@example.com", "rwx.datasource.books.default=tmdb")
                .run(ctx -> assertThat(ctx).hasFailed().getFailure().rootCause()
                        .hasMessageContaining("rwx.datasource.books.default").hasMessageContaining("'tmdb'"));
    }
}
