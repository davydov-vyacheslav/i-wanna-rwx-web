package com.javanix.rwx;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.freeze.FreezingArchRule.freeze;
import static com.tngtech.archunit.library.GeneralCodingRules.NO_CLASSES_SHOULD_ACCESS_STANDARD_STREAMS;
import static com.tngtech.archunit.library.GeneralCodingRules.NO_CLASSES_SHOULD_USE_FIELD_INJECTION;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import java.time.temporal.Temporal;
import org.junit.jupiter.api.Test;
import org.mapstruct.Mapper;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

/**
 * Review lessons that a machine can check (see docs/REVIEW_LESSONS.md); the rest stays in prose. Modulith covers
 * module boundaries, {@code PlatformTests.modulesAreWellFormed}. A rule that needs an exception is a reason to
 * talk about the rule, not to widen it silently. The two frozen rules hold the violations that existed when they were
 * added ({@code archunit_store}): only new ones fail, and a fixed one drops out of the store.
 */
class ArchitectureTests {

    private static final String BASE = "com.javanix.rwx";

    private final JavaClasses classes = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages(BASE);

    @Test
    void noNativeQueriesAndNoHandWrittenJdbc() {
        // JPA derived queries, JPQL, @Lock and @Modifying cover what we need; raw SQL stays in Flyway
        methods().that().areAnnotatedWith(Query.class)
                .should(notNative()).allowEmptyShould(true).check(classes);
        noClasses().should().dependOnClassesThat().haveFullyQualifiedName("org.springframework.jdbc.core.JdbcTemplate")
                .orShould().dependOnClassesThat().haveFullyQualifiedName("org.springframework.jdbc.core.simple.JdbcClient")
                .orShould().callMethodWhere(DescribedPredicate.describe("creates a native query", call ->
                        call.getName().equals("createNativeQuery")))
                .check(classes);
    }

    @Test
    void interfaceHasMoreThanOneImplementationOrIsFrameworkProvided() {
        // an interface with a single implementation is a layer, not an abstraction; repositories and HTTP clients
        // have no implementing class of ours, the generated contract lives in ..api..
        freeze(classes().that().areInterfaces()
                .and().areNotAnnotations()
                .and().resideOutsideOfPackage(BASE + ".api..")
                .and().areNotAssignableTo(Repository.class)
                .and().areNotAnnotatedWith(Mapper.class) // MapStruct generates the single implementation
                .should(notHaveExactlyOneImplementation())).check(classes);
    }

    @Test
    void everyModuleRootClassIsUsedByAnotherModule() {
        // the module root is the published API; a class nobody outside the module uses belongs in a sub-package
        freeze(classes().that().resideInAnyPackage(
                        BASE + ".datasource", BASE + ".settings", BASE + ".identity", BASE + ".media",
                        BASE + ".reminders")
                .and().areTopLevelClasses()
                .and().haveSimpleNameNotEndingWith("package-info")
                .should(beUsedOutsideItsModule())).check(classes);
    }

    @Test
    void sharedCodeDoesNotDependOnFeatureModules() {
        noClasses().that().resideInAPackage(BASE + ".common..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        BASE + ".datasource..", BASE + ".settings..", BASE + ".identity..", BASE + ".media..",
                        BASE + ".reminders..")
                .check(classes);
    }

    @Test
    void timeComesFromAClock() {
        // reminders fire at 09:00 in the user's zone; now() without a Clock cannot be tested or pinned to that zone
        noClasses().should().callMethodWhere(DescribedPredicate.describe("is a parameterless now()", call ->
                call.getName().equals("now") && call.getTarget().getRawParameterTypes().isEmpty()
                        && call.getTargetOwner().isAssignableTo(Temporal.class)))
                .check(classes);
    }

    @Test
    void constructorInjectionOnly() {
        NO_CLASSES_SHOULD_USE_FIELD_INJECTION.check(classes);
    }

    @Test
    void noStandardStreams() {
        NO_CLASSES_SHOULD_ACCESS_STANDARD_STREAMS.check(classes);
    }

    private static ArchCondition<JavaMethod> notNative() {
        return new ArchCondition<>("not be a native query") {
            @Override
            public void check(JavaMethod method, ConditionEvents events) {
                boolean nativeQuery = method.getAnnotationOfType(Query.class).nativeQuery();
                events.add(new SimpleConditionEvent(method, !nativeQuery,
                        method.getFullName() + " is a native query"));
            }
        };
    }

    private static ArchCondition<JavaClass> notHaveExactlyOneImplementation() {
        return new ArchCondition<>("not have exactly one implementation") {
            @Override
            public void check(JavaClass type, ConditionEvents events) {
                long implementations = type.getAllSubclasses().stream().filter(c -> !c.isInterface()).count();
                events.add(new SimpleConditionEvent(type, implementations != 1,
                        type.getName() + " has exactly one implementation"));
            }
        };
    }

    private static ArchCondition<JavaClass> beUsedOutsideItsModule() {
        return new ArchCondition<>("be used outside its module") {
            @Override
            public void check(JavaClass type, ConditionEvents events) {
                String module = type.getPackageName();
                boolean used = type.getDirectDependenciesToSelf().stream()
                        .map(d -> d.getOriginClass().getPackageName())
                        .anyMatch(p -> !p.equals(module) && !p.startsWith(module + "."));
                events.add(new SimpleConditionEvent(type, used, type.getName() + " is not used outside " + module));
            }
        };
    }
}
