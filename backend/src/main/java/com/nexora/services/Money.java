package com.nexora.services;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.regex.Pattern;

/** Montos de USDC: string decimal con hasta 7 decimales ↔ BigDecimal ↔ unidades on-chain. */
public final class Money {

    public static final String AMOUNT_REGEX = "^[0-9]+(\\.[0-9]{1,7})?$";
    public static final int SCALE = 7;

    private static final Pattern AMOUNT_PATTERN = Pattern.compile(AMOUNT_REGEX);

    private Money() {
    }

    public static boolean isValid(String value) {
        return value != null && AMOUNT_PATTERN.matcher(value).matches();
    }

    /** Lee un monto con el formato del contrato. Lanza {@link IllegalArgumentException} si no cumple la regex. */
    public static BigDecimal parse(String value) {
        if (!isValid(value)) {
            throw new IllegalArgumentException("Monto inválido: " + value);
        }
        return new BigDecimal(value).setScale(SCALE, RoundingMode.UNNECESSARY);
    }

    /** "15" → "15.0000000". */
    public static String format(BigDecimal value) {
        return value == null ? null : value.setScale(SCALE, RoundingMode.UNNECESSARY).toPlainString();
    }

    /** "15.0000000" → "150000000". */
    public static String toUnits(BigDecimal value) {
        return value.movePointRight(SCALE).setScale(0, RoundingMode.UNNECESSARY).toPlainString();
    }

    /** Para textos al usuario: al menos 2 decimales, sin ceros de más ("15" → "15.00", "0.125" → "0.125"). */
    public static String display(BigDecimal value) {
        BigDecimal stripped = value.stripTrailingZeros();
        return stripped.scale() <= 2 ? value.setScale(2, RoundingMode.UNNECESSARY).toPlainString() : stripped.toPlainString();
    }
}
