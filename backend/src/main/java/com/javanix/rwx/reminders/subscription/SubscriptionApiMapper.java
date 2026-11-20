package com.javanix.rwx.reminders.subscription;

import com.javanix.rwx.api.model.CreateSubscriptionRequest;
import com.javanix.rwx.api.model.Subscription;
import com.javanix.rwx.api.model.UpdateSubscriptionRequest;
import com.javanix.rwx.common.ApiMapping;
import com.javanix.rwx.reminders.common.ReminderEntity;
import com.javanix.rwx.reminders.common.RenewalPatternMapping;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring", uses = {ApiMapping.class, RenewalPatternMapping.class})
interface SubscriptionApiMapper {

    Subscription toApi(SubscriptionEntity subscription);

    @Mapping(target = "licenseKey", ignore = true)
    ReminderEntity.Fields toFields(CreateSubscriptionRequest request);

    @Mapping(target = "licenseKey", ignore = true)
    ReminderEntity.Fields toFields(UpdateSubscriptionRequest request);
}
