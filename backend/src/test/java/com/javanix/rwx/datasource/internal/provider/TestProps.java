package com.javanix.rwx.datasource.internal.provider;

import com.github.benmanes.caffeine.cache.Cache;
import java.time.Duration;

public final class TestProps {

    private TestProps() {}

    public static Cache<String, Object> cache(boolean enabled) {
        return DataSourceConfig.newCache(new DataSourceProperties.Cache(enabled, Duration.ofMinutes(10), 1000));
    }
}
