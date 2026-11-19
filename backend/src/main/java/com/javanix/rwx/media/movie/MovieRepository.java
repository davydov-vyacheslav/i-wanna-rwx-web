package com.javanix.rwx.media.movie;

import com.javanix.rwx.api.model.MovieSourceId;
import com.javanix.rwx.media.common.MediaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface MovieRepository extends MediaRepository<MovieEntity, MovieKey> {

    /** TMDb movie and tv ids are separate namespaces, so the type is part of the key. */
    Optional<MovieEntity> findByUserIdAndSourceAndTypeAndExternalIdAndDeletedAtIsNull(UUID userId,
            MovieSourceId source, String type, String externalId);

    /** Titles only: the draft rule compares them in Java (NFC, lower case by Locale.ROOT), which SQL collations do not. */
    List<LiveTitle> findByUserIdAndDeletedAtIsNull(UUID userId);

    interface LiveTitle {

        UUID getId();

        String getTitle();

        String getOriginalTitle();
    }
}
