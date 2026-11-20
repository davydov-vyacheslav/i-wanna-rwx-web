package com.javanix.rwx.reminders.common;

import com.javanix.rwx.api.model.CreateLicenseRequest;
import com.javanix.rwx.api.model.CreateSubscriptionRequest;
import com.javanix.rwx.api.model.License;
import com.javanix.rwx.api.model.Subscription;
import com.javanix.rwx.api.model.UpdateLicenseRequest;
import com.javanix.rwx.api.model.UpdateSubscriptionRequest;

/**
 * The generated enums are named MONTHLY with the wire value "monthly", so MapStruct's name-based mapping would not
 * match; one generated enum per schema, hence one overload each.
 */
public final class RenewalPatternMapping {

    private RenewalPatternMapping() {
    }

    public static Subscription.RenewalPatternEnum subscription(String pattern) {
        return Subscription.RenewalPatternEnum.fromValue(pattern);
    }

    public static License.RenewalPatternEnum license(String pattern) {
        return License.RenewalPatternEnum.fromValue(pattern);
    }

    public static String value(CreateSubscriptionRequest.RenewalPatternEnum pattern) {
        return pattern.getValue();
    }

    public static String value(CreateLicenseRequest.RenewalPatternEnum pattern) {
        return pattern.getValue();
    }

    public static String value(UpdateSubscriptionRequest.RenewalPatternEnum pattern) {
        return pattern == null ? null : pattern.getValue();
    }

    public static String value(UpdateLicenseRequest.RenewalPatternEnum pattern) {
        return pattern == null ? null : pattern.getValue();
    }
}
