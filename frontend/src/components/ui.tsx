/**
 * Primitivas de interfaz.
 *
 * Todos los componentes aqui son "sin opinions de negocio": no saben que es
 * un pago ni un mandato. Solo apariencia y accesibilidad. El vocabulario
 * del dominio vive en `components/domain.tsx`.
 *
 * Reglas que respetan todos:
 *  - El color de estado SIEMPRE va acompanado de texto. Nunca se depende
 *    solo del color para entender algo.
 *  - Nada quita el `outline` de foco.
 *  - Todo elemento interactivo se puede usar con teclado.
 */

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

import { IconAlerta, IconCheck, IconCerrar, IconOjo, IconOjoCerrado } from './icons'
import { cn } from '@/lib/cn'

/* ================================================================== */
/* Boton                                                              */
/* ================================================================== */

type ButtonVariant = 'primario' | 'secundario' | 'fantasma' | 'peligro'
type ButtonSize = 'sm' | 'md'

const VARIANTE_BTN: Record<ButtonVariant, string> = {
  primario: 'btn-primario',
  secundario: 'btn-secundario',
  fantasma: 'btn-fantasma',
  peligro: 'btn-peligro',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: ButtonVariant
  tamano?: ButtonSize
  /** Ocupa todo el ancho disponible. Util en formularios y en movil. */
  bloque?: boolean
  /** Muestra un spinner y desactiva el boton. */
  cargando?: boolean
  /** Boton cuadrado con solo icono. Requiere `texto` para el lector de pantalla. */
  icono?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variante = 'secundario',
    tamano = 'md',
    bloque = false,
    cargando = false,
    icono = false,
    className,
    children,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={props.type ?? 'button'}
      className={cn(
        'btn',
        VARIANTE_BTN[variante],
        tamano === 'sm' && 'btn-sm',
        icono && 'btn-icono',
        bloque && 'btn-bloque',
        className,
      )}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      {...props}
    >
      {cargando && <Spinner />}
      {children}
    </button>
  )
})

/** Spinner de trazo. Hereda el color del texto del boton. */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/* ================================================================== */
/* Modulo (contenedor)                                                */
/* ================================================================== */

export interface ModuleProps {
  children: ReactNode
  className?: string
}

export function Module({ children, className }: ModuleProps) {
  return <section className={cn('modulo', className)}>{children}</section>
}

export interface ModuleHeaderProps {
  titulo: ReactNode
  descripcion?: ReactNode
  acciones?: ReactNode
  className?: string
}

export function ModuleHeader({ titulo, descripcion, acciones, className }: ModuleHeaderProps) {
  return (
    <header className={cn('modulo-cabecera', className)}>
      <div className="min-w-0">
        <h2 className="modulo-cabecera__titulo">{titulo}</h2>
        {descripcion && (
          <p className="mt-0.5 text-xs text-tinta-media">{descripcion}</p>
        )}
      </div>
      {acciones && <div className="flex shrink-0 items-center gap-1.5">{acciones}</div>}
    </header>
  )
}

/* ================================================================== */
/* KPIs                                                               */
/* ================================================================== */

export interface KpiProps {
  etiqueta: string
  valor: ReactNode
  nota?: ReactNode
  /** El LED se enciende cuando el dato esta "vivo" (sincronizado). */
  vivo?: boolean
  className?: string
}

export function Kpi({ etiqueta, valor, nota, vivo, className }: KpiProps) {
  return (
    <div className={cn('kpi', className)}>
      <p className="kpi__etiqueta">
        {vivo && <span className="led encendido" aria-hidden="true" />}
        {etiqueta}
      </p>
      <p className="kpi__valor cifras">{valor}</p>
      {nota && <p className="kpi__nota">{nota}</p>}
    </div>
  )
}

/* ================================================================== */
/* Insignias de estado                                                */
/* ================================================================== */

export type BadgeTone = 'ok' | 'aviso' | 'error' | 'info' | 'neutro' | 'acento' | 'oro'

const TONO: Record<BadgeTone, string> = {
  ok: 'insignia-ok',
  aviso: 'insignia-aviso',
  error: 'insignia-error',
  info: 'insignia-info',
  neutro: 'insignia-neutro',
  acento: 'insignia-acento',
  oro: 'insignia-oro',
}

export interface BadgeProps {
  children: ReactNode
  tone?: BadgeTone
  /** Punto de estado a la izquierda. */
  led?: 'encendido' | 'apagado' | 'pulsando'
  /** `grande`: letra de lectura y mas aire, para pantallas de publico mayor. */
  tamano?: 'normal' | 'grande'
  className?: string
}

export function Badge({ children, tone = 'neutro', led, tamano = 'normal', className }: BadgeProps) {
  return (
    <span
      className={cn('insignia', TONO[tone], tamano === 'grande' && 'px-2.5 py-1 text-base', className)}
    >
      {led && <span className={cn('led', led !== 'apagado' && 'encendido', led === 'pulsando' && 'pulsando')} aria-hidden="true" />}
      {children}
    </span>
  )
}

/* ================================================================== */
/* Campos de formulario                                               */
/* ================================================================== */

export interface FieldProps {
  label: string
  /** Texto de ayuda bajo el campo. */
  ayuda?: ReactNode
  /** Mensaje de error de `@Valid` del backend, o de la validacion local. */
  error?: string | null
  /** Marca el campo como obligatorio en el HTML. */
  requerido?: boolean
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined }) => ReactNode
}

/**
 * Envoltorio de campo. Genera los `id` y los `aria-*` correctos y los
 * inyecta al hijo, para que cada campo no tenga que acordarse.
 */
export function Field({ label, ayuda, error, requerido, children }: FieldProps) {
  const id = useId()
  const ayudaId = `${id}-ayuda`
  const errorId = `${id}-error`
  const descritoPor = error ? errorId : ayuda ? ayudaId : undefined

  return (
    <div className="campo">
      <label className="campo__etiqueta" htmlFor={id}>
        {label}
        {requerido && (
          <span className="ml-1 text-error" aria-hidden="true">
            *
          </span>
        )}
        {requerido && <span className="solo-lector">(obligatorio)</span>}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': descritoPor })}
      {error ? (
        <p className="campo__error" id={errorId}>
          <IconAlerta />
          {error}
        </p>
      ) : (
        ayuda && (
          <p className="campo__ayuda" id={ayudaId}>
            {ayuda}
          </p>
        )
      )}
    </div>
  )
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Icono a la izquierda (SVG de 16px). */
  icono?: ReactNode
  /** Muestra un boton de ojo en campos de contrasena. */
  esContrasena?: boolean
}

/** Campo de texto. Reemplaza el `<input>` nativo para tener el mismo estilo. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, icono, esContrasena, type = 'text', ...props },
  ref,
) {
  const [visible, setVisible] = useState(false)
  const esPassword = esContrasena || type === 'password'
  const tipoReal = esPassword ? (visible ? 'text' : 'password') : type

  const campo = (
    <input
      ref={ref}
      type={tipoReal}
      className={cn(
        'entrada',
        icono ? 'pl-8' : null,
        esPassword ? 'pr-9' : null,
        className,
      )}
      {...props}
    />
  )

  if (!icono && !esPassword) return campo

  return (
    <div className="relative">
      {icono && (
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-tinta-media [&_svg]:h-4 [&_svg]:w-4">
          {icono}
        </span>
      )}
      {campo}
      {esPassword && (
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-tinta-media hover:bg-superficie-2 hover:text-tinta"
          aria-label={visible ? 'Ocultar' : 'Mostrar'}
          tabIndex={-1}
        >
          {visible ? <IconOjoCerrado className="h-4 w-4" /> : <IconOjo className="h-4 w-4" />}
        </button>
      )}
    </div>
  )
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn('entrada', className)} {...props}>
        {children}
      </select>
    )
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn('entrada min-h-20 py-2', className)} {...props} />
  },
)

/** Casilla de verificacion con etiqueta a la derecha. */
export function Checkbox({
  label,
  description,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5', className)}>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-filete-fuerte accent-acento"
        {...props}
      />
      <span className="text-sm">
        {label}
        {description && <span className="block text-xs text-tinta-media">{description}</span>}
      </span>
    </label>
  )
}

/* ================================================================== */
/* Estados: carga, vacio, error                                       */
/* ================================================================== */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('esqueleto h-4 w-full', className)} aria-hidden="true" />
}

export interface EmptyStateProps {
  titulo: string
  descripcion?: string
  icono?: ReactNode
  accion?: ReactNode
}

export function EmptyState({ titulo, descripcion, icono, accion }: EmptyStateProps) {
  return (
    <div className="vacio">
      {icono && <span className="vacio__icono">{icono}</span>}
      <p className="font-medium">{titulo}</p>
      {descripcion && <p className="max-w-sm text-sm text-tinta-media">{descripcion}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  )
}

export interface ErrorStateProps {
  titulo?: string
  error?: unknown
  onReintentar?: () => void
  className?: string
}

/** Estado de error con el boton de reintento. Nunca se muestra un error solo. */
export function ErrorState({
  titulo = 'No se pudieron cargar los datos',
  error,
  onReintentar,
  className,
}: ErrorStateProps) {
  const mensaje = error ? friendlyError(error) : null
  return (
    <div className={cn('vacio', className)} role="alert">
      <span className="vacio__icono text-error">
        <IconAlerta />
      </span>
      <p className="font-medium">{titulo}</p>
      {mensaje && <p className="max-w-md text-sm text-tinta-media">{mensaje}</p>}
      {onReintentar && (
        <Button variante="secundario" onClick={onReintentar} className="mt-2">
          Reintentar
        </Button>
      )}
    </div>
  )
}

/** Traduce el error tecnico a algo que alguien sin conocimientos de pagos entienda. */
function friendlyError(error: unknown): string | null {
  if (typeof error === 'string') return error
  if (error instanceof Error) {
    if (error.name === 'NetworkError') {
      return 'No hay conexion con el servidor. Revisa que el backend este encendido.'
    }
    return error.message
  }
  return null
}

/* ================================================================== */
/* Modal                                                              */
/* ================================================================== */

export interface ModalProps {
  abierto: boolean
  onClose: () => void
  titulo: string
  descripcion?: string
  children: ReactNode
  pie?: ReactNode
  /** Ancho maximo. */
  ancho?: 'md' | 'lg'
}

/**
 * Dialogo modal accesible: bloquea el scroll, cierra con Escape y con clic
 * fuera, y mueve el foco dentro al abrir (y lo devuelve al cerrar).
 */
export function Modal({
  abierto,
  onClose,
  titulo,
  descripcion,
  children,
  pie,
  ancho = 'md',
}: ModalProps) {
  const refDialogo = useRef<HTMLDivElement>(null)
  const focoPrevio = useRef<HTMLElement | null>(null)
  const tituloId = useId()

  useEffect(() => {
    if (!abierto) return

    focoPrevio.current = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // El primer control del dialogo recibe el foco.
    const primero = refDialogo.current?.querySelector<HTMLElement>(
      'input, select, textarea, button:not([aria-label="Cerrar"])',
    )
    primero?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      // trampa de foco: el tabulador no puede salirse del dialogo
      if (e.key !== 'Tab' || !refDialogo.current) return
      const focusables = Array.from(
        refDialogo.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null)
      if (focusables.length === 0) return
      const primeroEl = focusables[0]
      const ultimoEl = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === primeroEl) {
        e.preventDefault()
        ultimoEl.focus()
      } else if (!e.shiftKey && document.activeElement === ultimoEl) {
        e.preventDefault()
        primeroEl.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      focoPrevio.current?.focus()
    }
  }, [abierto, onClose])

  if (!abierto) return null

  return (
    <div
      className="modal-fondo"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className={cn('modal', ancho === 'lg' && 'max-w-3xl')}
      >
        <header className="modal__cabecera">
          <div className="min-w-0">
            <h2 id={tituloId} className="text-lg font-semibold">
              {titulo}
            </h2>
            {descripcion && <p className="mt-0.5 text-sm text-tinta-media">{descripcion}</p>}
          </div>
          <Button variante="fantasma" icono onClick={onClose} aria-label="Cerrar">
            <IconCerrar />
          </Button>
        </header>
        <div className="modal__cuerpo">{children}</div>
        {pie && <footer className="modal__pie">{pie}</footer>}
      </div>
    </div>
  )
}

/* ================================================================== */
/* Confirmacion                                                       */
/* ================================================================== */

export interface ConfirmDialogProps {
  abierto: boolean
  titulo: string
  mensaje: ReactNode
  textoConfirmar?: string
  textoCancelar?: string
  peligro?: boolean
  cargando?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}

/** Confirmacion antes de una accion irreversible. */
export function ConfirmDialog({
  abierto,
  titulo,
  mensaje,
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar',
  peligro = true,
  cargando = false,
  onConfirmar,
  onCancelar,
}: ConfirmDialogProps) {
  return (
    <Modal
      abierto={abierto}
      onClose={onCancelar}
      titulo={titulo}
      pie={
        <>
          <Button variante="secundario" onClick={onCancelar} disabled={cargando}>
            {textoCancelar}
          </Button>
          <Button
            variante={peligro ? 'peligro' : 'primario'}
            onClick={onConfirmar}
            cargando={cargando}
          >
            {textoConfirmar}
          </Button>
        </>
      }
    >
      <div className="text-sm text-tinta-media">{mensaje}</div>
    </Modal>
  )
}

/* ================================================================== */
/* Paginacion                                                         */
/* ================================================================== */

export interface PaginationProps {
  pagina: number
  totalPaginas: number
  totalElementos: number
  /** Etiqueta del recurso, para el "1-20 de 143 pagos". */
  sustantivo: string
  onChange: (pagina: number) => void
}

export function Pagination({
  pagina,
  totalPaginas,
  totalElementos,
  sustantivo,
  onChange,
}: PaginationProps) {
  if (totalElementos === 0) return null
  const desde = pagina * 1 + 1
  const hasta = Math.min((pagina + 1) * 20, totalElementos)

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-2 border-t border-filete px-3 py-2 text-xs text-tinta-media"
      aria-label="Paginacion"
    >
      <p className="cifras">
        {desde}–{hasta} de {totalElementos} {sustantivo}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variante="secundario"
          tamano="sm"
          disabled={pagina === 0}
          onClick={() => onChange(pagina - 1)}
        >
          Anterior
        </Button>
        <span className="px-1.5 cifras">
          {pagina + 1} / {totalPaginas}
        </span>
        <Button
          variante="secundario"
          tamano="sm"
          disabled={pagina >= totalPaginas - 1}
          onClick={() => onChange(pagina + 1)}
        >
          Siguiente
        </Button>
      </div>
    </nav>
  )
}

/* ================================================================== */
/* Enlace a una direccion Stellar                                     */
/* ================================================================== */

export interface StellarAddressProps {
  publicKey: string | null | undefined
  /** Muestra el enlace al explorador de Stellar. */
  enlazar?: boolean
  className?: string
  etiqueta?: string
}

/** Clave publica de Stellar, truncada y enlazada al explorador. */
export function StellarAddress({
  publicKey,
  enlazar = true,
  className,
  etiqueta,
}: StellarAddressProps) {
  if (!publicKey) {
    return <span className={cn('text-tinta-media', className)}>Sin vincular</span>
  }
  const texto = `${publicKey.slice(0, 6)}…${publicKey.slice(-4)}`
  if (!enlazar) {
    return (
      <span className={cn('mono truncar', className)} title={publicKey}>
        {texto}
      </span>
    )
  }
  return (
    <a
      href={`https://stellar.expert/explorer/account/${publicKey}`}
      target="_blank"
      rel="noreferrer noopener"
      className={cn('direccion mono', className)}
      title={publicKey}
    >
      <span className="direccion__texto">{etiqueta ?? texto}</span>
    </a>
  )
}

/* ================================================================== */
/* Varios                                                            */
/* ================================================================== */

/** Fila etiqueta/valor de una ficha de detalle. */
export function FichaDato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="ficha__dato">
      <dt className="ficha__clave">{etiqueta}</dt>
      <dd className="ficha__valor m-0">{children}</dd>
    </div>
  )
}

/** Estado de "todo bien" con check, para listas cortas. */
export function Exito({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-sm text-ok">
      <IconCheck className="h-4 w-4 shrink-0" />
      {children}
    </p>
  )
}
