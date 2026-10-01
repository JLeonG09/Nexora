package com.nexora.exceptions;

import org.springframework.http.HttpStatus;

public enum ErrorCode {
    VALIDACION_FALLIDA(HttpStatus.BAD_REQUEST, "Hay datos inválidos en la solicitud."),
    USUARIO_NO_IDENTIFICADO(HttpStatus.UNAUTHORIZED, "No pudimos identificar al usuario. Crea un usuario o vuelve a iniciar."),
    CLAVE_SERVICIO_INVALIDA(HttpStatus.UNAUTHORIZED, "La clave de servicio falta o es incorrecta."),
    RECURSO_NO_ENCONTRADO(HttpStatus.NOT_FOUND, "No encontramos lo que buscas."),
    CUENTA_YA_REGISTRADA(HttpStatus.CONFLICT, "Ya tienes una cuenta registrada o esa dirección ya está en uso."),
    MANDATO_ACTIVO_EXISTENTE(HttpStatus.CONFLICT, "Ya tienes un mandato activo. Revócalo antes de crear otro."),
    SIN_MANDATO_ACTIVO(HttpStatus.CONFLICT, "No tienes un mandato activo."),
    SIN_CUENTA(HttpStatus.CONFLICT, "Primero registra tu smart account."),
    ESTADO_INVALIDO(HttpStatus.CONFLICT, "Esta acción no se puede hacer en el estado actual."),
    CONTACTO_DUPLICADO(HttpStatus.CONFLICT, "Ya tienes un contacto con ese nombre."),
    LLAVE_DESACTUALIZADA(HttpStatus.CONFLICT, "La llave del agente cambió. Pide la llave actual y vuelve a crear el mandato."),
    LIMITE_FRECUENCIA(HttpStatus.TOO_MANY_REQUESTS, "Hiciste muchas solicitudes seguidas. Espera un momento."),
    IA_NO_DISPONIBLE(HttpStatus.SERVICE_UNAVAILABLE, "El asistente no está disponible en este momento. Intenta de nuevo en unos segundos."),
    FIRMANTE_NO_DISPONIBLE(HttpStatus.SERVICE_UNAVAILABLE, "El servicio de firma no está disponible en este momento. Intenta de nuevo en unos segundos."),
    ERROR_INTERNO(HttpStatus.INTERNAL_SERVER_ERROR, "Ocurrió un error inesperado. Intenta de nuevo.");

    private final HttpStatus status;
    private final String defaultMessage;

    ErrorCode(HttpStatus status, String defaultMessage) {
        this.status = status;
        this.defaultMessage = defaultMessage;
    }

    public HttpStatus status() {
        return status;
    }

    public String defaultMessage() {
        return defaultMessage;
    }
}
