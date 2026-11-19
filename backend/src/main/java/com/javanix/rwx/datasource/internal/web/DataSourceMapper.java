package com.javanix.rwx.datasource.internal.web;

import com.javanix.rwx.api.model.DataSource;
import com.javanix.rwx.api.model.DataSourceId;
import com.javanix.rwx.api.model.DataSources;
import com.javanix.rwx.api.model.ResourceType;
import com.javanix.rwx.datasource.internal.provider.UserDataSourceService.SourceState;
import java.util.List;
import java.util.Map;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
interface DataSourceMapper {

    default DataSources toApi(Map<ResourceType, List<SourceState>> lists) {
        return new DataSources(toApi(lists.get(ResourceType.BOOK)), toApi(lists.get(ResourceType.MOVIE)));
    }

    List<DataSource> toApi(List<SourceState> states);

    // SourceInfo is a behaviour interface (id(), label()), not a bean, so MapStruct cannot read it by property
    @Mapping(target = "id", expression = "java(sourceId(state.source().id()))")
    @Mapping(target = "label", expression = "java(state.source().label())")
    @Mapping(target = "requiresKey", expression = "java(state.source().requiresKey())")
    @Mapping(target = "isDefault", source = "isDefault")
    @Mapping(target = "isEffective", source = "isEffective")
    DataSource toApi(SourceState state);

    default DataSourceId sourceId(String id) {
        return DataSourceId.fromValue(id);
    }
}
