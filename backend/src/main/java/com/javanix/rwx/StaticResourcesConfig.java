package com.javanix.rwx;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/**
 * Serves the SPA from classpath:/static with index.html fallback. Boot's own static mapping is
 * disabled (spring.web.resources.add-mappings=false) so this is the only "/**" handler.
 */
@Configuration(proxyBeanMethods = false)
class StaticResourcesConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/assets/**")
                .addResourceLocations("classpath:/static/assets/")
                .setCacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable());

        registry.addResourceHandler("/**")
                .addResourceLocations("classpath:/static/")
                .setCacheControl(CacheControl.noCache())
                .resourceChain(true)
                .addResolver(new SpaFallbackResolver());
    }

    static class SpaFallbackResolver extends PathResourceResolver {
        @Override
        protected Resource getResource(String resourcePath, Resource location) throws IOException {
            if (resourcePath.startsWith("api/") || resourcePath.startsWith("actuator/")
                    || resourcePath.equals("api") || resourcePath.equals("actuator")) {
                return null; // must stay a 404 problem, never index.html
            }
            Resource requested = super.getResource(resourcePath, location);
            if (requested != null) {
                return requested;
            }
            Resource index = new ClassPathResource("static/index.html");
            return index.exists() ? index : null;
        }
    }
}
