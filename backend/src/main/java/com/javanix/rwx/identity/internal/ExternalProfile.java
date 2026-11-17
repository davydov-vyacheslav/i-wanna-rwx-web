package com.javanix.rwx.identity.internal;

/**
 * What we keep from an identity provider: the immutable provider-side id plus display metadata. Never a token.
 * {@code provider} is the credential type ({@code github} for now).
 */
public record ExternalProfile(String provider, String externalId, String login, String name, String avatarUrl) {
}
