package com.javanix.rwx.identity.internal.web;

import com.javanix.rwx.api.model.Me;
import com.javanix.rwx.identity.internal.AccountService.Profile;
import java.net.URI;
import java.util.UUID;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
interface IdentityMapper {

    @Mapping(target = "id", source = "id")
    @Mapping(target = "displayName", source = "profile.displayName")
    @Mapping(target = "avatarUrl", source = "profile.avatarUrl")
    Me toMe(UUID id, Profile profile);

    default URI uri(String value) {
        return value == null ? null : URI.create(value);
    }
}
