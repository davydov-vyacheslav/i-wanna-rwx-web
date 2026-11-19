package com.javanix.rwx.testkit;

import com.javanix.rwx.datasource.internal.provider.persistence.UserSourceKeyEntity;
import com.javanix.rwx.datasource.internal.provider.persistence.UserSourceKeyRepository;
import java.util.UUID;

/** Seeds a saved data source key straight into the table, without the provider validation of the real save. */
public final class TestKeys {

    private TestKeys() {}

    public static void save(UserSourceKeyRepository keys, UUID user, String source, String key) {
        keys.save(new UserSourceKeyEntity(user, source, key));
    }
}
