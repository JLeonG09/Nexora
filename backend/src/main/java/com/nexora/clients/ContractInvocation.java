package com.nexora.clients;

import java.io.IOException;
import org.stellar.sdk.Address;
import org.stellar.sdk.xdr.EnvelopeType;
import org.stellar.sdk.xdr.HostFunction;
import org.stellar.sdk.xdr.HostFunctionType;
import org.stellar.sdk.xdr.Operation;
import org.stellar.sdk.xdr.OperationType;
import org.stellar.sdk.xdr.TransactionEnvelope;

/**
 * Dice si el sobre de {@code getTransaction} invoca el contrato indicado.
 * Sirve para comprobar que {@code createTxHash} apunta a la smart account del usuario.
 */
public final class ContractInvocation {

    private ContractInvocation() {
    }

    public static boolean targets(String envelopeXdr, String contractId) {
        if (envelopeXdr == null || envelopeXdr.isBlank() || contractId == null || contractId.isBlank()) {
            return false;
        }
        try {
            return targets(TransactionEnvelope.fromXdrBase64(envelopeXdr), contractId);
        } catch (IOException | RuntimeException e) {
            return false;
        }
    }

    private static boolean targets(TransactionEnvelope envelope, String contractId) {
        if (envelope == null || envelope.getDiscriminant() == null) {
            return false;
        }
        return switch (envelope.getDiscriminant()) {
            case ENVELOPE_TYPE_TX -> invokes(envelope.getV1().getTx().getOperations(), contractId);
            case ENVELOPE_TYPE_TX_V0 -> invokes(envelope.getV0().getTx().getOperations(), contractId);
            case ENVELOPE_TYPE_TX_FEE_BUMP -> {
                var inner = envelope.getFeeBump().getTx().getInnerTx();
                yield inner != null
                        && inner.getDiscriminant() == EnvelopeType.ENVELOPE_TYPE_TX
                        && inner.getV1() != null
                        && invokes(inner.getV1().getTx().getOperations(), contractId);
            }
            default -> false;
        };
    }

    private static boolean invokes(Operation[] operations, String contractId) {
        if (operations == null) {
            return false;
        }
        for (Operation operation : operations) {
            if (operation == null || operation.getBody() == null
                    || operation.getBody().getDiscriminant() != OperationType.INVOKE_HOST_FUNCTION
                    || operation.getBody().getInvokeHostFunctionOp() == null) {
                continue;
            }
            HostFunction host = operation.getBody().getInvokeHostFunctionOp().getHostFunction();
            if (host == null
                    || host.getDiscriminant() != HostFunctionType.HOST_FUNCTION_TYPE_INVOKE_CONTRACT
                    || host.getInvokeContract() == null
                    || host.getInvokeContract().getContractAddress() == null) {
                continue;
            }
            if (contractId.equals(Address.fromSCAddress(host.getInvokeContract().getContractAddress()).toString())) {
                return true;
            }
        }
        return false;
    }
}
