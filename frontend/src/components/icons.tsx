/**
 * Iconos.
 *
 * Un unico archivo con todos los SVG que usa la app, en vez de una libreria
 * externa. Motivo: son 25 iconos de un solo trazo (mismo estilo, mismo
 * grosor), pesan menos que cualquier paquete y no dependemos de que un
 * tercero mantenga los nombres.
 *
 * Convenciones:
 *  - `viewBox` 24x24, `stroke="currentColor"`, sin relleno.
 *  - El color lo hereda el padre via `currentColor`.
 *  - `aria-hidden`: el significado siempre lo lleva el texto al lado.
 */

import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

/* --- Navegacion ------------------------------------------------------ */

/** El chat: la pantalla principal. Burbuja con puntos. */
export const IconChat = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 14.5a2.5 2.5 0 0 1-2.5 2.5H8l-4 3.5v-14A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5z" />
    <path d="M9 9.5h6M9 12.5h4" />
  </Icon>
)

/** Aprobaciones: escudo con check. */
export const IconAprobaciones = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5 5 6v6c0 4.2 2.9 7.6 7 8.5 4.1-.9 7-4.3 7-8.5V6z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
)

/** Alertas: triángulo con exclamación. */
export const IconAlertaMovimiento = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4.5 3.2 19h17.6z" />
    <path d="M12 10v4M12 16.8v.2" />
  </Icon>
)

/** Contactos: dos personas. */
export const IconContactos = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <path d="M16 5.5a3 3 0 0 1 0 5.6M17.5 15.2c1.9.8 3 2.5 3 4.3" />
  </Icon>
)

/** Mandato: el documento con tope de gasto. */
export const IconMandato = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3.5h8l4 4V20.5H6z" />
    <path d="M14 3.5v4h4" />
    <path d="M9 12h6M9 15.5h6" />
  </Icon>
)

/** Historial: lista con reloj. */
export const IconHistorial = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </Icon>
)

/** Auditoría: líneas de registro. */
export const IconAuditoria = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 4.5h14M5 9.5h14M5 14.5h9M5 19.5h6" />
  </Icon>
)

/** Demo: el atacante con la llave robada. */
export const IconDemo = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5v5" />
    <path d="M8.5 15.5a4 4 0 0 0 7 0" />
  </Icon>
)
/** Alias con nombre de dominio: "la billetera" en vez de "la cartera". */
/* --- Acciones -------------------------------------------------------- */

export const IconMas = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const IconBuscar = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 4 4" />
  </Icon>
)

export const IconFiltro = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 5.5h17l-6.5 7.5v6.5l-4 2v-8.5z" />
  </Icon>
)

export const IconBorrar = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16" />
    <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
    <path d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7" />
    <path d="M10 11v6M14 11v6" />
  </Icon>
)

export const IconEditar = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4 16.5z" />
    <path d="m14.5 6.5 3 3" />
  </Icon>
)

export const IconEnviar = (p: IconProps) => (
  <Icon {...p}>
    <path d="m21 3-8.5 18-2.5-7.5L2.5 11z" />
    <path d="M21 3 10 13.5" />
  </Icon>
)

export const IconRefrescar = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4v4.5h-4.5" />
  </Icon>
)

export const IconCopiar = (p: IconProps) => (
  <Icon {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
  </Icon>
)

export const IconExterno = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 4h6v6" />
    <path d="M20 4 11 13" />
    <path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
  </Icon>
)

export const IconCerrar = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
)

export const IconMenu = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </Icon>
)

export const IconSol = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
)

export const IconLuna = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5" />
  </Icon>
)

export const IconSalir = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14" />
    <path d="M9 8 5 12l4 4" />
    <path d="M5 12h9" />
  </Icon>
)

/* --- Estados y avisos ------------------------------------------------ */

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Icon>
)

export const IconAlerta = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5 21 19.5H3z" />
    <path d="M12 9.5v4.5" />
    <circle cx="12" cy="17" r="0.75" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconInfo = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5" />
    <circle cx="12" cy="7.75" r="0.75" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconError = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5" />
    <circle cx="12" cy="16.25" r="0.75" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconReloj = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.5l3.5 2" />
  </Icon>
)

export const IconBloqueo = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.5" y="10" width="15" height="10.5" rx="2" />
    <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
  </Icon>
)

export const IconCandadoAbierto = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.5" y="10" width="15" height="10.5" rx="2" />
    <path d="M8 10V7.5a4 4 0 0 1 7.5-2" />
  </Icon>
)

export const IconOjo = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)

export const IconOjoCerrado = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4l16 16" />
    <path d="M9.5 9.7A3 3 0 0 0 12 15a3 3 0 0 0 2.3-1.1" />
    <path d="M6.3 6.5C4 8.2 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1M17.5 15.4c2-1.6 4-3.4 4-3.4S18 5.5 12 5.5c-.6 0-1.2.1-1.7.2" />
  </Icon>
)

/* --- Dominio --------------------------------------------------------- */
export const IconCargar = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5v10" />
    <path d="m7.5 9.5 4.5 4.5 4.5-4.5" />
    <path d="M4.5 16.5v2A2 2 0 0 0 6.5 20.5h11a2 2 0 0 0 2-2v-2" />
  </Icon>
)

/**
 * La marca real, como imagen.
 *
 * Sustituye al antiguo `LogoNexora` (una "N" dibujada a mano) porque la marca
 * buena la trae el usuario como raster. Los PNG de `public/` salen del recorte
 * del original, con el fondo puesto a transparente; `logo-original.png` es el
 * archivo tal cual llegó, por si hay que volver a recortar.
 *
 * Se usa `<img>` y no un SVG en linea a proposito: el logo tiene degradados
 * multicolor y un PNG de 32 px pesa 3,7 kB contra los kilobytes que haria
 * cualquier SVG equivalente. Para el color puro de la interfaz estan los tokens
 * de `index.css`.
 */
export function LogoNexora(props: {
  /** Alto en px. El ancho sale de la proporcion de la marca (577:629). */
  alto?: number
  className?: string
}) {
  const { alto = 24, className } = props
  // Cada tamano tiene su archivo: en la barra lateral (24 px) no tiene sentido
  // descargar el de 256.
  const archivo = alto <= 40 ? 'logo-32.png' : alto <= 72 ? 'logo-64.png' : 'logo-128.png'
  return (
    <img
      src={`/${archivo}`}
      alt=""
      aria-hidden="true"
      width={alto}
      height={Math.round((alto * 629) / 577)}
      decoding="async"
      className={className}
      style={{ height: `${alto}px`, width: 'auto' }}
    />
  )
}
