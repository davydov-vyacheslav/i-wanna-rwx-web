package com.javanix.rwx.media.movie;

import com.javanix.rwx.api.model.MovieSourceId;
import com.javanix.rwx.datasource.MovieItem;
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
@Table(name = "movies")
@IdClass(MovieKey.class)
class MovieEntity extends MediaEntity {

    @Column(name = "original_title")
    private String originalTitle;

    private Integer year;

    @Column(precision = 3, scale = 1)
    private BigDecimal rating;

    @Column(nullable = false, updatable = false)
    private String type;

    @Column(name = "season_count")
    private Integer seasonCount;

    @Column(name = "tv_status")
    private String tvStatus;

    @Column(name = "poster_url")
    private String posterUrl;

    @Convert(converter = MovieSourceConverter.class)
    @Column(nullable = false, updatable = false)
    private MovieSourceId source;

    protected MovieEntity() {
    }

    MovieEntity(UUID userId, UUID id, String externalId, MovieItem item, Instant now) {
        super(userId, id, externalId, item.externalLink(), item.title(), item.description(), now);
        this.source = item.ref().source();
        this.type = item.ref().type().value();
        this.originalTitle = item.originalTitle();
        this.year = item.year();
        this.rating = item.rating();
        this.posterUrl = item.posterUrl();
        this.seasonCount = item.seasonCount();
        this.tvStatus = item.tvStatus() == null ? null : item.tvStatus().value();
    }

    /**
     * Applies the non-null fields; false, touching nothing, when they equal the stored values (no UPDATE, no version
     * bump). The caller has checked that the season fields only come with type tv.
     */
    boolean apply(String newStatus, Boolean newFavorite, Integer newSeasonCount, String newTvStatus, Instant now) {
        var changed = applyCommon(newStatus, newFavorite);
        if (newSeasonCount != null && !newSeasonCount.equals(seasonCount)) {
            seasonCount = newSeasonCount;
            changed = true;
        }
        if (newTvStatus != null && !newTvStatus.equals(tvStatus)) {
            tvStatus = newTvStatus;
            changed = true;
        }
        if (changed) {
            touch(now);
        }
        return changed;
    }

    public String getOriginalTitle() {
        return originalTitle;
    }

    public Integer getYear() {
        return year;
    }

    public BigDecimal getRating() {
        return rating;
    }

    public String getType() {
        return type;
    }

    public Integer getSeasonCount() {
        return seasonCount;
    }

    public String getTvStatus() {
        return tvStatus;
    }

    public String getPosterUrl() {
        return posterUrl;
    }

    public MovieSourceId getSource() {
        return source;
    }
}
