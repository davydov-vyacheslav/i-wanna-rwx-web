package com.javanix.rwx.datasource;



/** Movie or TV series; part of a movie's identity (the same provider number can exist as both). */
public enum MovieType {
    MOVIE("movie"), TV("tv");

    private final String value;

    MovieType(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }
}
