package com.nexora.riendas;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;

class OpenApiTest extends IntegrationTestBase {

    @Test
    void publishesPhaseTwoEndpoints() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.info.title").value("Riendas API"))
                .andExpect(jsonPath("$.paths['/api/agent/public-key']").exists())
                .andExpect(jsonPath("$.paths['/api/mandates']").exists())
                .andExpect(jsonPath("$.paths['/api/mandates/{id}/revoke']").exists())
                .andExpect(jsonPath("$.paths['/api/mandates/active/limits']").exists())
                .andExpect(jsonPath("$.paths['/api/contacts/{id}']").exists())
                .andExpect(jsonPath("$.paths['/api/chat']").exists())
                .andExpect(jsonPath("$.paths['/api/chat/messages']").exists())
                .andExpect(jsonPath("$.components.securitySchemes['X-User-Id']").exists());
    }
}
