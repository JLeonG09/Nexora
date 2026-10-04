package com.nexora.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nexora.exceptions.ApiException;
import com.nexora.exceptions.ErrorCode;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class ServiceKeyInterceptorTest {

    private static final String STRONG = "0123456789abcdef0123456789abcdef";

    @Test
    void claveCortaODeLaDenylistRechazaAunqueCoincida() {
        assertRejected("1234");
        assertRejected("cambia-esto");
        assertRejected("changeme");
        assertRejected("cambia-esto-" + "a".repeat(20));
    }

    @Test
    void claveFuerteAceptaSoloLaCabeceraCorrecta() throws Exception {
        ServiceKeyInterceptor interceptor = interceptor(STRONG);
        assertThat(interceptor.preHandle(request(STRONG), new MockHttpServletResponse(), new Object())).isTrue();

        assertThatThrownBy(() -> interceptor.preHandle(request("otra-clave-distinta-0123456789abcdef"),
                new MockHttpServletResponse(), new Object()))
                .isInstanceOf(ApiException.class)
                .extracting(ex -> ((ApiException) ex).code())
                .isEqualTo(ErrorCode.CLAVE_SERVICIO_INVALIDA);
    }

    private static void assertRejected(String key) {
        ServiceKeyInterceptor interceptor = interceptor(key);
        assertThatThrownBy(() -> interceptor.preHandle(request(key), new MockHttpServletResponse(), new Object()))
                .isInstanceOf(ApiException.class)
                .extracting(ex -> ((ApiException) ex).code())
                .isEqualTo(ErrorCode.CLAVE_SERVICIO_INVALIDA);
    }

    private static MockHttpServletRequest request(String key) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/agent-tools/limits");
        request.addHeader(ServiceKeyInterceptor.HEADER, key);
        return request;
    }

    private static ServiceKeyInterceptor interceptor(String toolsKey) {
        return new ServiceKeyInterceptor(new AppProperties(List.of("http://localhost:5173"),
                "https://stellar.expert/explorer/testnet",
                "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA", "TESTNET", 24,
                new AppProperties.RateLimit(20, 5), false, toolsKey,
                new AppProperties.Ai("mock", "http://localhost:8000", "x", 2000, 15000, new BigDecimal("0.7")),
                new AppProperties.Signer("mock", "http://localhost:3001", "x", 2000, 45000,
                        new AppProperties.SignerMock(new BigDecimal("50"))),
                new AppProperties.StellarEvents("mock", "https://soroban-testnet.stellar.org"),
                new AppProperties.Reconciliation(true, 60000), "privy-app-de-prueba"));
    }
}
