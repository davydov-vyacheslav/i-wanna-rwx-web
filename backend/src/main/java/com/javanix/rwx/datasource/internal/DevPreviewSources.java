package com.javanix.rwx.datasource.internal;

import com.javanix.rwx.api.model.DataSource;
import com.javanix.rwx.api.model.DataSources;
import com.javanix.rwx.identity.CurrentUserProvider;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Profile;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;
import tools.jackson.databind.json.JsonMapper;

// Dev-profile only (never active in production): made-up sources so Settings > Sources can be tried with several rows per type. Two roles in one bean:
// the filter answers default/key PUT/DELETE calls on a fake id (not in the contract enum, so the controller would
// answer 400) by changing an in-memory per-user state and dispatching on to GET /data-sources; the advice appends the
// fakes to every DataSources response, with the state applied and the real rows' default flags adjusted.
// The state is a boolean per fake key, never the key; nothing touches the DB, a provider or the contract.
@RestControllerAdvice
@Profile("dev")
class DevPreviewSources extends OncePerRequestFilter implements ResponseBodyAdvice<Object> {

    private record Fake(String id, String label, boolean requiresKey) {
    }

    private static final Map<String, List<Fake>> FAKES = Map.of(
            "book", List.of(new Fake("hardcover", "Hardcover", true), new Fake("loc", "Library of Congress", false),
                    new Fake("google_books", "Google Books", true)),
            "movie", List.of(new Fake("omdb", "OMDb", true), new Fake("trakt", "Trakt", true),
                    new Fake("kinopoisk", "Kinopoisk", true)));

    private static final String LIST = "/api/v1/data-sources";
    private static final Pattern PATH = Pattern.compile("/api/v1/data-sources/(book|movie)/([a-z_]+)/(default|key)");

    /** Per user: the fake that is default per type, and the fakes with a saved key ("type/id"). */
    private record State(Map<String, String> defaults, Set<String> keys) {
        State() {
            this(new ConcurrentHashMap<>(), ConcurrentHashMap.newKeySet());
        }
    }

    private final Map<UUID, State> states = new ConcurrentHashMap<>();
    private final CurrentUserProvider currentUser;
    private final JsonMapper json = JsonMapper.builder().build();

    DevPreviewSources(CurrentUserProvider currentUser) {
        this.currentUser = currentUser;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws IOException, jakarta.servlet.ServletException {
        var path = PATH.matcher(request.getRequestURI());
        var authenticated = request.getUserPrincipal() != null;
        if (!authenticated || "GET".equals(request.getMethod()) || !path.matches()) {
            chain.doFilter(request, response);
            return;
        }
        var type = path.group(1);
        var id = path.group(2);
        var kind = path.group(3);
        var fake = FAKES.get(type).stream().filter(f -> f.id().equals(id)).findFirst();
        if (fake.isEmpty()) {
            // choosing a real source as default displaces a fake default (before the answer is built)
            if ("default".equals(kind) && request.getMethod().equals("PUT")) {
                state().defaults().remove(type);
            }
            chain.doFilter(request, response);
            return;
        }
        var state = state();
        var key = type + "/" + id;
        switch (kind + " " + request.getMethod()) {
            case "default PUT" -> state.defaults().put(type, id);
            case "key DELETE" -> state.keys().remove(key);
            case "key PUT" -> {
                var apiKey = json.readTree(request.getInputStream()).path("apiKey").asString("");
                if (!fake.get().requiresKey() || apiKey.isBlank()) {
                    response.sendError(fake.get().requiresKey() ? 400 : 404);
                    return;
                }
                state.keys().add(key);
            }
            default -> {
                chain.doFilter(request, response);
                return;
            }
        }
        // re-dispatch as the list call in the same chain, so the controller and then the advice answer
        chain.doFilter(new HttpServletRequestWrapper(request) {
            @Override
            public String getMethod() {
                return "GET";
            }

            @Override
            public String getRequestURI() {
                return LIST;
            }

            @Override
            public String getServletPath() {
                return LIST;
            }

            @Override
            public String getPathInfo() {
                return null;
            }
        }, response);
    }

    @Override
    public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
        return true;
    }

    @Override
    public Object beforeBodyWrite(Object body, MethodParameter returnType, MediaType contentType,
            Class<? extends HttpMessageConverter<?>> converterType, ServerHttpRequest request, ServerHttpResponse response) {
        if (!(body instanceof DataSources real)) {
            return body;
        }
        var state = state();
        var result = new LinkedHashMap<String, Object>();
        result.put("books", rows("book", real.getBooks(), state));
        result.put("movies", rows("movie", real.getMovies(), state));
        return result;
    }

    private List<Object> rows(String type, List<DataSource> real, State state) {
        var fakeDefault = state.defaults().get(type);
        var fakes = new ArrayList<Map<String, Object>>();
        var fakeEffective = false;
        for (var f : FAKES.get(type)) {
            var saved = state.keys().contains(type + "/" + f.id());
            var available = !f.requiresKey() || saved;
            var isDefault = f.id().equals(fakeDefault);
            fakeEffective |= isDefault && available;
            var row = new LinkedHashMap<String, Object>();
            row.put("id", f.id());
            row.put("label", f.label());
            row.put("requiresKey", f.requiresKey());
            row.put("isDefault", isDefault);
            row.put("isEffective", isDefault && available);
            row.put("available", available);
            row.put("tokenSaved", saved);
            fakes.add(row);
        }
        var all = new ArrayList<Object>();
        for (var r : real) {
            if (fakeDefault != null) {
                r.isDefault(false);
            }
            if (fakeEffective) {
                r.isEffective(false);
            }
            all.add(r);
        }
        all.addAll(fakes);
        return all;
    }

    private State state() {
        return states.computeIfAbsent(currentUser.current().id(), u -> new State());
    }
}
