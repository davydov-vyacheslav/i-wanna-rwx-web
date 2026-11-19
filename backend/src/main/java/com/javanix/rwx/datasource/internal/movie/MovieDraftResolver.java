package com.javanix.rwx.datasource.internal.movie;

import com.javanix.rwx.api.model.MovieSourceId;
import com.javanix.rwx.datasource.MediaResolver;
import com.javanix.rwx.datasource.internal.AbstractDraftResolver;
import com.javanix.rwx.datasource.MovieItem;
import com.javanix.rwx.datasource.MovieRef;
import com.javanix.rwx.datasource.MovieType;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

@Component
@Qualifier(MediaResolver.DRAFT)
public class MovieDraftResolver extends AbstractDraftResolver<MovieRef, MovieItem> {

    @Override
    protected MovieRef ref(String text) {
        return new MovieRef(MovieSourceId.DRAFT, MovieType.MOVIE, text);
    }

    @Override
    protected MovieItem item(MovieRef ref, String text) {
        return new MovieItem(ref, build(text), text, null, null, null, null, null, null, null);
    }
}
