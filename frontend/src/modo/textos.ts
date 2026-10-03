/**
 * Diccionario de textos por modo.
 *
 * Nexora tiene dos modos de interfaz (ver DESIGN.md, "Modos"):
 *
 *  - `simple` (por defecto): palabras de todos los días, sin ingles, sin
 *    siglas y sin nombres internos del sistema. El dinero se dice en
 *    "dólares" y los estados por su consecuencia ("Pagado").
 *  - `avanzado`: el vocabulario del protocolo (mandato, llave, USDC...).
 *
 * Regla: un mismo concepto se dice siempre igual dentro de un modo, y los dos
 * vocabularios no se mezclan en una pantalla. Cualquier texto visible que
 * dependa del modo sale de aqui (o va dentro de `<SoloAvanzado>` /
 * `<SoloSimple>`). Las cadenas de Avanzado son las que ya tenia la app.
 *
 * Archivo `.ts` sin componentes a proposito: asi lo pueden importar los
 * componentes sin romper el refresco en caliente de Vite.
 */

import type {
  AlertStatus,
  ApprovalStatus,
  MandateStatus,
  ProposalStatus,
  RejectionCode,
} from '@/api/types'

export type Modo = 'simple' | 'avanzado'

export const MODOS: readonly Modo[] = ['simple', 'avanzado']

type Par = Readonly<Record<Modo, string>>

/* ------------------------------------------------------------------ */
/* Frases                                                             */
/* ------------------------------------------------------------------ */

export const TEXTOS = {
  /* --- Terminos ---------------------------------------------------- */
  asistente: { simple: 'tu asistente', avanzado: 'el agente' },
  asistenteMayus: { simple: 'Tu asistente', avanzado: 'El agente' },

  /* --- Titulos y pestañas (alineados con el menu) ------------------ */
  tituloReglas: { simple: 'Mis reglas de pago', avanzado: 'Mandato' },
  tituloAprobaciones: { simple: 'Pagos por confirmar', avanzado: 'Aprobaciones' },
  tituloAlertas: { simple: 'Avisos de seguridad', avanzado: 'Alertas' },

  /* --- Tarjeta de pago --------------------------------------------- */
  tarjetaPagoA: { simple: 'Pago a', avanzado: 'Propuesta de pago a' },
  pasoPendiente: {
    simple: 'Es mayor de lo que puedo pagar solo: espera tu permiso en «Pendientes».',
    avanzado: 'Supera tu umbral: está esperando que lo apruebes en Pendientes › Aprobaciones.',
  },
  pasoAprobado: {
    simple: 'Lo aprobaste. Estoy haciendo el pago.',
    avanzado: 'Lo has aprobado. El agente está firmando.',
  },
  pasoEnviado: {
    simple: 'Enviado. Falta la confirmación final.',
    avanzado: 'Firmado y en la red. Falta que Stellar lo confirme.',
  },
  pasoConfirmado: {
    simple: 'Pagado. El dinero ya salió.',
    avanzado: 'Confirmado en la red. El dinero ya salió.',
  },
  pasoFallido: {
    simple: 'No se pudo pagar. No se movió dinero.',
    avanzado: 'La transacción ha fallado. No se ha movido dinero.',
  },
  aprobadoPorAgente: { simple: 'Lo pagó tu asistente', avanzado: 'Aprobado por el agente' },
  practicaQuedan: {
    simple: 'Pago de práctica: en tu cuenta quedan',
    avanzado: 'Saldo ficticio de tu cuenta tras el pago:',
  },

  /* --- Pagos por confirmar / Aprobaciones -------------------------- */
  aprobacionesDesc: {
    simple: 'Pagos mayores de lo que me dejaste pagar solo. No salen hasta que tú digas que sí.',
    avanzado:
      'Pagos que el agente entendió y que están dentro de tus topes, pero que superan el monto a partir del cual le diste permiso para actuar solo.',
  },
  aprobacionesVacioTitulo: { simple: 'Ningún pago espera tu permiso', avanzado: 'Nada esperando tu OK' },
  aprobacionesVacioDesc: {
    simple: 'Cuando pidas un pago mayor de lo que puedo pagar solo, aparecerá aquí para que lo confirmes.',
    avanzado: 'Cuando pidas algo por encima de tu umbral aparecerá aquí para que lo confirmes.',
  },
  aprobacionesFiltroTitulo: { simple: 'No hay pagos en esta lista', avanzado: 'Sin aprobaciones' },
  aprobacionesFiltroDesc: {
    simple: 'No hay pagos con este filtro.',
    avanzado: 'No hay aprobaciones con este filtro.',
  },
  aprobacionesFiltrar: { simple: 'Filtrar pagos', avanzado: 'Filtrar aprobaciones' },
  aprobacionesSustantivo: { simple: 'pagos', avanzado: 'aprobaciones' },
  enviandoOrden: { simple: 'Haciendo el pago…', avanzado: 'Enviando la orden a Stellar…' },
  rechazoDesc: {
    simple: 'No es obligatorio, pero te ayudará a recordar por qué lo paraste.',
    avanzado: 'No es obligatorio, pero es lo único que permite entender después por qué el agente se detuvo.',
  },
  aprobacionMotivo: {
    // En Simple no se enseña el motivo que redacta el servidor (habla de
    // umbral y de USDC): toda aprobación existe por esto mismo.
    simple: 'Motivo: es mayor de lo que tu asistente puede pagar solo.',
    avanzado: 'Motivo:',
  },
  rechazoNoReintenta: {
    simple: 'Tu asistente no volverá a intentarlo por su cuenta.',
    avanzado: 'El agente no volverá a intentarlo por su cuenta.',
  },

  /* --- Avisos de seguridad / Alertas ------------------------------- */
  alertasDesc: {
    simple:
      'Dinero que salió de tu cuenta sin que lo pidieras en el chat. Si no fuiste tú, pulsa «No, no fui yo» y paro todos los pagos.',
    avanzado:
      'Movimientos de USDC que salieron de tu cuenta sin que el agente los pidiera. Si no reconoces alguno, tu mandato se revoca y la llave del agente se invalida.',
  },
  alertaHacia: { simple: 'salió de tu cuenta hacia otra cuenta', avanzado: 'salida de tu cuenta hacia' },
  alertaReconocerMsg: {
    simple:
      'Si dices que sí, todo sigue como estaba. Hazlo solo si de verdad fuiste tú: alguien que quiera robarte intentaría que lo dieras por bueno.',
    avanzado:
      'Si dices que sí, el mandato sigue como estaba. Úsalo solo si te suena: un pago hecho desde tu cuenta sin que lo pidieras es exactamente lo que un atacante intentaría que dieras por bueno.',
  },
  alertaCerrarError: { simple: 'No se pudo cerrar el aviso', avanzado: 'No se pudo cerrar la alerta' },
  reportar1: {
    simple: 'Se pausan tus reglas de pago: tu asistente deja de poder pagar.',
    avanzado: 'Se revoca tu mandato: el agente deja de poder pagar.',
  },
  reportar2: {
    simple: 'Se cambia el permiso de tu asistente y el anterior deja de servir.',
    avanzado: 'Se genera una llave nueva y la anterior queda inservible.',
  },
  reportar3: {
    simple: 'Para volver a pagar tendrás que poner tus reglas de pago otra vez.',
    avanzado: 'Habrá que rehacer la clave en tu contrato y crear otro mandato.',
  },
  reportarFinal: {
    simple: 'Vas a pausar tus reglas de pago y a anular el permiso de tu asistente.',
    avanzado: 'Vas a perder el mandato actual y a inutilizar la llave del agente.',
  },
  reportarFinalNota: {
    simple: 'Tus pagos ya hechos no cambian. Solo se detienen los pagos automáticos, que podrás volver a activar.',
    avanzado:
      'Tus pagos ya confirmados siguen en pie. Lo único que se detiene es la capacidad automática de gastar, que tendrás que reautorizar.',
  },
  reportarBoton: { simple: 'Parar los pagos y cambiar el permiso', avanzado: 'Revocar y rotar la llave' },
  reportarHecho: {
    simple: 'Listo: paramos los pagos automáticos y cambiamos el permiso de tu asistente.',
    avanzado: 'Llave rotada a la versión',
  },
  alertasSigueActivo: {
    simple: 'Tus reglas de pago siguen activas mientras revisas. Si dices «No, no fui yo», se pausarán.',
    avanzado: 'Tu mandato sigue activo mientras revisas. Si reportas una alerta, se revocará.',
  },
  alertasFiltrar: { simple: 'Filtrar avisos', avanzado: 'Filtrar alertas' },
  alertasFiltroTitulo: { simple: 'Sin avisos', avanzado: 'Sin alertas' },
  alertasFiltroDesc: { simple: 'No hay avisos con este filtro.', avanzado: 'No hay alertas con este filtro.' },
  alertasSustantivo: { simple: 'avisos', avanzado: 'alertas' },

  /* --- Mis contactos ------------------------------------------------ */
  contactosDesc: {
    simple: 'A quién puedo pagar. Si un nombre no está aquí, no le pago aunque me lo pidas.',
    avanzado: 'A quién puede pagar el agente. Si un nombre no está aquí, el pago se rechaza aunque la IA lo entienda bien.',
  },
  contactoNuevoDesc: {
    simple: 'Solo podré pagar a las personas que agregues aquí.',
    avanzado: 'Con esta dirección autorizada podrá pagar el agente. Solo USDC.',
  },
  contactoDireccion: {
    simple: 'Dirección de su cuenta (empieza por G)',
    avanzado: 'Dirección Stellar (empieza por G)',
  },
  contactoNombreError: {
    simple: 'Necesito un nombre para encontrarlo.',
    avanzado: 'El agente necesita un nombre para buscarlo.',
  },
  contactoNotaAyuda: { simple: 'Solo para ti. Tu asistente no la lee.', avanzado: 'Solo para ti. El agente no la lee.' },
  contactoArchivarMsg: {
    simple:
      'Tu asistente ya no podrá pagarle. El contacto no se borra: se queda en tus movimientos para que sepas a quién se le pagó. Puedes volver a añadirlo luego.',
    avanzado:
      'El agente ya no podrá pagarle. El contacto no se borra: se queda en el historial de pagos para que se pueda explicar a quién se le pagó. Puedes volver a añadirlo luego.',
  },
  contactosVacioDesc: {
    simple: 'Añade al menos uno antes de pedir un pago. Solo pago a las personas de esta lista.',
    avanzado: 'Añade al menos uno antes de pedir un pago. El agente solo paga a direcciones de esta lista.',
  },
  contactosBuscar: { simple: 'Buscar por nombre', avanzado: 'Buscar por nombre o dirección' },

  /* --- Mis movimientos ---------------------------------------------- */
  historialVacioDesc: {
    simple: 'Cuando pidas el primero en el chat, aparecerá aquí con su estado.',
    avanzado: 'Cuando pidas el primero en el chat, aparecerá aquí con su estado y su enlace a la red.',
  },
  historialEnCursoNota: { simple: 'Enviándose o esperando tu permiso', avanzado: 'Firmados o esperando tu OK' },
  historialAprobo: { simple: 'Quién lo aprobó', avanzado: 'Aprobó' },

  /* --- Mis reglas de pago / Mandato --------------------------------- */
  reglasDesc: {
    simple: 'Lo que tu asistente puede pagar sin preguntarte. Puedes revisarlo y pausarlo cuando quieras.',
    avanzado:
      'El permiso que le das al agente para gastar sin preguntarte. Vive en tu smart account y no en este panel: por eso puedes revisarlo y revocarlo cuando quieras.',
  },
  reglasSinCuenta: {
    simple: 'Todavía no has conectado tu cuenta de pagos, así que no hay nada que autorizar.',
    avanzado: 'No hay ninguna smart account registrada, así que no hay nada que autorizar.',
  },
  reglasSinMandato: {
    simple:
      'No tienes reglas de pago activas: nunca las pusiste, las pausaste o vencieron. Hasta que las pongas, tu asistente no podrá hacer ningún pago.',
    avanzado:
      'No tienes ningún mandato activo: nunca lo creaste, lo revocaste o caducó. Hasta que crees uno, cualquier pago que pidas se rechazará.',
  },
  reglasCrear: { simple: 'Poner mis reglas de pago', avanzado: 'Crear mandato' },
  reglasCrearDesc: {
    simple: 'Lo que tu asistente puede pagar sin preguntarte, y hasta cuándo.',
    avanzado: 'Lo que el agente puede hacer sin preguntarte, y hasta cuándo.',
  },
  reglasLeyendaTopes: { simple: 'Tus tres límites', avanzado: 'Tus tres topes' },
  reglasPorEncima: { simple: 'Por encima de ese monto te pregunta.', avanzado: 'Por encima del umbral te pregunta.' },
  reglasLeyendaTecnica: {
    simple: 'Datos técnicos de la autorización',
    avanzado: 'La regla que autorizó al agente',
  },
  reglasGuardar: { simple: 'Guardar mis reglas de pago', avanzado: 'Autorizar al agente' },
  reglasVigente: { simple: 'Tus reglas de pago', avanzado: 'Tu mandato vigente' },
  reglasPausar: { simple: 'Pausar todos los pagos', avanzado: 'Revocar mandato' },
  reglasPausarTitulo: { simple: '¿Pausar todos los pagos?', avanzado: '¿Revocar el mandato?' },
  reglasPausarMsg: {
    simple: 'Tu asistente deja de poder pagar al instante. Para volver a pagar tendrás que poner tus reglas de pago otra vez.',
    avanzado:
      'El agente deja de poder pagar al instante y la llave queda invalidada. Tendrás que autorizar una llave nueva y crear otro mandato para volver a usarlo.',
  },
  reglasPausarConfirmar: { simple: 'Pausar', avanzado: 'Revocar' },
  reglasPausarError: { simple: 'No se pudieron pausar los pagos', avanzado: 'No se pudo revocar' },
  reglasCambiar: {
    simple:
      '¿Quieres cambiar los montos o la fecha? Pausa estas reglas y pon unas nuevas aquí mismo: así nadie puede subirte los límites sin tu permiso.',
    avanzado:
      '¿Quieres cambiar los topes o la fecha? Revoca este mandato y crea uno nuevo aquí mismo: un mandato no se edita, para que nadie pueda subirte los topes sin que lo autorices otra vez.',
  },
  reglasPausadasPor: { simple: 'Pausadas por', avanzado: 'Revocado por' },
  reglasPorAviso: { simple: 'un aviso de seguridad', avanzado: 'llave comprometida' },
  topeUmbralCero: {
    simple: 'El primer monto tiene que ser mayor que cero.',
    avanzado: 'El umbral tiene que ser mayor que cero.',
  },
  topeUmbralMayor: {
    simple: 'Lo que pago solo no puede ser mayor que el máximo por pago.',
    avanzado: 'El umbral no puede ser mayor que el tope por pago.',
  },
  topePorPagoMayor: {
    simple: 'El máximo por pago no puede ser mayor que el máximo del día.',
    avanzado: 'El tope por pago no puede ser mayor que el tope diario.',
  },

  /* --- Mi billetera -------------------------------------------------- */
  billeteraSaldo: { simple: 'Todavía no lo mostramos aquí.', avanzado: 'Todavía no lo leemos de Stellar.' },
  billeteraSinCuenta: {
    simple: 'Todavía no has conectado tu cuenta de pagos.',
    avanzado: 'No hay ninguna cuenta de Stellar registrada todavía.',
  },
  billeteraTopeDiario: { simple: 'de un máximo diario de', avanzado: 'de un tope diario de' },
  billeteraTopePorPago: { simple: 'Máximo por pago', avanzado: 'Tope por pago' },
  billeteraRevocadas: {
    simple: 'Tus reglas de pago están pausadas',
    avanzado: 'Tus reglas de pago están revocadas',
  },

  /* --- Alta ---------------------------------------------------------- */
  altaPie: {
    simple: 'Funciona con dinero de práctica: no se mueve dinero real.',
    avanzado: 'Funciona sobre la red de pruebas de Stellar, con dinero de práctica.',
  },
  altaListo: { simple: 'Ya puedes poner tus reglas de pago y pagar.', avanzado: 'Ya puedes crear tu mandato y pagar.' },
  altaPaso2: {
    simple: 'Conecta tu cuenta de pagos: pega aquí su dirección. Nexora solo la anota y no mueve nada.',
    avanzado:
      'Registra tu smart account: el contrato desde el que salen los pagos. Tú lo despliegas por fuera; aquí solo lo apuntamos.',
  },
  altaDireccion: {
    simple: 'Dirección de tu cuenta de pagos (empieza por C)',
    avanzado: 'Dirección del contrato (empieza por C)',
  },
  altaDireccionAyuda: {
    simple: 'Te la dio quien te ayudó a crear la cuenta. Tiene 56 letras y números.',
    avanzado: 'Copia la dirección C… que te dio tu despliegue.',
  },
  altaDespues: {
    simple: 'Después pondrás tus reglas de pago: cuánto puede pagar tu asistente y desde qué monto te pregunta.',
    avanzado: 'Después podrás crear tu mandato, que fija cuánto puede gastar el agente y a partir de qué monto te pregunta.',
  },

  /* --- Cuenta -------------------------------------------------------- */
  cuentaTipo: { simple: 'Tipo de cuenta', avanzado: 'Red' },

  /* --- Errores ------------------------------------------------------- */
  errorSinConexion: {
    simple: 'No hay conexión. Revisa tu internet y vuelve a intentarlo.',
    avanzado: 'No hay conexion con el servidor. Revisa que el backend este encendido.',
  },
  errorPantalla: {
    simple: 'No se ha perdido nada: tus pagos siguen su curso. Recarga la página para seguir.',
    avanzado:
      'No se ha perdido nada: los pagos siguen su curso en la red y el backend tiene el registro de todo. Recarga para seguir.',
  },
} as const satisfies Record<string, Par>

export type ClaveTexto = keyof typeof TEXTOS

/** Texto de una clave en un modo. Para codigo que no es un componente. */
export function texto(clave: ClaveTexto, modo: Modo): string {
  return TEXTOS[clave][modo]
}

/* ------------------------------------------------------------------ */
/* Moneda                                                             */
/* ------------------------------------------------------------------ */

/**
 * Etiqueta del activo en pantalla. En Simple, USDC se dice "dólares" (vale
 * lo mismo que un dólar). Solo cambia la etiqueta: el monto es el mismo.
 */
export function etiquetaActivo(asset: string | null | undefined, modo: Modo): string {
  const codigo = asset ?? 'USDC'
  if (modo === 'simple' && codigo.toUpperCase() === 'USDC') return 'dólares'
  return codigo
}

/**
 * Lo mismo dentro de una frase que redacta el servidor (el resumen de las
 * reglas, el texto de una alerta): en Simple, "45 USDC" pasa a "45 dólares".
 * Solo cambia la palabra; las cifras quedan como vienen.
 */
export function etiquetaActivoEnTexto(frase: string, modo: Modo): string {
  return modo === 'simple' ? frase.replace(/\bUSDC\b/g, 'dólares') : frase
}

/* ------------------------------------------------------------------ */
/* Estados                                                            */
/* ------------------------------------------------------------------ */

/** Estado de un pago, en palabras. Simple dice la consecuencia. */
export const ESTADO_PAGO: Readonly<Record<ProposalStatus, Par>> = {
  PROPUESTO: { simple: 'Entendido', avanzado: 'Interpretada' },
  RECHAZADO: { simple: 'No se pagó', avanzado: 'Rechazada' },
  PENDIENTE_APROBACION: { simple: 'Espera tu permiso', avanzado: 'Esperando tu OK' },
  APROBADO: { simple: 'Aprobado', avanzado: 'Aprobada' },
  ENVIADO: { simple: 'Enviando', avanzado: 'Enviando' },
  CONFIRMADO: { simple: 'Pagado', avanzado: 'Confirmada' },
  FALLIDO: { simple: 'Falló', avanzado: 'Fallida' },
}

export function etiquetaEstadoPago(status: ProposalStatus, modo: Modo): string {
  return ESTADO_PAGO[status]?.[modo] ?? status
}

export const ESTADO_APROBACION: Readonly<Record<ApprovalStatus, Par>> = {
  PENDIENTE: { simple: 'Espera tu permiso', avanzado: 'Esperando tu OK' },
  APROBADA: { simple: 'Aprobado', avanzado: 'Aprobada' },
  RECHAZADA: { simple: 'Rechazado', avanzado: 'Rechazada' },
  EXPIRADA: { simple: 'Vencido', avanzado: 'Vencida' },
}

export const ESTADO_ALERTA: Readonly<Record<AlertStatus, Par>> = {
  PENDIENTE: { simple: 'Sin revisar', avanzado: 'Sin revisar' },
  RECONOCIDA: { simple: 'Fuiste tú', avanzado: 'Reconocida por ti' },
  REPORTADA: { simple: 'Reportado', avanzado: 'Reportada' },
}

export const ESTADO_MANDATO: Readonly<Record<MandateStatus, Par>> = {
  ACTIVO: { simple: 'Activas', avanzado: 'Activo' },
  REVOCADO: { simple: 'Pausadas', avanzado: 'Revocado' },
  EXPIRADO: { simple: 'Vencidas', avanzado: 'Vencido' },
}

/** Motivo corto de un rechazo. El texto largo lo redacta el backend. */
export const MOTIVO_RECHAZO: Readonly<Record<RejectionCode, Par>> = {
  ESQUEMA_INVALIDO: { simple: 'No lo entendí', avanzado: 'No entendido' },
  ACTIVO_NO_PERMITIDO: { simple: 'Moneda no permitida', avanzado: 'Activo no permitido' },
  CONFIANZA_BAJA: { simple: 'No lo entendí bien', avanzado: 'Confianza baja' },
  CAMPO_NO_FUNDAMENTADO: { simple: 'Faltan datos', avanzado: 'Datos incompletos' },
  CONTACTO_NO_ENCONTRADO: { simple: 'No es un contacto', avanzado: 'No es un contacto' },
  CONTACTO_AMBIGUO: { simple: 'Hay dos contactos parecidos', avanzado: 'Contacto ambiguo' },
  MONTO_NO_EN_TEXTO: { simple: 'Falta el monto', avanzado: 'Monto inventado' },
  MONTO_AMBIGUO: { simple: 'Monto poco claro', avanzado: 'Monto ambiguo' },
  INTENCION_NEGADA: { simple: 'No haré ese pago', avanzado: 'Pago negado' },
  SIN_MANDATO_ACTIVO: { simple: 'Sin reglas de pago', avanzado: 'Sin mandato' },
  MANDATO_EXPIRADO: { simple: 'Reglas de pago vencidas', avanzado: 'Mandato vencido' },
  SUPERA_TOPE_TRANSACCION: { simple: 'Supera el máximo por pago', avanzado: 'Supera el tope por pago' },
  SUPERA_TOPE_DIARIO: { simple: 'Supera el máximo del día', avanzado: 'Supera el tope diario' },
  LIMITE_FRECUENCIA: { simple: 'Demasiados pedidos seguidos', avanzado: 'Demasiadas solicitudes' },
  RECHAZADO_POR_USUARIO: { simple: 'Lo rechazaste tú', avanzado: 'Rechazada por ti' },
  APROBACION_EXPIRADA: { simple: 'Se venció el permiso', avanzado: 'Aprobación vencida' },
  MANDATO_REVOCADO: { simple: 'Reglas de pago pausadas', avanzado: 'Mandato revocado' },
}

/** Motivo corto, o el propio codigo si no esta en el mapa. */
export function motivoRechazo(code: string | null | undefined, modo: Modo): string | null {
  if (!code) return null
  return MOTIVO_RECHAZO[code as RejectionCode]?.[modo] ?? code
}
