# Review lessons

Remarks the owner made in review, kept so they are not made twice. Read before writing code; the reviewer checks a diff against this list. Rules marked **[test]** are enforced by `ArchitectureTests` (backend); the rest are judgement.

Adding a rule: every owner remark becomes a rule here, or a test if a machine can check it. Keep the list short (about 20); merge or drop rules that stopped coming up. Success is that the same remark does not return.

Before reporting a task done, answer in the report: which platform or library facility did I check before writing my own, which classes or interfaces are used in exactly one place, what did this change make redundant and delete.

## Use the platform first

1. **Spring, the JDK or the generated contract already does it.** Check before writing a helper: derived queries, `@Lock`, `@Modifying`, Bean Validation, `ProblemDetail`, `@ConfigurationProperties` records, `RestClient` and HTTP interface clients, `ApplicationEvent`s, `Clock`, `Math.clamp`, `Objects`, `Optional`, stream collectors. Hand-rolled parsing, normalization, JSON, URL or header handling is almost always a rejected idea (past: `Text`, `StrictUrl`, `AcceptLanguage`, `Json`, `ResolveDeadline`, `CatalogNormalizer`).
2. **No native queries or hand-written JDBC where JPA works.** Derived query, then JPQL, then `@Lock`/`@Modifying`; a lock is `@Lock(PESSIMISTIC_WRITE)`, not SQL (past: `UserLock`, `findLiveTitles`). **[test]** no `nativeQuery`, no `JdbcTemplate`/`JdbcClient`.
3. **Declarative over imperative.** Validation on the contract and constraints, concurrency and retry limits as annotations (`@ConcurrencyLimit`), config as properties; not `if` ladders in services. Frontend: use TanStack Query's cache, invalidation and retries instead of a hand-made store.

## No accidental structure

4. **No interface with one implementation.** It is a layer, not an abstraction. Extract an interface when a second implementation exists (three uses justify an abstraction, two are a coincidence). MapStruct mappers, repositories and HTTP clients are exempt. **[test]** frozen baseline in `archunit_store`; do not add to it.
5. **No class used in exactly one place** (past: `SignUpLocale`, a `Provider` enum, thin `Catalog`/`Sources`/`Hit` wrappers). Inline it, make it a private method or a nested record. Ask "why does this class exist?" before the owner does.
6. **Merge near-duplicates.** Two nearly identical exceptions or flows become one (past: `UnsupportedSourceException` replaced by `InvalidRequestException`; the duplicated `MediaService` invariants). Parallel resources (book, movie) share one implementation parameterized by kind; test shared behaviour once, parameterized, not per kind.
7. **No duplicated constants** (past: locale sets). One definition, referenced.
8. **No speculative config, branches or switches** (past: `allowHttp`): nothing produces the case, nothing needs the knob. No retries, caches or limits the spec did not ask for.
9. **Delete what the change makes redundant**, including tests and spec lines. Prefer removing to adding.

## Where code lives

10. **Module root is the published API only.** Everything else goes into a feature sub-package (`media.book`, `media.movie`) or the module's `common` sub-package; no new public class in the root (past: `TitleKey` exposure). **[test]** a root class nobody outside the module uses is reported (frozen baseline; do not add to it).
11. **Errors shared across modules live in `common`.** `common` depends on no feature module. **[test]**
12. **Modulith boundaries:** modules talk through published APIs and events, never another module's repositories or entities (`PlatformTests.modulesAreWellFormed`). Inside a module, sub-package dependencies are checked too (`PackageStructureTests`).

## Hygiene

13. **Constructor injection only; no `System.out`.** **[test]**
14. **Comments say why, not what**, and are sparse. No restating the code, no task or phase references in code.
15. **Never log or return secrets** (license keys, provider API keys, tokens, user queries); a test proves it for new provider calls (`ProviderClientsTests`).
16. **Tests assert behaviour once, on real Postgres.** No mocking the database; WireMock only for external HTTP. Do not duplicate a test per kind or per layer.
