package com.javanix.rwx.reminders.license;

import com.javanix.rwx.api.LicensesApi;
import com.javanix.rwx.api.model.CreateLicenseRequest;
import com.javanix.rwx.api.model.RenewRequest;
import com.javanix.rwx.api.model.License;
import com.javanix.rwx.api.model.UpdateLicenseRequest;
import com.javanix.rwx.identity.CurrentUserProvider;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
class LicenseController implements LicensesApi {

    private final CurrentUserProvider currentUser;
    private final LicenseService licenses;
    private final LicenseApiMapper mapper;

    LicenseController(CurrentUserProvider currentUser, LicenseService licenses,
            LicenseApiMapper mapper) {
        this.currentUser = currentUser;
        this.licenses = licenses;
        this.mapper = mapper;
    }

    @Override
    public ResponseEntity<List<License>> listLicenses() {
        return ResponseEntity.ok(licenses.list(currentUser.current().id()).stream().map(mapper::toApi).toList());
    }

    @Override
    public ResponseEntity<License> createLicense(CreateLicenseRequest request) {
        var result = licenses.create(currentUser.current().id(), request.getId(), mapper.toFields(request));
        var status = result.created() ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(mapper.toApi(result.entity()));
    }

    @Override
    public ResponseEntity<License> getLicense(UUID id) {
        return ResponseEntity.ok(mapper.toApi(licenses.get(currentUser.current().id(), id)));
    }

    @Override
    public ResponseEntity<License> updateLicense(UUID id, UpdateLicenseRequest request) {
        return ResponseEntity.ok(mapper.toApi(
                licenses.patch(currentUser.current().id(), id, mapper.toFields(request))));
    }

    @Override
    public ResponseEntity<Void> deleteLicense(UUID id) {
        licenses.delete(currentUser.current().id(), id);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<License> renewLicense(UUID id, RenewRequest request) {
        return ResponseEntity.ok(mapper.toApi(
                licenses.renew(currentUser.current().id(), id, request.getExpectedExpiryDate())));
    }
}
