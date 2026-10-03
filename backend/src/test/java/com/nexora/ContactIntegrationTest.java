package com.nexora;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class ContactIntegrationTest extends IntegrationTestBase {

    @Test
    void createsAndListsContacts() throws Exception {
        String userId = createUser("Josué", null);
        mockMvc.perform(post("/api/contacts").header("Authorization", bearer(userId)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"  Ana \",\"stellarAddress\":\"" + ANA_ADDRESS + "\",\"note\":\"Diseñadora del logo\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Ana"))
                .andExpect(jsonPath("$.stellarAddress").value(ANA_ADDRESS))
                .andExpect(jsonPath("$.note").value("Diseñadora del logo"))
                .andExpect(jsonPath("$.createdAt").exists());
        createContact(userId, "Juan", JUAN_ADDRESS);

        mockMvc.perform(get("/api/contacts").header("Authorization", bearer(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].name").value("Ana"))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(50))
                .andExpect(jsonPath("$.totalItems").value(2));
    }

    @Test
    void nameIsUniqueIgnoringCaseAndAccents() throws Exception {
        String userId = createUser("Josué", null);
        createContact(userId, "Ana", ANA_ADDRESS);
        mockMvc.perform(post("/api/contacts").header("Authorization", bearer(userId)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"ANÁ\",\"stellarAddress\":\"" + JUAN_ADDRESS + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONTACTO_DUPLICADO"));

        String otherUser = createUser("Otro", null);
        createContact(otherUser, "Ana", ANA_ADDRESS);
    }

    @Test
    void invalidContactIsRejected() throws Exception {
        String userId = createUser("Josué", null);
        mockMvc.perform(post("/api/contacts").header("Authorization", bearer(userId)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\",\"stellarAddress\":\"GANA...EJEMPLO\",\"note\":\"" + "x".repeat(141) + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDACION_FALLIDA"))
                .andExpect(jsonPath("$.details.length()").value(3));
    }

    @Test
    void updatesContact() throws Exception {
        String userId = createUser("Josué", null);
        String anaId = createContact(userId, "Ana", ANA_ADDRESS);
        createContact(userId, "Juan", JUAN_ADDRESS);

        mockMvc.perform(put("/api/contacts/" + anaId).header("Authorization", bearer(userId)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Ana María\",\"stellarAddress\":\"" + OTHER_C_ADDRESS + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Ana María"))
                .andExpect(jsonPath("$.stellarAddress").value(OTHER_C_ADDRESS));

        mockMvc.perform(put("/api/contacts/" + anaId).header("Authorization", bearer(userId)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"juan\",\"stellarAddress\":\"" + ANA_ADDRESS + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONTACTO_DUPLICADO"));
    }

    @Test
    void archivedContactDisappearsAndNameCanBeReused() throws Exception {
        String userId = createUser("Josué", null);
        String anaId = createContact(userId, "Ana", ANA_ADDRESS);

        mockMvc.perform(delete("/api/contacts/" + anaId).header("Authorization", bearer(userId)))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/contacts/" + anaId).header("Authorization", bearer(userId)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RECURSO_NO_ENCONTRADO"));
        mockMvc.perform(delete("/api/contacts/" + anaId).header("Authorization", bearer(userId)))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/contacts").header("Authorization", bearer(userId)))
                .andExpect(jsonPath("$.totalItems").value(0));

        createContact(userId, "Ana", ANA_ADDRESS);
    }

    @Test
    void contactOfAnotherUserIsNotVisible() throws Exception {
        String owner = createUser("Josué", null);
        String anaId = createContact(owner, "Ana", ANA_ADDRESS);
        String intruder = createUser("Otro", null);

        mockMvc.perform(get("/api/contacts/" + anaId).header("Authorization", bearer(intruder)))
                .andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/contacts/" + anaId).header("Authorization", bearer(intruder)))
                .andExpect(status().isNotFound());
    }
}
