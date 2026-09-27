package com.nexora.riendas.entities.enums;

/**
 * Motivos de rechazo de una propuesta. Los marcadores {nombre}, {monto}, {fecha},
 * {perTxLimit} y {disponible} se reemplazan al construir el mensaje final.
 */
public enum RejectionCode {
    ESQUEMA_INVALIDO("No entendí bien el pago. Escríbelo como \"Págale 15 USDC a Ana por el logo\"."),
    ACTIVO_NO_PERMITIDO("Por ahora solo puedo pagar en USDC."),
    CONFIANZA_BAJA("No estoy seguro de haber entendido. ¿Puedes escribirlo de nuevo con el nombre y el monto?"),
    CAMPO_NO_FUNDAMENTADO("No pude sacar todos los datos de tu mensaje. Incluye nombre, monto y concepto."),
    CONTACTO_NO_ENCONTRADO("\"{nombre}\" no está en tus contactos. Agrégalo primero en Contactos."),
    CONTACTO_AMBIGUO("Tienes varios contactos que coinciden con \"{nombre}\". Usa el nombre exacto."),
    MONTO_NO_EN_TEXTO("El monto que entendí ({monto}) no aparece en tu mensaje. Escríbelo de nuevo en números."),
    MONTO_AMBIGUO("Escribe el monto sin separador de miles, por ejemplo 1000 o 2.5."),
    SIN_MANDATO_ACTIVO("No tienes un mandato activo. Crea uno para que el agente pueda pagar."),
    MANDATO_EXPIRADO("Tu mandato venció el {fecha}. Crea uno nuevo."),
    SUPERA_TOPE_TRANSACCION("No hice el pago: supera tu tope por transacción ({perTxLimit} USDC)."),
    SUPERA_TOPE_DIARIO("No hice el pago: solo te quedan {disponible} USDC en las últimas 24 horas."),
    LIMITE_FRECUENCIA("Hiciste muchos pagos seguidos. Espera unos minutos."),
    RECHAZADO_POR_USUARIO("Rechazaste este pago."),
    APROBACION_EXPIRADA("La solicitud de aprobación venció sin respuesta."),
    MANDATO_REVOCADO("El mandato fue revocado antes de aprobar este pago.");

    private final String defaultMessage;

    RejectionCode(String defaultMessage) {
        this.defaultMessage = defaultMessage;
    }

    public String defaultMessage() {
        return defaultMessage;
    }
}
