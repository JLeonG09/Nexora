package com.nexora.services;

import java.text.Normalizer;
import java.util.Locale;

/** Minúsculas, sin tildes y sin espacios de más: "  Aná  María " → "ana maria". */
public final class TextNormalizer {

    private TextNormalizer() {
    }

    public static String normalize(String text) {
        if (text == null) {
            return "";
        }
        String withoutMarks = Normalizer.normalize(text, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return withoutMarks.toLowerCase(Locale.ROOT).trim().replaceAll("\\s+", " ");
    }
}
