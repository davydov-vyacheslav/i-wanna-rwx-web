package com.javanix.rwx.datasource;

/** What identifies an item on a data source: the source and its id there. */
public interface MediaRef {

    /** The wire id of the source, e.g. {@code open_library}. */
    String sourceId();

    String externalId();
}
