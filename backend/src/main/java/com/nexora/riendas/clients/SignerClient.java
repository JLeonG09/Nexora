package com.nexora.riendas.clients;

import com.nexora.riendas.dtos.signer.SignRequest;
import com.nexora.riendas.dtos.signer.SignResponse;
import com.nexora.riendas.dtos.signer.SignerAgentKeyDto;
import com.nexora.riendas.exceptions.SignerRejectedException;
import com.nexora.riendas.exceptions.SignerUnavailableException;
import java.util.Optional;
import java.util.UUID;

public interface SignerClient {

    /** GET {firmante}/agent-key: llave pública del agente para esa cuenta y versión. */
    SignerAgentKeyDto getAgentKey(String smartAccountAddress, int keyVersion) throws SignerUnavailableException;

    /** POST {firmante}/sign-and-submit. Idempotente por proposalId. */
    SignResponse signAndSubmit(SignRequest request) throws SignerUnavailableException, SignerRejectedException;

    /** GET {firmante}/transactions/{proposalId}; vacío si el firmante nunca la recibió (404). */
    Optional<SignResponse> getTransaction(UUID proposalId) throws SignerUnavailableException;
}
