package com.nexora;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class ErrorHandlingTest extends IntegrationTestBase {

    @Test
    void missingUserHeaderReturnsUniform401() throws Exception {
        mockMvc.perform(get("/api/users/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.code").value("USUARIO_NO_IDENTIFICADO"))
                .andExpect(jsonPath("$.message", notNullValue()))
                .andExpect(jsonPath("$.path").value("/api/users/me"))
                .andExpect(jsonPath("$.timestamp", notNullValue()))
                .andExpect(jsonPath("$.traceId", notNullValue()))
                .andExpect(jsonPath("$.details", hasSize(0)));
    }

    @Test
    void userIdHeaderAloneIs401() throws Exception {
        mockMvc.perform(get("/api/users/me").header("X-User-Id", "no-es-un-uuid"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("USUARIO_NO_IDENTIFICADO"));
        mockMvc.perform(get("/api/users/me").header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("USUARIO_NO_IDENTIFICADO"));
    }

    @Test
    void invalidBodyReturns400WithDetails() throws Exception {
        mockMvc.perform(post("/api/users").header("Authorization", freshBearer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"\",\"email\":\"no-es-correo\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDACION_FALLIDA"))
                .andExpect(jsonPath("$.details", hasSize(2)));
    }

    @Test
    void malformedJsonReturns400() throws Exception {
        mockMvc.perform(post("/api/users").header("Authorization", freshBearer())
                        .contentType(MediaType.APPLICATION_JSON).content("{nope"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDACION_FALLIDA"));
    }

    @Test
    void unknownRouteReturnsUniform404() throws Exception {
        String userId = createUser("Josué", null);
        mockMvc.perform(get("/api/no-existe").header("Authorization", bearer(userId)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RECURSO_NO_ENCONTRADO"));
    }

    @Test
    void corsPreflightFromFrontendIsAllowed() throws Exception {
        mockMvc.perform(options("/api/users/me")
                        .header("Origin", "http://localhost:5173")
                        .header("Access-Control-Request-Method", "GET")
                        .header("Access-Control-Request-Headers", "Authorization"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"));
    }

    @Test
    void corsPreflightFromOtherOriginIsRejected() throws Exception {
        mockMvc.perform(options("/api/users/me")
                        .header("Origin", "http://evil.example")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isForbidden());
    }

}
