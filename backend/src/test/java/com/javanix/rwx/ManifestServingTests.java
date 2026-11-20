package com.javanix.rwx;

import static org.assertj.core.api.Assertions.assertThat;

import com.javanix.rwx.testkit.TestInfra;
import org.junit.jupiter.api.Test;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.web.client.RestClient;

/** On a real server: the MIME mapping belongs to the servlet container, which MockMvc does not have. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc // TestInfra wires Api on MockMvc
@Import(TestInfra.class)
class ManifestServingTests {

    @LocalServerPort int port;

    @Test
    void manifestIsServedAsManifestJson() {
        var response = RestClient.create("http://localhost:" + port).get().uri("/manifest.webmanifest")
                .retrieve().toBodilessEntity();
        assertThat(response.getHeaders().getContentType().toString()).isEqualTo("application/manifest+json");
    }
}
