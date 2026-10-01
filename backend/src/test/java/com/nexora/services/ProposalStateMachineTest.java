package com.nexora.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nexora.entities.PaymentProposal;
import com.nexora.entities.enums.ProposalStatus;
import com.nexora.exceptions.ApiException;
import com.nexora.exceptions.ErrorCode;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class ProposalStateMachineTest {

    private static final Map<ProposalStatus, Set<ProposalStatus>> EXPECTED = Map.of(
            ProposalStatus.PROPUESTO, EnumSet.of(ProposalStatus.RECHAZADO, ProposalStatus.PENDIENTE_APROBACION,
                    ProposalStatus.APROBADO),
            ProposalStatus.PENDIENTE_APROBACION, EnumSet.of(ProposalStatus.APROBADO, ProposalStatus.RECHAZADO),
            ProposalStatus.APROBADO, EnumSet.of(ProposalStatus.ENVIADO),
            ProposalStatus.ENVIADO, EnumSet.of(ProposalStatus.CONFIRMADO, ProposalStatus.FALLIDO),
            ProposalStatus.RECHAZADO, EnumSet.noneOf(ProposalStatus.class),
            ProposalStatus.CONFIRMADO, EnumSet.noneOf(ProposalStatus.class),
            ProposalStatus.FALLIDO, EnumSet.noneOf(ProposalStatus.class));

    private final ProposalStateMachine stateMachine = new ProposalStateMachine();

    @Test
    void onlyContractTransitionsAreAllowed() {
        for (ProposalStatus from : ProposalStatus.values()) {
            for (ProposalStatus to : ProposalStatus.values()) {
                assertThat(stateMachine.canTransition(from, to))
                        .as("%s → %s", from, to)
                        .isEqualTo(EXPECTED.get(from).contains(to));
            }
        }
    }

    @Test
    void happyPathChangesStatus() {
        PaymentProposal proposal = proposal(ProposalStatus.PROPUESTO);
        stateMachine.transition(proposal, ProposalStatus.APROBADO);
        stateMachine.transition(proposal, ProposalStatus.ENVIADO);
        stateMachine.transition(proposal, ProposalStatus.CONFIRMADO);
        assertThat(proposal.getStatus()).isEqualTo(ProposalStatus.CONFIRMADO);
    }

    @Test
    void invalidTransitionThrowsEstadoInvalidoAndKeepsStatus() {
        PaymentProposal proposal = proposal(ProposalStatus.CONFIRMADO);
        assertThatThrownBy(() -> stateMachine.transition(proposal, ProposalStatus.ENVIADO))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo(ErrorCode.ESTADO_INVALIDO));
        assertThat(proposal.getStatus()).isEqualTo(ProposalStatus.CONFIRMADO);

        PaymentProposal proposed = proposal(ProposalStatus.PROPUESTO);
        assertThatThrownBy(() -> stateMachine.transition(proposed, ProposalStatus.ENVIADO))
                .isInstanceOf(ApiException.class);
    }

    private static PaymentProposal proposal(ProposalStatus status) {
        PaymentProposal proposal = new PaymentProposal();
        proposal.setStatus(status);
        return proposal;
    }
}
