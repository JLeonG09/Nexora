export class SignerError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "SignerError";
    this.status = status;
    this.code = code;
  }
}

export function solicitudInvalida(message: string): SignerError {
  return new SignerError(400, "SOLICITUD_INVALIDA", message);
}

export function claveServicioInvalida(): SignerError {
  return new SignerError(401, "CLAVE_SERVICIO_INVALIDA", "La clave de servicio es inválida o falta.");
}

export function noEncontrado(message: string): SignerError {
  return new SignerError(404, "RECURSO_NO_ENCONTRADO", message);
}

export function llaveNoCoincide(): SignerError {
  return new SignerError(400, "LLAVE_NO_COINCIDE", "La llave derivada no es la del mandato.");
}

export function enProceso(): SignerError {
  return new SignerError(409, "EN_PROCESO", "Esa propuesta ya se está firmando.");
}

export function rpcNoDisponible(message = "No se pudo hablar con el RPC de Stellar."): SignerError {
  return new SignerError(503, "RPC_NO_DISPONIBLE", message);
}
