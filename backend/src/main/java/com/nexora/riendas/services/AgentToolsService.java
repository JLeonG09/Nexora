package com.nexora.riendas.services;

import com.nexora.riendas.dtos.responses.AgentToolsResponses.ContactItem;
import com.nexora.riendas.dtos.responses.AgentToolsResponses.HistoryItem;
import com.nexora.riendas.dtos.responses.AgentToolsResponses.Items;
import com.nexora.riendas.dtos.responses.AgentToolsResponses.Limits;
import com.nexora.riendas.entities.Contact;
import com.nexora.riendas.entities.PaymentProposal;
import com.nexora.riendas.repositories.AccountRepository;
import com.nexora.riendas.repositories.ContactRepository;
import com.nexora.riendas.repositories.PaymentProposalRepository;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Herramientas de solo lectura para la IA (CONTRATOS_EQUIPO.md §4.4). Nunca exponen direcciones Stellar. */
@Service
public class AgentToolsService {

    private final AccountRepository accountRepository;
    private final ContactRepository contactRepository;
    private final PaymentProposalRepository proposalRepository;
    private final ContactService contactService;
    private final MandateService mandateService;
    private final TransactionTemplate readOnlyTx;

    public AgentToolsService(AccountRepository accountRepository, ContactRepository contactRepository,
                             PaymentProposalRepository proposalRepository, ContactService contactService,
                             MandateService mandateService, PlatformTransactionManager transactionManager) {
        this.accountRepository = accountRepository;
        this.contactRepository = contactRepository;
        this.proposalRepository = proposalRepository;
        this.contactService = contactService;
        this.mandateService = mandateService;
        this.readOnlyTx = new TransactionTemplate(transactionManager);
        this.readOnlyTx.setReadOnly(true);
    }

    public Items<ContactItem> contacts(UUID userId) {
        return new Items<>(contactService.listAll(userId).stream()
                .map(contact -> new ContactItem(contact.getId(), contact.getName()))
                .toList());
    }

    public Limits limits(UUID userId) {
        return accountRepository.findByUserId(userId)
                .flatMap(account -> mandateService.findActive(account.getId()))
                .map(mandate -> Limits.from(mandateService.limitsOf(mandate)))
                .orElseGet(Limits::none);
    }

    public Items<HistoryItem> history(UUID userId, int limit) {
        return readOnlyTx.execute(status -> {
            List<PaymentProposal> proposals = proposalRepository
                    .findByUserId(userId, PageRequest.of(0, limit, Sort.by("createdAt").descending()))
                    .getContent();
            Map<UUID, String> names = contactRepository
                    .findAllById(proposals.stream().map(PaymentProposal::getContactId).filter(Objects::nonNull).toList())
                    .stream()
                    .collect(Collectors.toMap(Contact::getId, Contact::getName));
            return new Items<>(proposals.stream()
                    .map(proposal -> new HistoryItem(
                            proposal.getId(),
                            proposal.getContactId() == null ? null : names.get(proposal.getContactId()),
                            proposal.getAmount() == null ? null : Money.format(proposal.getAmount()),
                            proposal.getAssetCode(),
                            proposal.getMemo(),
                            proposal.getStatus().name(),
                            proposal.getCreatedAt()))
                    .toList());
        });
    }
}
