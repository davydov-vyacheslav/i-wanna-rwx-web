package com.javanix.rwx.datasource.internal.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.javanix.rwx.api.model.BookSourceId;
import com.javanix.rwx.datasource.BookItem;
import com.javanix.rwx.datasource.BookRef;
import com.javanix.rwx.datasource.CatalogException.ProviderError;
import org.junit.jupiter.api.Test;

class SearchControllerUriTests {

    private static final BookItem ITEM = new BookItem(new BookRef(BookSourceId.OPEN_LIBRARY, "OL1W"),
            "https://openlibrary.org/works/OL1W", "Dune", null, null, null, null, null, null);

    @Test
    void aDerivedUrlTheContractCannotCarryIsAProviderErrorOfTheSourceNotAnIllegalArgument() {
        for (var bad : new String[] {"", "not a url", "https://covers.example/a b.jpg", "ftp://covers.example/1.jpg"}) {
            assertThatThrownBy(() -> SearchController.uri(ITEM, bad)).as("[" + bad + "]")
                    .isInstanceOfSatisfying(ProviderError.class, e -> assertThat(e.source()).isEqualTo("open_library"));
        }
    }

    @Test
    void aValidUrlPassesAndNullStaysNull() {
        assertThat(SearchController.uri(ITEM, "https://covers.openlibrary.org/b/id/1-L.jpg")).hasHost("covers.openlibrary.org");
        assertThat(SearchController.uri(ITEM, null)).isNull();
    }
}
