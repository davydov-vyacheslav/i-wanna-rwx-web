/**
 * Shared kernel: generic domain exceptions and the one problem+json advice that maps them. An open module, so any
 * module may use everything here; it depends on no other module. Module-specific exceptions (a duplicate, an
 * invalid setting) stay in their module and are mapped there, with {@link com.javanix.rwx.common.Problems}.
 */
@ApplicationModule(displayName = "Common", type = ApplicationModule.Type.OPEN)
package com.javanix.rwx.common;

import org.springframework.modulith.ApplicationModule;
