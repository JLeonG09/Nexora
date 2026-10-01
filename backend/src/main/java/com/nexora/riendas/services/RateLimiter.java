package com.nexora.riendas.services;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/** Ventana deslizante en memoria por clave. Se pierde al reiniciar; suficiente para una sola instancia del MVP. */
@Component
public class RateLimiter {

    private final Map<String, Deque<Instant>> hits = new ConcurrentHashMap<>();

    /** Registra un intento y devuelve false si en la ventana ya hubo {@code limit} intentos permitidos. */
    public boolean tryAcquire(String key, int limit, Duration window) {
        Instant now = Instant.now();
        Instant since = now.minus(window);
        Deque<Instant> deque = hits.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (deque) {
            while (!deque.isEmpty() && !deque.peekFirst().isAfter(since)) {
                deque.pollFirst();
            }
            if (deque.size() >= limit) {
                return false;
            }
            deque.addLast(now);
            return true;
        }
    }
}
