package com.nexora.dtos.responses;

import java.util.UUID;

public record ChatResponse(UUID conversationId, ChatReplyDto reply, ProposalSummaryDto proposal) {
}
