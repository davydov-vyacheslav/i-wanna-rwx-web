package com.javanix.rwx.media.movie;

import com.javanix.rwx.api.model.Movie;
import com.javanix.rwx.common.ApiMapping;
import java.net.URI;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring", uses = ApiMapping.class)
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
}
