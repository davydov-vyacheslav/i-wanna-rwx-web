package com.javanix.rwx.datasource;



public enum TvStatus {
    ONGOING("ongoing"), ENDED("ended");

    private final String value;

    TvStatus(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }
}
