plugins {
    java
    alias(libs.plugins.spring.boot)
    alias(libs.plugins.openapi.generator)
}

group = "com.javanix"
version = "0.1.0"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(25)
    }
}

repositories {
    mavenCentral()
}


dependencies {
    implementation(platform(org.springframework.boot.gradle.plugin.SpringBootPlugin.BOM_COORDINATES))
    implementation(platform(libs.spring.modulith.bom))

    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.springframework.boot:spring-boot-starter-restclient")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-flyway")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-security-oauth2-client")
    implementation("org.springframework.boot:spring-boot-starter-session-jdbc")
    implementation("org.springframework.modulith:spring-modulith-starter-core")

    implementation("com.github.ben-manes.caffeine:caffeine")
    implementation("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql")

    implementation("org.mapstruct:mapstruct:1.6.3")
    annotationProcessor("org.mapstruct:mapstruct-processor:1.6.3")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("org.springframework.boot:spring-boot-testcontainers")
    testImplementation("org.springframework.security:spring-security-test")
    testImplementation("org.testcontainers:testcontainers")
    testImplementation("org.testcontainers:testcontainers-postgresql")
    testImplementation("org.testcontainers:testcontainers-junit-jupiter")
    testImplementation("org.springframework.modulith:spring-modulith-starter-test")
    // the only allowed stub, and only for external HTTP (provider APIs); standalone shades Jetty and Jackson
    testImplementation(libs.wiremock.standalone)
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

springBoot {
    buildInfo()
}

tasks.bootJar {
    archiveFileName = "rwx.jar"
}

tasks.processResources {
    providers.gradleProperty("frontendDist").orNull?.let { dist ->
        from(dist) { into("static") }
    }
}

tasks.test {
    useJUnitPlatform()
}

val openApiOutput = layout.buildDirectory.dir("generated/openapi")

openApiGenerate {
    generatorName = "spring"
    library = "spring-boot"
    inputSpec = layout.projectDirectory.file("../api/openapi.yaml")
    outputDir = openApiOutput
    apiPackage = "com.javanix.rwx.api"
    modelPackage = "com.javanix.rwx.api.model"
    // only the api and model classes; no Application/config/pom supporting files
    globalProperties = mapOf("apis" to "", "models" to "", "supportingFiles" to "false")
    configOptions = mapOf(
        "interfaceOnly" to "true",
        "useSpringBoot3" to "true",
        "useTags" to "true",
        "delegatePattern" to "false",
        "skipDefaultInterface" to "true",
        "useBeanValidation" to "true",
        "openApiNullable" to "false",
        "documentationProvider" to "none",
        "annotationLibrary" to "none",
        "dateLibrary" to "java8",
        "useResponseEntity" to "true",
    )
}

sourceSets.main {
    java.srcDir(openApiOutput.map { it.dir("src/main/java") })
}

tasks.compileJava {
    dependsOn(tasks.openApiGenerate)
}
