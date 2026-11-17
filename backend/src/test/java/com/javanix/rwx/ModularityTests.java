package com.javanix.rwx;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;

class ModularityTests {

    @Test
    void modulesAreWellFormed() {
        ApplicationModules.of(RwxApplication.class).verify();
    }
}
