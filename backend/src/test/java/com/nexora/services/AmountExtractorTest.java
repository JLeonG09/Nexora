package com.nexora.services;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class AmountExtractorTest {

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "Págale 15 USDC a Ana|15",
            "Págale 15.50 a Ana|15.50",
            "Págale 15,50 a Ana|15.50",
            "Págale 0,125 a Ana|0.125",
            "Págale 0.125 a Ana|0.125",
            "Págale a Pedro 1000000 USDC|1000000",
            "Págale 1.000.000 a Pedro|1000000",
            "Págale 1,000,000 a Pedro|1000000",
            "Págale 1,000.50 a Pedro|1000.50",
            "Págale 1.000,50 a Pedro|1000.50",
            "Págale 2.5000 a Ana|2.5"
    })
    void readsUnambiguousNumbers(String text, String expected) {
        List<AmountExtractor.Token> tokens = AmountExtractor.extract(text);
        assertThat(tokens).hasSize(1);
        assertThat(tokens.get(0).ambiguous()).isFalse();
        assertThat(tokens.get(0).value()).isEqualByComparingTo(new BigDecimal(expected));
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {"Págale 1.000 a Ana", "Págale 1,000 a Ana", "Págale 2.500 a Ana"})
    void thousandSeparatorAloneIsAmbiguous(String text) {
        List<AmountExtractor.Token> tokens = AmountExtractor.extract(text);
        assertThat(tokens).hasSize(1);
        assertThat(tokens.get(0).ambiguous()).isTrue();
        assertThat(AmountExtractor.unambiguousValues(text)).isEmpty();
    }

    @Test
    void negativeSignStaysOnTheToken() {
        List<AmountExtractor.Token> tokens = AmountExtractor.extract("págale -3");
        assertThat(tokens).hasSize(1);
        assertThat(tokens.get(0).ambiguous()).isFalse();
        assertThat(tokens.get(0).value()).isEqualByComparingTo("-3");
        assertThat(AmountExtractor.unambiguousValues("págale 0")).containsExactly(BigDecimal.ZERO);
    }

    @Test
    void wordsAreNotNumbers() {
        assertThat(AmountExtractor.extract("Págale quince a Ana")).isEmpty();
    }

    @Test
    void keepsTextOrder() {
        assertThat(AmountExtractor.unambiguousValues("Págale 15 a Ana por 3 logos"))
                .containsExactly(new BigDecimal("15"), new BigDecimal("3"));
    }
}
