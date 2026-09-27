package com.nexora.riendas.services;

import com.nexora.riendas.clients.SignerClient;
import com.nexora.riendas.config.AppProperties;
import com.nexora.riendas.dtos.signer.SignResponse;
import com.nexora.riendas.dtos.signer.SignerErrorDto;
import com.nexora.riendas.entities.Approval;
import com.nexora.riendas.entities.PaymentProposal;
import com.nexora.riendas.entities.enums.ApprovalStatus;
import com.nexora.riendas.entities.enums.ProposalStatus;
import com.nexora.riendas.exceptions.SignerUnavailableException;
import com.nexora.riendas.repositories.ApprovalRepository;
import com.nexora.riendas.repositories.PaymentProposalRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Propuestas en ENVIADO (CONTRATOS_EQUIPO.md §5.4): consulta GET /transactions/{proposalId} cada 10 s
 * durante 2 min. Nunca reenvía un pago. Un 404 solo cuenta como FALLIDO cuando ya venció la espera de
 * sign-and-submit; antes, el firmante todavía puede estar procesando esa misma solicitud.
 */
@Component
public class ScheduledJobs {

    private static final Logger log = LoggerFactory.getLogger(ScheduledJobs.class);
    static final Duration POLL_WINDOW = Duration.ofMinutes(2);
    static final String NOT_RECEIVED_CODE = "ENVIO_FALLIDO";
    static final String NOT_RECEIVED_MESSAGE = "El firmante no tiene registro de este pago: no se envió a la red.";

    private final PaymentProposalRepository proposalRepository;
    private final ApprovalRepository approvalRepository;
    private final PaymentProposalService proposalService;
    private final SignerClient signerClient;
    private final Duration signerReadTimeout;

    public ScheduledJobs(PaymentProposalRepository proposalRepository, ApprovalRepository approvalRepository,
                         PaymentProposalService proposalService, SignerClient signerClient, AppProperties properties) {
        this.proposalRepository = proposalRepository;
        this.approvalRepository = approvalRepository;
        this.proposalService = proposalService;
        this.signerClient = signerClient;
        this.signerReadTimeout = Duration.ofMillis(properties.signer().readTimeoutMs());
    }

    @Scheduled(fixedDelayString = "${app.jobs.sent-poll-interval-ms:10000}",
            initialDelayString = "${app.jobs.sent-poll-interval-ms:10000}")
    public void pollSentProposals() {
        Instant now = Instant.now();
        List<PaymentProposal> sent = proposalRepository.findByStatusAndSentAtAfter(ProposalStatus.ENVIADO,
                now.minus(signerReadTimeout).minus(POLL_WINDOW));
        for (PaymentProposal proposal : sent) {
            try {
                pollOne(proposal, now);
            } catch (RuntimeException e) {
                log.warn("No se pudo consultar la propuesta {}: {}", proposal.getId(), e.getMessage());
            }
        }
    }

    /** Aprobaciones PENDIENTE vencidas → EXPIRADA y propuesta RECHAZADO (APROBACION_EXPIRADA). */
    @Scheduled(fixedDelayString = "${app.jobs.approval-expiry-interval-ms:60000}",
            initialDelayString = "${app.jobs.approval-expiry-interval-ms:60000}")
    public void expireApprovals() {
        for (Approval approval : approvalRepository.findByStatusAndExpiresAtBefore(ApprovalStatus.PENDIENTE,
                Instant.now())) {
            try {
                proposalService.expireApproval(approval.getId());
            } catch (RuntimeException e) {
                log.warn("No se pudo vencer la aprobación {}: {}", approval.getId(), e.getMessage());
            }
        }
    }

    private void pollOne(PaymentProposal proposal, Instant now) {
        Optional<SignResponse> response;
        try {
            response = signerClient.getTransaction(proposal.getId());
        } catch (SignerUnavailableException e) {
            log.info("Firmante no disponible al consultar {}; se reintenta en la próxima vuelta.", proposal.getId());
            return;
        }
        if (response.isPresent()) {
            proposalService.applySignerResponse(proposal.getId(), response.get());
        } else if (proposal.getSentAt().isBefore(now.minus(signerReadTimeout))) {
            proposalService.applySignerResponse(proposal.getId(), new SignResponse(proposal.getId(),
                    SignResponse.FALLIDO, null, null, null, null,
                    new SignerErrorDto(NOT_RECEIVED_CODE, null, "ENVIO", NOT_RECEIVED_MESSAGE, "404")));
        }
    }
}
