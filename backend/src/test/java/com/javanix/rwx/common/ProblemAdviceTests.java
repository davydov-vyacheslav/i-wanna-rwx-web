package com.javanix.rwx.common;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.javanix.rwx.api.model.ResourceType;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.format.support.DefaultFormattingConversionService;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * The generic advice over a real MockMvc dispatch. A test-only controller (nested, hence not component-scanned)
 * throws the exceptions no REST path reaches yet.
 */
class ProblemAdviceTests {

    @RestController
    static class Throwing {

        @GetMapping("/invalid")
        String invalid() {
            throw new InvalidRequestException(List.of(new Violation("title", "must not be blank")));
        }

        @GetMapping("/gone")
        String gone() {
            throw new GoneException();
        }

        @GetMapping("/kind/{type}")
        String kind(@PathVariable ResourceType type) {
            return type.getValue();
        }
    }

    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new Throwing()).setControllerAdvice(new ProblemAdvice())
            .setConversionService(conversions()).build();

    // the conversion the application has: Spring's defaults plus the contract enum converter
    private static DefaultFormattingConversionService conversions() {
        var service = new DefaultFormattingConversionService();
        new ContractEnumConverters().addFormatters(service);
        return service;
    }

    @Test
    void bothInvalidRequestVariantsShareTheDetailText() throws Exception {
        mvc.perform(get("/invalid")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation"))
                .andExpect(jsonPath("$.detail").value("Invalid request."))
                .andExpect(jsonPath("$.errors[0].field").value("title"));
    }

    @Test
    void goneIs410WithTheGoneCode() throws Exception {
        mvc.perform(get("/gone")).andExpect(status().isGone()).andExpect(jsonPath("$.code").value("gone"));
    }

    @Test
    void aContractEnumParameterIsReadByItsWireValue() throws Exception {
        mvc.perform(get("/kind/movie")).andExpect(status().isOk()).andExpect(content().string("movie"));
        mvc.perform(get("/kind/book")).andExpect(status().isOk()).andExpect(content().string("book"));
    }

    @Test
    void aValueOutsideTheEnumIs400ValidationWithoutEchoingIt() throws Exception {
        for (var bad : new String[] {"shelf", "Movie", "draft", "movies"}) {
            mvc.perform(get("/kind/" + bad)).andExpect(status().isBadRequest())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.code").value("validation"))
                    .andExpect(jsonPath("$.detail").value("Invalid request."));
        }
    }
}
