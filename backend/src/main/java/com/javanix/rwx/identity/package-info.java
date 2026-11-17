/**
 * Module "identity": users, credentials, per-user settings and the authenticated-user contract. Published API is
 * this package ({@link com.javanix.rwx.identity.CurrentUser}, {@link com.javanix.rwx.identity.CurrentUserProvider});
 * entities, repositories and security wiring live in sub-packages and are internal.
 */
@ApplicationModule(displayName = "Identity")
package com.javanix.rwx.identity;

import org.springframework.modulith.ApplicationModule;
