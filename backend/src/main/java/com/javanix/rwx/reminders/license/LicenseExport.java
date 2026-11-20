package com.javanix.rwx.reminders.license;

import com.javanix.rwx.api.model.License;
import com.javanix.rwx.identity.AccountExportContributor;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** The licenses block of {@code GET /me/export}: live items only. */
@Component
class LicenseExport implements AccountExportContributor {

    private final LicenseService licenses;
    private final LicenseApiMapper mapper;

    LicenseExport(LicenseService licenses, LicenseApiMapper mapper) {
        this.licenses = licenses;
        this.mapper = mapper;
    }

    @Override
    public List<License> licenses(UUID userId) {
        return licenses.list(userId).stream().map(mapper::toApi).toList();
    }
}
