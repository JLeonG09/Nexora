package com.nexora.exceptions;

import java.util.List;

/** Error de negocio que se traduce al formato uniforme con su {@link ErrorCode}. */
public class ApiException extends RuntimeException {

    private final ErrorCode code;
    private final transient List<ErrorResponse.FieldErrorDetail> details;

    public ApiException(ErrorCode code) {
        this(code, code.defaultMessage(), List.of());
    }

    public ApiException(ErrorCode code, String message) {
        this(code, message, List.of());
    }

    public ApiException(ErrorCode code, String message, List<ErrorResponse.FieldErrorDetail> details) {
        super(message);
        this.code = code;
        this.details = details;
    }

    public static ApiException field(ErrorCode code, String field, String message) {
        return new ApiException(code, code.defaultMessage(), List.of(new ErrorResponse.FieldErrorDetail(field, message)));
    }

    public ErrorCode code() {
        return code;
    }

    public List<ErrorResponse.FieldErrorDetail> details() {
        return details;
    }
}
