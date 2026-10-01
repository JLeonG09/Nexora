import {
  ContractError,
  decodeContractError,
  SimulationError,
  SmartAccountErrorCode,
  SubmissionError,
} from "smart-account-kit";
import type { SignError } from "./types.js";

const MESSAGES: Record<string, string> = {
  SpendingLimitExceeded: "La red rechazó el pago: supera el tope de gasto del mandato.",
  NotAllowed: "La red rechazó el pago: la política no lo permite.",
  OnlyCallContractAllowed: "La red rechazó el pago: la política no aplica a esta operación.",
  REGLA_EXPIRADA_O_INEXISTENTE: "La regla del mandato no existe o ya venció.",
};

function findContractError(error: unknown, seen = new Set<unknown>()): ContractError | null {
  if (error == null || seen.has(error)) {
    return null;
  }
  seen.add(error);
  if (error instanceof ContractError) {
    return error;
  }
  const decoded = decodeContractError(error);
  if (decoded) {
    return decoded;
  }
  if (error instanceof Error && error.cause) {
    return findContractError(error.cause, seen);
  }
  return null;
}

export function mapUnknownToSignError(
  error: unknown,
  stage: SignError["stage"],
): SignError {
  const contractError = findContractError(error);
  if (contractError) {
    const code =
      contractError.contractCode === 3000
        ? "REGLA_EXPIRADA_O_INEXISTENTE"
        : contractError.contractErrorName;
    const text = error instanceof Error ? error.message : contractError.message;
    return {
      code,
      contractCode: contractError.contractCode,
      stage,
      message: MESSAGES[code] ?? "La red rechazó el pago.",
      raw: text.includes(`#${contractError.contractCode}`)
        ? text
        : `Error(Contract, #${contractError.contractCode}) ${text}`,
    };
  }

  const text = error instanceof Error ? error.message : String(error);
  if (/balance is not sufficient/i.test(text)) {
    return {
      code: "SIMULACION_FALLIDA",
      contractCode: null,
      stage: "SIMULACION",
      message: "La simulación rechazó el pago: la caja no tiene saldo suficiente.",
      raw: text,
    };
  }
  if (error instanceof SimulationError) {
    return {
      code: "SIMULACION_FALLIDA",
      contractCode: null,
      stage: "SIMULACION",
      message: "La simulación rechazó el pago.",
      raw: text,
    };
  }
  if (error instanceof SubmissionError) {
    return {
      code: "ENVIO_FALLIDO",
      contractCode: null,
      stage: "ENVIO",
      message: "El RPC rechazó el envío.",
      raw: text,
    };
  }
  if (
    error instanceof Error &&
    "code" in error &&
    (error as { code: unknown }).code === SmartAccountErrorCode.TRANSACTION_TIMEOUT
  ) {
    return {
      code: "TIMEOUT_CONFIRMACION",
      contractCode: null,
      stage: "CONFIRMACION",
      message: "La red no confirmó el pago a tiempo.",
      raw: text,
    };
  }

  return {
    code: stage === "SIMULACION" ? "SIMULACION_FALLIDA" : "ENVIO_FALLIDO",
    contractCode: null,
    stage,
    message: "El pago no se pudo completar.",
    raw: text,
  };
}
