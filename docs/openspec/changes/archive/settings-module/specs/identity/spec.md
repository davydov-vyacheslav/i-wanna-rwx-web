## MODIFIED Requirements

### Requirement: Current user abstraction
Domain modules SHALL obtain the acting user only through the published `CurrentUserProvider` (user id), resolved from the security context on every call, and SHALL NOT read user or credential storage or authentication configuration. A user that no longer exists or is disabled SHALL be treated as not authenticated. When there is no user, the provider SHALL signal not-authenticated, mapped to a 401 problem response.

### Requirement: Current user endpoint
`GET /api/v1/me` SHALL return the user id, display name (GitHub name, falling back to the login) and avatar URL (nullable). It SHALL carry no settings.

## REMOVED Requirements

### Requirement: User timezone and locale
Moved to the `settings` capability.
