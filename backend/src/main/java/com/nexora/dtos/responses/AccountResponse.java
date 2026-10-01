package com.nexora.dtos.responses;

import com.nexora.entities.Account;
import java.time.Instant;
import java.util.UUID;

public record AccountResponse(
        UUID id,
        UUID userId,
        String smartAccountAddress,
        String credentialId,
        String network,
        String explorerUrl,
        Instant createdAt) {

    public static AccountResponse from(Account account, String explorerBaseUrl) {
        return new AccountResponse(
                account.getId(),
                account.getUserId(),
                account.getSmartAccountAddress(),
                account.getCredentialId(),
                account.getNetwork(),
                explorerBaseUrl + "/contract/" + account.getSmartAccountAddress(),
                account.getCreatedAt());
    }
}
