package com.javanix.rwx.media.book;

import com.javanix.rwx.api.model.Book;
import java.net.URI;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
interface BookApiMapper {

    @Mapping(target = "isFavorite", source = "favorite")
    Book toApi(BookEntity book);

    // generated enums are named PLANNED/SEEN with the wire value "planned"; name-based mapping would not match
    default Book.StatusEnum status(String status) {
        return Book.StatusEnum.fromValue(status);
    }

    default URI uri(String value) {
        return value == null ? null : URI.create(value);
    }

    default OffsetDateTime utc(Instant instant) {
        return instant == null ? null : instant.atOffset(ZoneOffset.UTC);
    }
}
