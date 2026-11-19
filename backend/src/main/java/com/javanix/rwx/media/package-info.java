/**
 * Module "media": the user's book and movie/TV lists, one feature sub-package each ({@code media.book},
 * {@code media.movie}) holding its entity, repository, service, controller and export block; {@code media.common} holds what both
 * share (the entity base, repository base, the generic service with the create flow, {@code TitleKey}); it is internal
 * to the module like every sub-package, and the module root stays the published API. Depends on identity, datasource, common and the generated api contract (controllers implement it) only;
 * services, entities and repositories are package-private. Media never fetches a URL.
 */
@ApplicationModule(displayName = "Media", allowedDependencies = {"identity", "datasource", "common", "api"})
package com.javanix.rwx.media;

import org.springframework.modulith.ApplicationModule;
