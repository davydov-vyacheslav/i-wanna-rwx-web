package com.javanix.rwx.datasource.internal;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;
import org.springframework.resilience.annotation.ConcurrencyLimit;

/**
 * Modulith checks modules, not the packages inside one. {@code provider} is the foundation both source packages
 * build on, so it must not know either of them (a cycle would make the split pointless).
 */
class PackageStructureTests {

    private static final String BASE = "com.javanix.rwx.datasource.internal";

    private final JavaClasses classes = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages(BASE);

    @Test
    void providerDependsOnNeitherBookNorMovie() {
        noClasses().that().resideInAPackage(BASE + ".provider..")
                .should().dependOnClassesThat().resideInAnyPackage(BASE + ".book..", BASE + ".movie..")
                .check(classes);
    }

    @Test
    void bookAndMovieDoNotDependOnEachOther() {
        noClasses().that().resideInAPackage(BASE + ".book..")
                .should().dependOnClassesThat().resideInAPackage(BASE + ".movie..").check(classes);
        noClasses().that().resideInAPackage(BASE + ".movie..")
                .should().dependOnClassesThat().resideInAPackage(BASE + ".book..").check(classes);
    }

    @Test
    void nothingOutsideWebDependsOnWeb() {
        noClasses().that().resideInAnyPackage(BASE + ".provider..", BASE + ".book..", BASE + ".movie..")
                .should().dependOnClassesThat().resideInAPackage(BASE + ".web..").check(classes);
    }

    @Test
    void providerDoesNotDependOnTheSharedDraftRules() {
        // book and movie extend AbstractDraftResolver (the package root) with their own ref and item types
        noClasses().that().resideInAPackage(BASE + ".provider..")
                .should().dependOnClassesThat().resideInAPackage(BASE).check(classes);
    }

    @Test
    void theSharedDraftRulesDependOnNoSourcePackage() {
        noClasses().that().resideInAPackage(BASE)
                .should().dependOnClassesThat()
                .resideInAnyPackage(BASE + ".provider..", BASE + ".book..", BASE + ".movie..").check(classes);
    }

    @Test
    void everyProviderClientInterfaceIsConcurrencyLimited() {
        // the outbound guard is the annotation on the client interface; a client without it would be unguarded
        classes().that().areInterfaces().and().haveSimpleNameEndingWith("Api")
                .should().beAnnotatedWith(ConcurrencyLimit.class).check(classes);
    }
}
