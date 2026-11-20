/**
 * Module "reminders": the user's subscriptions and licenses, one feature sub-package each ({@code reminders.subscription},
 * {@code reminders.license}) holding its entity, repository, service, controller and export block;
 * {@code reminders.common} holds what both share (entity base with the renewal arithmetic, repository base, the generic
 * service). The module root stays the published API and is empty. Depends on identity, common and the generated api
 * contract only; services, entities and repositories are package-private. Nothing is scheduled or sent.
 */
@ApplicationModule(displayName = "Reminders", allowedDependencies = {"identity", "common", "api"})
package com.javanix.rwx.reminders;

import org.springframework.modulith.ApplicationModule;
