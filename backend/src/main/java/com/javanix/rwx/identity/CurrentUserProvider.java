package com.javanix.rwx.identity;

/** The only way for other modules to learn who is calling. */
public interface CurrentUserProvider {

    /** @throws NotAuthenticatedException when the request carries no authenticated user */
    CurrentUser current();
}
