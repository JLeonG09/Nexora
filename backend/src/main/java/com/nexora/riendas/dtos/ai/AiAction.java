package com.nexora.riendas.dtos.ai;

import java.util.Map;

public record AiAction(String tool, Map<String, Object> arguments) {

    public static final String PROPOSE_PAYMENT = "propose_payment";
}
