package com.javanix.rwx.reminders.license;

import com.javanix.rwx.api.model.CreateLicenseRequest;
import com.javanix.rwx.api.model.License;
import com.javanix.rwx.api.model.UpdateLicenseRequest;
import com.javanix.rwx.common.ApiMapping;
import com.javanix.rwx.reminders.common.ReminderEntity;
import com.javanix.rwx.reminders.common.RenewalPatternMapping;
import org.mapstruct.Mapper;

@Mapper(componentModel = "spring", uses = {ApiMapping.class, RenewalPatternMapping.class})
interface LicenseApiMapper {

    License toApi(LicenseEntity license);

    ReminderEntity.Fields toFields(CreateLicenseRequest request);

    ReminderEntity.Fields toFields(UpdateLicenseRequest request);
}
