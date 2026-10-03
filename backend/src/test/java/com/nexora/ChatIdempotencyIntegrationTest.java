package com.nexora;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;

/** El mismo clientMessageId no puede crear dos pagos, ni aunque lleguen a la vez. */
class ChatIdempotencyIntegrationTest extends IntegrationTestBase {

    @Test
    void retryWithTheSameClientMessageIdReturnsTheExistingProposal() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);
        String clientMessageId = UUID.randomUUID().toString();

        String first = chat(userId, "Págale 5 USDC a Ana por el logo", null, clientMessageId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.proposal.status").value("CONFIRMADO"))
                .andReturn().getResponse().getContentAsString();
        String proposalId = JsonPath.read(first, "$.proposal.id");

        chat(userId, "Págale 5 USDC a Ana por el logo", null, clientMessageId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.proposal.id").value(proposalId))
                .andExpect(jsonPath("$.proposal.status").value("CONFIRMADO"));

        Integer proposals = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM payment_proposals WHERE user_id = ?::uuid", Integer.class, userId);
        assertThat(proposals).isEqualTo(1);
        assertThat(mockSignerClient.submissions()).isEqualTo(1);
    }

    @Test
    void parallelRetrySignsOnlyOnce() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);
        String clientMessageId = UUID.randomUUID().toString();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch go = new CountDownLatch(1);
        try {
            Future<String> first = pool.submit(() -> sendWhenReleased(userId, clientMessageId, ready, go));
            Future<String> second = pool.submit(() -> sendWhenReleased(userId, clientMessageId, ready, go));
            ready.await();
            go.countDown();
            assertThat(first.get()).isEqualTo(second.get());
        } finally {
            pool.shutdownNow();
        }

        Integer proposals = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM payment_proposals WHERE user_id = ?::uuid", Integer.class, userId);
        assertThat(proposals).isEqualTo(1);
        assertThat(mockSignerClient.submissions()).isEqualTo(1);
    }

    private String sendWhenReleased(String userId, String clientMessageId, CountDownLatch ready, CountDownLatch go)
            throws Exception {
        ready.countDown();
        go.await();
        String body = chat(userId, "Págale 5 USDC a Ana por el logo", null, clientMessageId)
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.proposal.id");
    }
}
