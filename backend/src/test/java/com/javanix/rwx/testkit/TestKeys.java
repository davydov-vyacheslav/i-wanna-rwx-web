package com.javanix.rwx.testkit;

import com.javanix.rwx.datasource.internal.provider.persistence.UserSourceKeyEntity;
import com.javanix.rwx.datasource.internal.provider.persistence.UserSourceKeyRepository;
import java.util.UUID;

/** Seeds a saved data source key straight into the table, without the provider validation of the real save. */
public final class TestKeys {

    public static final String TMDB_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ0ZXN0In0.tmdb_fixture_token_0123456789";

    private TestKeys() {}

    public static void save(UserSourceKeyRepository keys, UUID user, String source, String key) {
        keys.save(new UserSourceKeyEntity(user, source, key));
    }

    /** A new user who saved {@link #TMDB_KEY}. */
    public static TestUsers.TestUser userWithTmdbKey(TestUsers users, UserSourceKeyRepository keys) {
        var user = users.create();
        save(keys, user.id(), "tmdb", TMDB_KEY);
        return user;
    }
}
