package com.javanix.rwx.identity.internal.web;

import com.javanix.rwx.api.MeApi;
import com.javanix.rwx.api.model.AccountExport;
import com.javanix.rwx.api.model.Me;
import com.javanix.rwx.identity.AccountExportContributor;
import com.javanix.rwx.identity.CurrentUserProvider;
import com.javanix.rwx.identity.internal.AccountService;
import jakarta.servlet.http.HttpSession;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.function.Function;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
class MeController implements MeApi {

    private final CurrentUserProvider currentUser;
    private final AccountService accounts;
    private final IdentityMapper mapper;
    private final List<AccountExportContributor> contributors;
    // Spring's injectable proxy for the current request's session
    private final HttpSession session;
    private final Clock clock;

    MeController(CurrentUserProvider currentUser, AccountService accounts, IdentityMapper mapper,
            List<AccountExportContributor> contributors, HttpSession session, Clock clock) {
        this.currentUser = currentUser;
        this.accounts = accounts;
        this.mapper = mapper;
        this.contributors = contributors;
        this.session = session;
        this.clock = clock;
    }

    @Override
    public ResponseEntity<Me> getMe() {
        var id = currentUser.current().id();
        return ResponseEntity.ok(mapper.toMe(id, accounts.profile(id)));
    }

    @Override
    public ResponseEntity<Void> deleteMe() {
        accounts.delete(currentUser.current().id());
        session.invalidate();
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<AccountExport> exportMe() {
        var id = currentUser.current().id();
        var settings = contributors.stream().flatMap(c -> c.settings(id).stream()).findFirst()
                .orElseThrow(() -> new IllegalStateException("no settings contributor"));
        var exportedAt = OffsetDateTime.now(clock.withZone(ZoneOffset.UTC));
        var export = new AccountExport(exportedAt, mapper.toMe(id, accounts.profile(id)),
                settings, flatten(c -> c.dataSources(id)), flatten(c -> c.books(id)), flatten(c -> c.movies(id)),
                flatten(c -> c.subscriptions(id)), flatten(c -> c.licenses(id)));
        var disposition = ContentDisposition.attachment()
                .filename("rwx-export-" + exportedAt.toLocalDate() + ".json").build();
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString()).body(export);
    }

    private <T> List<T> flatten(Function<AccountExportContributor, List<T>> section) {
        return contributors.stream().flatMap(c -> section.apply(c).stream()).toList();
    }
}
