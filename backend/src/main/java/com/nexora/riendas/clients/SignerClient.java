package com.nexora.riendas.clients;

import com.nexora.riendas.dtos.signer.SignerAgentKeyDto;
import com.nexora.riendas.exceptions.SignerUnavailableException;

public interface SignerClient {

    /** GET {firmante}/agent-key: llave pública del agente para esa cuenta y versión. */
    SignerAgentKeyDto getAgentKey(String smartAccountAddress, int keyVersion) throws SignerUnavailableException;
}
