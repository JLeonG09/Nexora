package com.nexora.riendas.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class MoneyTest {

    @Test
    void formatsAndConvertsToUnits() {
        BigDecimal fifteen = Money.parse("15");
        assertThat(Money.format(fifteen)).isEqualTo("15.0000000");
        assertThat(Money.toUnits(fifteen)).isEqualTo("150000000");
        assertThat(Money.toUnits(Money.parse("0.0000001"))).isEqualTo("1");
    }

    @Test
    void displaysAtLeastTwoDecimals() {
        assertThat(Money.display(Money.parse("15"))).isEqualTo("15.00");
        assertThat(Money.display(Money.parse("15.5"))).isEqualTo("15.50");
        assertThat(Money.display(Money.parse("0.125"))).isEqualTo("0.125");
    }

    @Test
    void rejectsInvalidAmounts() {
        assertThat(Money.isValid("-1")).isFalse();
        assertThat(Money.isValid("1e3")).isFalse();
        assertThat(Money.isValid("0.00000001")).isFalse();
        assertThat(Money.isValid("15,5")).isFalse();
        assertThat(Money.isValid(null)).isFalse();
        assertThatThrownBy(() -> Money.parse("-1")).isInstanceOf(IllegalArgumentException.class);
    }
}
