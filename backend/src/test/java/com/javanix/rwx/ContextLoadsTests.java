package com.javanix.rwx;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

// ddl-auto=validate runs on startup, so a loaded context means Hibernate validation passed
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class ContextLoadsTests {

    @Autowired
    JdbcClient jdbc;

    @Test
    void baselineMigrationIsApplied() {
        var applied = jdbc.sql("select count(*) from flyway_schema_history where success and version = '001'")
                .query(Integer.class).single();
        assertThat(applied).isEqualTo(1);
    }
}
