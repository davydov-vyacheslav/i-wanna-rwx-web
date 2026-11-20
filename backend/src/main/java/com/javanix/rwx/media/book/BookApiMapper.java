package com.javanix.rwx.media.book;

import com.javanix.rwx.api.model.Book;
import com.javanix.rwx.common.ApiMapping;
import java.net.URI;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring", uses = ApiMapping.class)
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
}
