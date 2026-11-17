# syntax=docker/dockerfile:1
FROM node:24-alpine AS frontend-build
WORKDIR /app
COPY api/ api/
COPY frontend/ frontend/
WORKDIR /app/frontend
# .npmrc (legacy-peer-deps) is read from frontend/
RUN --mount=type=cache,target=/root/.npm npm ci
RUN npm run build

FROM gradle:9.9.1-jdk25 AS backend-build
WORKDIR /src
COPY backend/ backend/
COPY api/ api/
COPY --from=frontend-build /app/frontend/dist /frontend-dist
WORKDIR /src/backend
# the wrapper pins the Gradle version; the image only supplies JDK 25
RUN --mount=type=cache,target=/root/.gradle \
    ./gradlew bootJar -PfrontendDist=/frontend-dist --no-daemon

FROM eclipse-temurin:25-jre
RUN groupadd --system rwx && useradd --system --gid rwx --no-create-home rwx
WORKDIR /app
COPY --from=backend-build /src/backend/build/libs/rwx.jar /app/rwx.jar
USER rwx
# heap = 75% of the container memory limit (JVM default is 25%)
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/rwx.jar"]
