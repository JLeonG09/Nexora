package com.nexora.controllers;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.nexora.config.AppProperties;
import com.nexora.config.CurrentUser;
import com.nexora.exceptions.GlobalExceptionHandler;
import com.nexora.services.PaymentProposalService;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class DemoControllerTest {

    private static final String STRONG = "0123456789abcdef0123456789abcdef";
    private static final String BODY = "{\"destinationAddress\":\"" + "G" + "A".repeat(55) + "\",\"amount\":\"10\"}";

    @Test
    void demoConFirmanteHttpResponde404() throws Exception {
        mockMvc("http").perform(post("/api/demo/attack").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RECURSO_NO_ENCONTRADO"));
    }

    @Test
    void demoConFirmanteHttpEnMayusculasResponde404() throws Exception {
        mockMvc("HTTP").perform(post("/api/demo/attack").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RECURSO_NO_ENCONTRADO"));
    }

    @Test
    void demoConFirmanteMockNoSeEsconde() throws Exception {
        mockMvc("mock").perform(post("/api/demo/attack").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("USUARIO_NO_IDENTIFICADO"));
    }

    private static MockMvc mockMvc(String signerMode) {
        AppProperties properties = new AppProperties(List.of("http://localhost:5173"),
                "https://stellar.expert/explorer/testnet",
                "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA", "TESTNET", 24,
                new AppProperties.RateLimit(20, 5), true, STRONG,
                new AppProperties.Ai("mock", "http://localhost:8000", STRONG, 2000, 15000, new BigDecimal("0.7")),
                new AppProperties.Signer(signerMode, "http://localhost:3001", STRONG, 2000, 45000,
                        new AppProperties.SignerMock(new BigDecimal("50"))),
                new AppProperties.StellarEvents("mock", "https://soroban-testnet.stellar.org"),
                new AppProperties.Reconciliation(true, 60000), "privy-app-de-prueba");
        DemoController controller = new DemoController(
                org.mockito.Mockito.mock(PaymentProposalService.class), new CurrentUser(), properties);
        return MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }
}
