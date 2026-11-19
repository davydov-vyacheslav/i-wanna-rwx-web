package com.javanix.rwx.media.movie;

import com.javanix.rwx.api.model.MovieSourceId;
import com.javanix.rwx.common.InvalidRequestException;
import com.javanix.rwx.common.Violation;
import com.javanix.rwx.common.validators.HttpUrls;
import com.javanix.rwx.datasource.MediaResolver;
import com.javanix.rwx.datasource.MovieItem;
import com.javanix.rwx.datasource.MovieRef;
import com.javanix.rwx.datasource.MovieType;
import com.javanix.rwx.identity.UserLock;
import com.javanix.rwx.media.common.MediaService;
import com.javanix.rwx.media.common.TitleKey;
import java.math.BigDecimal;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/** The user's movies and TV shows. Entities and repository are package-private, so the controller lives in this package. */
@Service
class MovieService extends MediaService<MovieEntity, MovieRef, MovieItem> {

    private final MovieRepository movies;

    MovieService(MovieRepository movies, @Qualifier(MediaResolver.DRAFT) MediaResolver<MovieRef, MovieItem> drafts,
            MediaResolver<MovieRef, MovieItem> catalog, UserLock userLock, Clock clock, TransactionTemplate tx) {
        super(movies, drafts, catalog, userLock, clock, tx);
        this.movies = movies;
    }

    @Override
    protected Optional<MovieEntity> findByIdentity(UUID userId, MovieRef ref) {
        return movies.findByUserIdAndSourceAndTypeAndExternalIdAndDeletedAtIsNull(userId, ref.source(),
                ref.type().value(), ref.externalId());
    }

    @Override
    protected boolean isStorable(MovieItem item) {
        var rating = item.rating();
        // the API mapper turns the stored text into a URI
        return (item.posterUrl() == null || HttpUrls.parse(item.posterUrl()).isPresent())
                && (rating == null || rating.signum() >= 0 && rating.compareTo(BigDecimal.TEN) <= 0)
                && !(item.ref().type() == MovieType.MOVIE && (item.tvStatus() != null || item.seasonCount() != null));
    }

    @Override
    protected MovieEntity newEntity(UUID userId, UUID id, String externalId, MovieItem item, Clock clock) {
        return new MovieEntity(userId, id, externalId, item, clock.instant());
    }

    /**
     * Every item clashes on (source, type, externalId), so movie 1396 and tv 1396 coexist; a draft also clashes with
     * ANY live title or original title of the list, while a real item is not blocked by a same-titled draft.
     */
    @Override
    protected Optional<UUID> findDuplicate(UUID userId, MovieItem item, String externalId) {
        var source = item.ref().source();
        var clash = movies.findByUserIdAndSourceAndTypeAndExternalIdAndDeletedAtIsNull(userId, source,
                item.ref().type().value(), externalId).map(MovieEntity::getId);
        if (clash.isEmpty() && source == MovieSourceId.DRAFT) {
            var key = TitleKey.of(item.title());
            clash = movies.findByUserIdAndDeletedAtIsNull(userId).stream()
                    .filter(t -> TitleKey.of(t.getTitle()).equals(key)
                            || t.getOriginalTitle() != null && TitleKey.of(t.getOriginalTitle()).equals(key))
                    .map(MovieRepository.LiveTitle::getId).findFirst();
        }
        return clash;
    }

    @Transactional
    MovieEntity patch(UUID userId, UUID id, String status, Boolean favorite, Integer seasonCount, String tvStatus) {
        var movie = lockLive(userId, id);
        // the stored type decides, so this runs after the lookup
        if (!"tv".equals(movie.getType())) {
            var violations = new ArrayList<Violation>();
            if (seasonCount != null) {
                violations.add(new Violation("seasonCount", "is only allowed for tv items"));
            }
            if (tvStatus != null) {
                violations.add(new Violation("tvStatus", "is only allowed for tv items"));
            }
            if (!violations.isEmpty()) {
                throw new InvalidRequestException(violations);
            }
        }
        if (movie.apply(status, favorite, seasonCount, tvStatus, clock().instant())) {
            save(movie);
        }
        return movie;
    }
}
