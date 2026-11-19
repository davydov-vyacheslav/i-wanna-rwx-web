package com.javanix.rwx.media.movie;

import com.javanix.rwx.api.model.Movie;
import java.net.URI;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
interface MovieApiMapper {

    @Mapping(target = "isFavorite", source = "favorite")
    Movie toApi(MovieEntity movie);

    // generated enums carry the wire value separately from the constant name; name-based mapping would not match
    default Movie.StatusEnum status(String status) {
        return Movie.StatusEnum.fromValue(status);
    }

    default Movie.TypeEnum type(String type) {
        return Movie.TypeEnum.fromValue(type);
    }

    default Movie.TvStatusEnum tvStatus(String status) {
        return status == null ? null : Movie.TvStatusEnum.fromValue(status);
    }

    default URI uri(String value) {
        return value == null ? null : URI.create(value);
    }

    default OffsetDateTime utc(Instant instant) {
        return instant == null ? null : instant.atOffset(ZoneOffset.UTC);
    }
}
