/**
 * Module "identity": users, credentials, the authenticated-user contract. Published API is
 * this package ({@link com.javanix.rwx.identity.CurrentUser}, {@link com.javanix.rwx.identity.CurrentUserProvider},
 * the {@link com.javanix.rwx.identity.UserCreatedEvent} and the {@link com.javanix.rwx.identity.AccountExportContributor}
 * that other modules listen to or implement);
 * entities, repositories and security wiring live in sub-packages and are internal.
 */
@ApplicationModule(displayName = "Identity", allowedDependencies = {"common", "api"})
package com.javanix.rwx.identity;

import org.springframework.modulith.ApplicationModule;
