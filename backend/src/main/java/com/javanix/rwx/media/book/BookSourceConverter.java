package com.javanix.rwx.media.book;

import com.javanix.rwx.api.model.BookSourceId;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** The database holds the lowercase wire id ({@code open_library}), not the constant name, so not {@code @Enumerated}. */
@Converter
class BookSourceConverter implements AttributeConverter<BookSourceId, String> {

    @Override
    public String convertToDatabaseColumn(BookSourceId source) {
        return source == null ? null : source.getValue();
    }

    @Override
    public BookSourceId convertToEntityAttribute(String value) {
        return value == null ? null : BookSourceId.fromValue(value);
    }
}
