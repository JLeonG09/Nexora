package com.nexora.clients;

import java.util.Optional;

/** Modelo de respaldo del agente híbrido: solo clasifica la intención de un mensaje. */
@FunctionalInterface
public interface IntentModel {

    /** Vacío si el modelo no está, tarda demasiado o responde algo fuera de la lista. */
    Optional<RuleInterpreter.Intent> classify(String message);

    IntentModel NONE = message -> Optional.empty();
}
