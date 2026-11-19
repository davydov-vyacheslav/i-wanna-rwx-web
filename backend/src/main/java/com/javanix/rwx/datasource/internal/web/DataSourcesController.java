package com.javanix.rwx.datasource.internal.web;

import com.javanix.rwx.api.DataSourcesApi;
import com.javanix.rwx.api.model.DataSourceId;
import com.javanix.rwx.api.model.DataSources;
import com.javanix.rwx.api.model.ResourceType;
import com.javanix.rwx.api.model.SaveDataSourceKeyRequest;
import com.javanix.rwx.datasource.internal.provider.UserDataSourceService;
import com.javanix.rwx.identity.CurrentUserProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Thin: the user comes from the session (no user or row id in any path), the rules live in the service. */
@RestController
class DataSourcesController implements DataSourcesApi {

    private final CurrentUserProvider currentUser;
    private final UserDataSourceService sources;
    private final DataSourceMapper mapper;

    DataSourcesController(CurrentUserProvider currentUser, UserDataSourceService sources, DataSourceMapper mapper) {
        this.currentUser = currentUser;
        this.sources = sources;
        this.mapper = mapper;
    }

    @Override
    public ResponseEntity<DataSources> listDataSources() {
        return ResponseEntity.ok(mapper.toApi(sources.list(currentUser.current().id())));
    }

    @Override
    public ResponseEntity<DataSources> setDefaultDataSource(ResourceType resourceType, DataSourceId source) {
        return ResponseEntity.ok(mapper.toApi(sources.setDefault(currentUser.current().id(), resourceType, source.getValue())));
    }

    @Override
    public ResponseEntity<DataSources> saveDataSourceKey(ResourceType resourceType, DataSourceId source,
            SaveDataSourceKeyRequest request) {
        return ResponseEntity.ok(mapper.toApi(sources.saveKey(currentUser.current().id(), resourceType, source.getValue(),
                request.getApiKey())));
    }

    @Override
    public ResponseEntity<DataSources> deleteDataSourceKey(ResourceType resourceType, DataSourceId source) {
        return ResponseEntity.ok(mapper.toApi(sources.deleteKey(currentUser.current().id(), resourceType, source.getValue())));
    }
}
