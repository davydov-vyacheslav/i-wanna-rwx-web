package com.javanix.rwx.media.book;

import com.javanix.rwx.api.model.BookSourceId;
import com.javanix.rwx.datasource.BookItem;
import com.javanix.rwx.media.common.MediaEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "books")
@IdClass(BookKey.class)
class BookEntity extends MediaEntity {

    private String author;

    private Integer year;

    @Column(precision = 2, scale = 1)
    private BigDecimal rating;

    @Column(name = "cover_url")
    private String coverUrl;

    @Column(updatable = false)
    private String isbn;

    @Convert(converter = BookSourceConverter.class)
    @Column(nullable = false, updatable = false)
    private BookSourceId source;

    protected BookEntity() {
    }

    BookEntity(UUID userId, UUID id, BookSourceId source, String externalId, String isbn, BookItem item,
            Instant now) {
        super(userId, id, externalId, item.externalLink(), item.title(), item.description(), now);
        this.source = source;
        this.isbn = isbn;
        this.author = item.author();
        this.year = item.year();
        this.rating = item.rating();
        this.coverUrl = item.coverUrl();
    }

    /** Applies the non-null fields; false, touching nothing, when they equal the stored values (no UPDATE, no version bump). */
    boolean apply(String newStatus, Boolean newFavorite, Instant now) {
        if (!applyCommon(newStatus, newFavorite)) {
            return false;
        }
        touch(now);
        return true;
    }

    public String getAuthor() {
        return author;
    }

    public Integer getYear() {
        return year;
    }

    public BigDecimal getRating() {
        return rating;
    }

    public String getCoverUrl() {
        return coverUrl;
    }

    public String getIsbn() {
        return isbn;
    }

    public BookSourceId getSource() {
        return source;
    }
}
