package com.javanix.rwx.settings.internal.web;

import com.javanix.rwx.api.model.UserSettings;
import com.javanix.rwx.common.ApiMapping;
import com.javanix.rwx.settings.UserSettingsView;
import org.mapstruct.Mapper;

@Mapper(componentModel = "spring", uses = ApiMapping.class)
interface SettingsMapper {

    UserSettings toSettings(UserSettingsView settings);
}
