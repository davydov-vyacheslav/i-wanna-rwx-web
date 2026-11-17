package com.javanix.rwx.testkit;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.event.RecordApplicationEvents;

/**
 * Full-stack test on real Postgres, GitHub stub and MockMvc. Every class using it shares one cached Spring
 * context, so do not add per-class configuration (properties, extra beans) to it.
 *
 * <p>Testkit, reused by every module: inject {@link Api} and {@link TestUsers}.
 * <pre>{@code
 * var f = users.two();                                        // users A and B, each with a real session
 * api.as(f.a()).post("/api/v1/books", body).expect(201);      // CSRF token is added to non-GET calls
 * api.as(f.b()).get("/api/v1/books/" + id).expectNotFound();  // isolation check: 404 problem+json
 * api.get("/api/v1/me").expectProblem(401, "unauthorized");   // anonymous
 * api.as(f.a()).noCsrf().delete(path).expectProblem(403, "csrf");
 * }</pre>
 * Test data is never cleaned up; ids are random, so assert on your own users' rows only.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@SpringBootTest
@AutoConfigureMockMvc
@RecordApplicationEvents
@Import(TestInfra.class)
public @interface IntegrationTest {
}
