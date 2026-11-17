package com.javanix.rwx.identity.internal;

import org.springframework.context.annotation.Configuration;
import org.springframework.resilience.annotation.EnableResilientMethods;

/** Enables {@code @Retryable}, used for the concurrent first-login race in {@link AccountService}. */
@Configuration(proxyBeanMethods = false)
@EnableResilientMethods
class IdentityConfig {
}
