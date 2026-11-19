package com.javanix.rwx.media.movie;

import com.javanix.rwx.api.model.MovieSourceId;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** The database holds the lowercase wire id, not the constant name, so not {@code @Enumerated}. */
@Converter
class MovieSourceConverter implements AttributeConverter<MovieSourceId, String> {

    @Override
    public String convertToDatabaseColumn(MovieSourceId source) {
        return source == null ? null : source.getValue();
    }

    @Override
    public MovieSourceId convertToEntityAttribute(String value) {
        return value == null ? null : MovieSourceId.fromValue(value);
    }
}
