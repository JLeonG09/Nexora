package com.nexora.services;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.Test;

class RateLimiterTest {

    @Test
    void allowsUpToTheLimitPerKey() {
        RateLimiter limiter = new RateLimiter();
        for (int i = 0; i < 3; i++) {
            assertThat(limiter.tryAcquire("a", 3, Duration.ofMinutes(1))).isTrue();
        }
        assertThat(limiter.tryAcquire("a", 3, Duration.ofMinutes(1))).isFalse();
        assertThat(limiter.tryAcquire("b", 3, Duration.ofMinutes(1))).isTrue();
    }

    @Test
    void windowSlides() throws InterruptedException {
        RateLimiter limiter = new RateLimiter();
        assertThat(limiter.tryAcquire("a", 1, Duration.ofMillis(100))).isTrue();
        assertThat(limiter.tryAcquire("a", 1, Duration.ofMillis(100))).isFalse();
        Thread.sleep(150);
        assertThat(limiter.tryAcquire("a", 1, Duration.ofMillis(100))).isTrue();
    }
}
