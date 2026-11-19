package com.javanix.rwx.common;

/** One entry of the problem's {@code errors[]}. */
public record Violation(String field, String message) {
}
