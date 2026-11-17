package com.javanix.rwx.testkit;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.javanix.rwx.testkit.TestUsers.TestUser;
import jakarta.servlet.http.Cookie;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/** Immutable request DSL over MockMvc; see {@link IntegrationTest}. Non-GET calls carry a CSRF token unless {@link #noCsrf()}. */
public class Api {

    private final MockMvc mvc;
    private final Cookie session;
    private final boolean csrf;

    Api(MockMvc mvc) {
        this(mvc, null, true);
    }

    private Api(MockMvc mvc, Cookie session, boolean csrf) {
        this.mvc = mvc;
        this.session = session;
        this.csrf = csrf;
    }

    public Api as(TestUser user) {
        return withCookie(user.cookie());
    }

    public Api withCookie(Cookie cookie) {
        return new Api(mvc, cookie, csrf);
    }

    public Api noCsrf() {
        return new Api(mvc, session, false);
    }

    public Res get(String path) {
        return send(HttpMethod.GET, path, null);
    }

    public Res post(String path) {
        return send(HttpMethod.POST, path, null);
    }

    public Res patch(String path, String json) {
        return send(HttpMethod.PATCH, path, json);
    }

    public Res delete(String path) {
        return send(HttpMethod.DELETE, path, null);
    }

    public Res send(HttpMethod method, String path, String json) {
        try {
            var request = MockMvcRequestBuilders.request(method, path);
            if (json != null) {
                request.contentType(MediaType.APPLICATION_JSON).content(json);
            }
            if (session != null) {
                request.cookie(session);
            }
            if (csrf && method != HttpMethod.GET) {
                // spring-security-test's csrf() would permanently swap the shared app's token repository
                var token = mvc.perform(MockMvcRequestBuilders.get("/")).andReturn().getResponse()
                        .getCookie("XSRF-TOKEN").getValue();
                request.cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token);
            }
            return new Res(mvc.perform(request).andReturn().getResponse());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public record Res(MockHttpServletResponse raw) {

        public Res expect(int status) {
            assertThat(raw.getStatus()).as(body()).isEqualTo(status);
            return this;
        }

        /** Status, problem+json content type and (if not null) the {@code code} field. */
        public Res expectProblem(int status, String code) {
            expect(status);
            assertThat(raw.getContentType()).startsWith(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            if (code != null) {
                assertThat(this.<String>json("$.code")).isEqualTo(code);
            }
            return this;
        }

        public Res expectNotFound() {
            return expectProblem(404, null);
        }

        public String body() {
            try {
                return raw.getContentAsString();
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }

        public <T> T json(String path) {
            return JsonPath.read(body(), path);
        }

        public String header(String name) {
            return raw.getHeader(name);
        }

        /** Raw Set-Cookie header (attributes included) for the cookie. */
        public String setCookie(String name) {
            return raw.getHeaders("Set-Cookie").stream().filter(h -> h.startsWith(name + "=")).findFirst().orElseThrow();
        }

        public Cookie cookie(String name) {
            return raw.getCookie(name);
        }
    }
}
