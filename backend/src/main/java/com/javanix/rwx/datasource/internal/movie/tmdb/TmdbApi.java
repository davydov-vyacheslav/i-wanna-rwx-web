package com.javanix.rwx.datasource.internal.movie.tmdb;

import java.util.List;
import org.springframework.resilience.annotation.ConcurrencyLimit;
import org.springframework.resilience.annotation.ConcurrencyLimit.ThrottlePolicy;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.service.annotation.GetExchange;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.PropertyNamingStrategies.SnakeCaseStrategy;
import tools.jackson.databind.annotation.JsonNaming;

/**
 * The TMDb calls we use. Every call takes the credential as both {@code apiKey} (a v3 key goes in the query) and
 * {@code authorization} (a v4 token goes in a bearer header, out of the URL); the caller passes null for the unused one.
 * Unknown fields are ignored and every value may be null.
 */
@ConcurrencyLimit(limitString = "${rwx.datasource.http.max-concurrent:8}", policy = ThrottlePolicy.REJECT)
interface TmdbApi {

    @GetExchange("/authentication")
    JsonNode authentication(@RequestParam(name = "api_key", required = false) String apiKey, @RequestHeader(name = "Authorization", required = false) String authorization);

    @GetExchange("/configuration")
    Configuration configuration(@RequestParam(name = "api_key", required = false) String apiKey,
            @RequestHeader(name = "Authorization", required = false) String authorization);

    @GetExchange("/search/multi")
    Hits search(@RequestParam("query") String query, @RequestParam("language") String language,
            @RequestParam("include_adult") boolean includeAdult, @RequestParam("page") int page,
            @RequestParam(name = "api_key", required = false) String apiKey, @RequestHeader(name = "Authorization", required = false) String authorization);

    @GetExchange("/{type}/{id}")
    Media details(@PathVariable("type") String type, @PathVariable("id") String id,
            @RequestParam("language") String language, @RequestParam(name = "api_key", required = false) String apiKey,
            @RequestHeader(name = "Authorization", required = false) String authorization);

    record Configuration(Images images) {
    }

    @JsonNaming(SnakeCaseStrategy.class)
    record Images(String secureBaseUrl, List<String> posterSizes) {
    }

    record Hits(List<Media> results) {
    }

    /** A search result and a details body use the same field names; {@code status} and {@code numberOfSeasons} are details only. */
    @JsonNaming(SnakeCaseStrategy.class)
    record Media(String mediaType, Long id, String title, String name, String originalTitle, String originalName,
            String overview, String posterPath, String releaseDate, String firstAirDate, Double voteAverage,
            String status, Integer numberOfSeasons) {
    }
}
