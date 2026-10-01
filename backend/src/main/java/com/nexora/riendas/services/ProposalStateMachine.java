package com.nexora.riendas.services;

import static com.nexora.riendas.entities.enums.ProposalStatus.APROBADO;
import static com.nexora.riendas.entities.enums.ProposalStatus.CONFIRMADO;
import static com.nexora.riendas.entities.enums.ProposalStatus.ENVIADO;
import static com.nexora.riendas.entities.enums.ProposalStatus.FALLIDO;
import static com.nexora.riendas.entities.enums.ProposalStatus.PENDIENTE_APROBACION;
import static com.nexora.riendas.entities.enums.ProposalStatus.PROPUESTO;
import static com.nexora.riendas.entities.enums.ProposalStatus.RECHAZADO;

import com.nexora.riendas.entities.PaymentProposal;
import com.nexora.riendas.entities.enums.ProposalStatus;
import com.nexora.riendas.exceptions.ApiException;
import com.nexora.riendas.exceptions.ErrorCode;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/** Transiciones permitidas de una propuesta (CONTRATOS_EQUIPO.md §6). Cualquier otra → 409 ESTADO_INVALIDO. */
@Component
public class ProposalStateMachine {

    private static final Map<ProposalStatus, Set<ProposalStatus>> ALLOWED = Map.of(
            PROPUESTO, EnumSet.of(RECHAZADO, PENDIENTE_APROBACION, APROBADO),
            PENDIENTE_APROBACION, EnumSet.of(APROBADO, RECHAZADO),
            APROBADO, EnumSet.of(ENVIADO),
            ENVIADO, EnumSet.of(CONFIRMADO, FALLIDO),
            RECHAZADO, EnumSet.noneOf(ProposalStatus.class),
            CONFIRMADO, EnumSet.noneOf(ProposalStatus.class),
            FALLIDO, EnumSet.noneOf(ProposalStatus.class));

    public boolean canTransition(ProposalStatus from, ProposalStatus to) {
        return ALLOWED.getOrDefault(from, Set.of()).contains(to);
    }

    public void transition(PaymentProposal proposal, ProposalStatus to) {
        if (!canTransition(proposal.getStatus(), to)) {
            throw new ApiException(ErrorCode.ESTADO_INVALIDO,
                    "No se puede pasar una propuesta de " + proposal.getStatus() + " a " + to + ".");
        }
        proposal.setStatus(to);
    }
}
