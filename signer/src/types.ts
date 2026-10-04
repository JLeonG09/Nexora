export type SignError = {
  code: string;
  contractCode: number | null;
  stage: "SIMULACION" | "ENVIO" | "CONFIRMACION";
  message: string;
  raw: string;
};

export type SignResponseBody = {
  proposalId: string;
  status: "CONFIRMADO" | "FALLIDO" | "ENVIADO";
  txHash: string | null;
  ledger: number | null;
  submittedAt: string | null;
  confirmedAt: string | null;
  error: SignError | null;
};

export type ParsedSignRequest = {
  proposalId: string;
  smartAccountAddress: string;
  contextRuleId: number;
  keyVersion: number;
  agentPublicKeyHex: string;
  destinationAddress: string;
  amount: string;
  amountUnits: string;
  assetContractId: string;
  memo: string;
  /** Tope diario del mandato, en unidades de 7 decimales. */
  dailyLimitUnits: string;
};

export type SubmitJob = {
  smartAccountAddress: string;
  contextRuleId: number;
  destinationAddress: string;
  amount: string;
  assetContractId: string;
  memo: string;
  agentSecret: string;
  agentPublicKeyHex: string;
  /** Tope diario del mandato, en unidades de 7 decimales. */
  dailyLimitUnits: string;
};

export type SubmitPayment = (job: SubmitJob) => Promise<Omit<SignResponseBody, "proposalId">>;
