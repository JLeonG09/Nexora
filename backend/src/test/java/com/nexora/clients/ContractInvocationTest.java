package com.nexora.clients;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.stellar.sdk.Account;
import org.stellar.sdk.KeyPair;
import org.stellar.sdk.Network;
import org.stellar.sdk.Transaction;
import org.stellar.sdk.TransactionBuilder;
import org.stellar.sdk.operations.InvokeHostFunctionOperation;

public class ContractInvocationTest {

    /** Direcciones de contrato reales de testnet: el SDK rechaza un C… sin checksum. */
    public static final String CONTRACT = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
    public static final String OTHER = "CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4";

    @Test
    void successEnvelopeThatInvokesTheContractMatches() {
        assertThat(ContractInvocation.targets(envelope(CONTRACT), CONTRACT)).isTrue();
    }

    @Test
    void anotherContractDoesNotMatch() {
        assertThat(ContractInvocation.targets(envelope(OTHER), CONTRACT)).isFalse();
    }

    @Test
    void garbageXdrDoesNotMatch() {
        assertThat(ContractInvocation.targets("no-es-xdr", CONTRACT)).isFalse();
        assertThat(ContractInvocation.targets(null, CONTRACT)).isFalse();
    }

    public static String envelope(String contractId) {
        KeyPair source = KeyPair.random();
        Transaction tx = new TransactionBuilder(new Account(source.getAccountId(), 1L), Network.TESTNET)
                .setBaseFee(100)
                .setTimeout(30)
                .addOperation(InvokeHostFunctionOperation
                        .invokeContractFunctionOperationBuilder(contractId, "add_context_rule", List.of())
                        .build())
                .build();
        return tx.toEnvelopeXdrBase64();
    }
}
