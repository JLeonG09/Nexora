package com.nexora.services;

import java.util.regex.Pattern;

/**
 * Señales del texto del usuario que no dependen de la IA: negación, moneda distinta de USDC
 * y multiplicadores en palabras. La usa el intérprete de reglas y, otra vez, el validador.
 */
public final class PaymentTextGuard {

    /** "no le pagues", "no pagues", "nunca le mandes", "jamás envíes". El "no" de "no 50" no cuenta. */
    private static final Pattern NEGATED_PAYMENT = Pattern.compile(
            "\\b(no|nunca|jamas)\\b(?:\\s+\\p{L}+){0,5}\\s+"
                    + "(pag|mand|envi|transf|deposit|abon|gir|pas|sinpe|yape)\\p{L}*");

    /** EUR, USD, dólares, colones, pesos, XLM, $ o ₡. "USDC" no entra: usd no puede ir seguido de letra. */
    private static final Pattern FOREIGN_CURRENCY = Pattern.compile(
            "(?<![\\p{L}\\p{N}])(euros|euro|eur|dolares|dolar|usd|colones|colon|pesos|peso|xlm)"
                    + "(?![\\p{L}\\p{N}])|₡|\\$");

    /** "2 mil" o "un millón": no se adivina el factor. */
    private static final Pattern MULTIPLIER = Pattern.compile("\\b(mil|millon|millones)\\b");

    private PaymentTextGuard() {
    }

    public static boolean negated(String text) {
        return NEGATED_PAYMENT.matcher(TextNormalizer.normalize(text)).find();
    }

    public static boolean foreignCurrency(String text) {
        return FOREIGN_CURRENCY.matcher(TextNormalizer.normalize(text)).find();
    }

    public static boolean multiplier(String text) {
        return MULTIPLIER.matcher(TextNormalizer.normalize(text)).find();
    }
}
