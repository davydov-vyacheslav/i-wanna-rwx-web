package com.javanix.rwx.datasource;

/** A resolved item as its source built it (bounded text, URLs on hosts we fixed). Optional values are null. */
public interface MediaItem<R extends MediaRef> {

    R ref();

    String title();

    /** The link {@code media} stores: the source's canonical URL for {@link #ref()}. */
    String externalLink();
}
