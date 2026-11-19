package com.javanix.rwx.datasource.internal.book.openlibrary;

import java.util.List;
import org.springframework.resilience.annotation.ConcurrencyLimit;
import org.springframework.resilience.annotation.ConcurrencyLimit.ThrottlePolicy;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.service.annotation.GetExchange;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.PropertyNamingStrategies.SnakeCaseStrategy;
import tools.jackson.databind.annotation.JsonNaming;

/** The Open Library calls we use; unknown fields are ignored and every value may be null. */
@ConcurrencyLimit(limitString = "${rwx.datasource.http.max-concurrent:8}", policy = ThrottlePolicy.REJECT)
interface OpenLibraryApi {

    @GetExchange("/search.json")
    Search search(@RequestParam("q") String q, @RequestParam("limit") int limit, @RequestParam("fields") String fields);

    @GetExchange("/works/{id}.json")
    Work work(@PathVariable("id") String id);

    record Search(List<Doc> docs) {
    }

    @JsonNaming(SnakeCaseStrategy.class)
    record Doc(String key, String title, List<String> authorName, Long coverI, Integer firstPublishYear,
            Double ratingsAverage, List<String> isbn, Editions editions) {
    }

    record Editions(List<Edition> docs) {
    }

    record Edition(List<String> format) {
    }

    /** {@code description} is a plain string or an object {@code {type, value}}. */
    record Work(String title, JsonNode description) {
    }
}
