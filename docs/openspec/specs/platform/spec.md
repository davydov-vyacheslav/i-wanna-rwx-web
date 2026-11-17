# platform Specification

Cross-cutting runtime and build behaviour of the single deployable.

## Requirements

### Requirement: Health and reachability
Liveness and readiness SHALL be provided by Spring Boot Actuator: `GET /actuator/health`, `/actuator/health/liveness` and `/actuator/health/readiness`, without authentication. There SHALL be no application ping endpoint. A client MAY use `GET /actuator/health` as a reachability probe. Health responses SHALL NOT expose secrets or configuration values.

#### Scenario: Healthy
- **WHEN** the app and database are up
- **THEN** `GET /actuator/health` returns 200 with status `UP`

#### Scenario: Database down
- **WHEN** the database is unreachable
- **THEN** readiness reports `DOWN` with 503 while liveness stays `UP`

#### Scenario: No ping endpoint
- **WHEN** a client requests `/api/v1/ping`
- **THEN** the response is 404 `application/problem+json`

### Requirement: Contract-first interfaces
Server controller interfaces and TS client types SHALL be generated from `api/openapi.yaml` at build time; generated sources SHALL NOT be committed and SHALL NOT be edited.

#### Scenario: Contract drift
- **WHEN** a controller does not implement the generated interface method for an operation
- **THEN** the backend build fails to compile

### Requirement: Single-artifact serving
The Spring jar SHALL serve the built frontend from `/` and fall back to `index.html` for any GET path outside `/api` and `/actuator` that does not match a static file. Unknown `/api/**` paths SHALL return a 404 problem response, never `index.html`.

#### Scenario: Deep link
- **WHEN** a browser requests `/media/42`
- **THEN** `index.html` is returned with 200

#### Scenario: Unknown API path
- **WHEN** a client requests `/api/v1/nope`
- **THEN** the response is 404 `application/problem+json`

### Requirement: Schema management
Flyway SHALL apply migrations on startup, starting from the baseline `V001__initial_schema.sql`; `V001` MAY be edited in place until the first deploy (no `V002` before then); from the first deploy on, migrations SHALL be append-only (applied files are never edited); Hibernate SHALL only validate the schema, never generate it.

#### Scenario: Fresh database
- **WHEN** the app starts against an empty database
- **THEN** all migrations are applied in order and the app becomes ready

#### Scenario: Schema mismatch
- **WHEN** an entity does not match the migrated schema
- **THEN** startup fails on validation
