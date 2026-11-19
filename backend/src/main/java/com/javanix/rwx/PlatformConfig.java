package com.javanix.rwx;

import java.time.Clock;
import java.time.Duration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class PlatformConfig {

    // Server-side timestamps come from here, never the client's. Truncated to microseconds because Postgres
    // timestamptz keeps no more: a response must equal what a later read returns.
    @Bean
    Clock clock() {
        return Clock.tick(Clock.systemUTC(), Duration.ofNanos(1000));
    }
}
