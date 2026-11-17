package com.javanix.rwx.identity.internal.web;

import com.javanix.rwx.api.MeApi;
import com.javanix.rwx.api.model.AccountExport;
import com.javanix.rwx.api.model.Me;
import com.javanix.rwx.api.model.UpdateMeRequest;
import com.javanix.rwx.identity.AccountExportContributor;
import com.javanix.rwx.identity.CurrentUserProvider;
import com.javanix.rwx.identity.internal.AccountService;
import jakarta.servlet.http.HttpSession;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.function.Function;
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

    MeController(CurrentUserProvider currentUser, AccountService accounts, IdentityMapper mapper,
            List<AccountExportContributor> contributors, HttpSession session) {
        this.currentUser = currentUser;
        this.accounts = accounts;
        this.mapper = mapper;
        this.contributors = contributors;
        this.session = session;
    }

    @Override
    public ResponseEntity<Me> getMe() {
        var id = currentUser.current().id();
        return ResponseEntity.ok(mapper.toMe(accounts.settings(id), accounts.profile(id)));
    }

    @Override
    public ResponseEntity<Me> updateMe(UpdateMeRequest request) {
        var id = currentUser.current().id();
        var locale = request.getLocale() == null ? null : request.getLocale().getValue();
        return ResponseEntity.ok(mapper.toMe(accounts.update(id, request.getTimeZone(), locale, null), accounts.profile(id)));
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
        var settings = accounts.settings(id);
        var export = new AccountExport(OffsetDateTime.now(ZoneOffset.UTC), mapper.toMe(settings, accounts.profile(id)),
                mapper.toSettings(settings), flatten(c -> c.books(id)), flatten(c -> c.movies(id)),
                flatten(c -> c.subscriptions(id)), flatten(c -> c.licenses(id)));
        return ResponseEntity.ok(export);
    }

    private <T> List<T> flatten(Function<AccountExportContributor, List<T>> section) {
        return contributors.stream().flatMap(c -> section.apply(c).stream()).toList();
    }
}
