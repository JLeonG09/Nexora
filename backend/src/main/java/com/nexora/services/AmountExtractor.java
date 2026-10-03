package com.nexora.services;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Saca los números literales de un texto (MVP_BACKEND.md §5, regla 4).
 * "1.000" o "1,000" son ambiguos (1 o 1000): se marcan y su valor es la lectura como miles.
 */
public final class AmountExtractor {

    /** El signo menos entra en el token para no leer "-3" como 3. */
    private static final Pattern TOKEN = Pattern.compile("-?\\d+([.,]\\d+)*");
    private static final int MAX_DECIMALS = 7;

    public record Token(String raw, BigDecimal value, boolean ambiguous) {
    }

    private AmountExtractor() {
    }

    public static List<Token> extract(String text) {
        List<Token> tokens = new ArrayList<>();
        if (text == null) {
            return tokens;
        }
        Matcher matcher = TOKEN.matcher(text);
        while (matcher.find()) {
            tokens.add(read(matcher.group()));
        }
        return tokens;
    }

    /** Valores no ambiguos, en el orden del texto. */
    public static List<BigDecimal> unambiguousValues(String text) {
        return extract(text).stream().filter(token -> !token.ambiguous()).map(Token::value).toList();
    }

    private static Token read(String raw) {
        if (raw.startsWith("-")) {
            Token magnitude = read(raw.substring(1));
            return new Token(raw, magnitude.value().negate(), magnitude.ambiguous());
        }
        List<String> groups = new ArrayList<>();
        List<Character> separators = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (char c : raw.toCharArray()) {
            if (c == '.' || c == ',') {
                groups.add(current.toString());
                separators.add(c);
                current.setLength(0);
            } else {
                current.append(c);
            }
        }
        groups.add(current.toString());

        if (separators.isEmpty()) {
            return new Token(raw, new BigDecimal(raw), false);
        }
        if (separators.size() == 1) {
            return readSingleSeparator(raw, groups.get(0), groups.get(1));
        }
        return readMultipleSeparators(raw, groups, separators);
    }

    private static Token readSingleSeparator(String raw, String integerPart, String fraction) {
        boolean zeroInteger = integerPart.chars().allMatch(c -> c == '0');
        if (!zeroInteger && fraction.length() == 3) {
            return new Token(raw, new BigDecimal(integerPart + fraction), true);
        }
        return new Token(raw, new BigDecimal(integerPart + "." + fraction), false);
    }

    private static Token readMultipleSeparators(String raw, List<String> groups, List<Character> separators) {
        char last = separators.get(separators.size() - 1);
        char thousands = separators.get(0);
        boolean allSame = separators.stream().allMatch(c -> c == thousands);
        String digitsOnly = String.join("", groups);

        if (allSame) {
            // 1.000.000 / 1,000,000: todos los grupos después del primero con 3 dígitos
            if (validThousandGroups(groups, groups.size())) {
                return new Token(raw, new BigDecimal(digitsOnly), false);
            }
            return new Token(raw, new BigDecimal(digitsOnly), true);
        }

        // 1.000,50 / 1,000.50: miles con un separador y decimal con el otro (el último)
        boolean thousandsConsistent = separators.subList(0, separators.size() - 1).stream().allMatch(c -> c == thousands);
        String fraction = groups.get(groups.size() - 1);
        if (thousandsConsistent && last != thousands && validThousandGroups(groups, groups.size() - 1)
                && fraction.length() <= MAX_DECIMALS) {
            String integerPart = String.join("", groups.subList(0, groups.size() - 1));
            return new Token(raw, new BigDecimal(integerPart + "." + fraction), false);
        }
        return new Token(raw, new BigDecimal(digitsOnly), true);
    }

    private static boolean validThousandGroups(List<String> groups, int integerGroupCount) {
        String first = groups.get(0);
        if (first.isEmpty() || first.length() > 3) {
            return false;
        }
        for (int i = 1; i < integerGroupCount; i++) {
            if (groups.get(i).length() != 3) {
                return false;
            }
        }
        return true;
    }
}
