package com.javanix.rwx.media.common;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.javanix.rwx.datasource.MediaResolver;
import java.util.UUID;

/**
 * What the shared media tests need from one resource type; implemented next to the package-private service of each
 * type (as a test component, so the shared tests can run for every type via {@link EachKind}).
 */
public interface MediaKind {

    /** The name of the test case. */
    String name();

    String path();

    String table();

    /** The key of this type's list in the account export. */
    String exportKey();

    /** A status the API of this type rejects. */
    String invalidStatus();

    MediaService<?, ?, ?> service();

    MediaResolver<?, ?> drafts();

    MediaResolver<?, ?> catalog();

    /** The service of this type around other resolvers. */
    MediaService<?, ?, ?> service(MediaResolver<?, ?> drafts, MediaResolver<?, ?> catalog);

    MediaEntity patch(UUID user, UUID id, String status, Boolean favorite);

    /** A live provider-sourced row, which the create path cannot produce until media-search. */
    UUID seed(UUID user, String title);

    /** A resolver that identifies every URL as one new item and resolves it to the given content. */
    MediaResolver<?, ?> provider(String title, String imageUrl);

    /** An entity as the create path builds it from a provider item with this description. */
    MediaEntity entity(String description);

    /** Stubs the provider for an id no other test uses, saves what the user needs to call it, returns its URL. */
    String stubProviderUrl(WireMockServer provider, UUID user);
}
