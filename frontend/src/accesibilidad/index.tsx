/**
 * Preferencias de accesibilidad y estado de "Primeros pasos".
 *
 * Se guardan en el navegador: el backend no tiene donde guardarlas y no
 * afectan a ningun pago. Cada preferencia se aplica como atributo del
 * `<html>` (`data-letra`, `data-contraste`, `data-movimiento`, `data-modo`)
 * y el CSS hace el resto, asi ningun componente tiene que saber que existen.
 *
 * `modo` elige el vocabulario y el detalle de la interfaz: `simple` (por
 * defecto, para quien tiene poca practica digital) o `avanzado` (con los
 * detalles tecnicos). Los textos por modo estan en `@/modo`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { useTheme } from '@/hooks'
import { cn } from '@/lib/cn'
import { IconCheck } from '@/components/icons'
import { MODOS, type Modo } from '@/modo/textos'

export type TamanoLetra = 'normal' | 'grande' | 'muy-grande'

export interface Preferencias {
  letra: TamanoLetra
  contrasteAlto: boolean
  menosMovimiento: boolean
  /** Vocabulario y detalle de la interfaz. Ver `@/modo`. */
  modo: Modo
}

const PREFERENCIAS_KEY = 'nexora.accesibilidad'
const PRIMEROS_PASOS_KEY = 'nexora.primeros-pasos'

const POR_DEFECTO: Preferencias = {
  letra: 'grande',
  contrasteAlto: false,
  menosMovimiento: false,
  modo: 'simple',
}

function leerJson<T>(clave: string, porDefecto: T): T {
  try {
    const crudo = localStorage.getItem(clave)
    return crudo ? { ...porDefecto, ...JSON.parse(crudo) } : porDefecto
  } catch {
    return porDefecto
  }
}

function guardar(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    /* sin persistencia: dura lo que dura la pestana */
  }
}

/**
 * Lo guardado antes de que existiera `modo` no lo trae: `leerJson` rellena
 * con el valor por defecto (Simple). Un valor desconocido tambien cae a Simple.
 */
function leerPreferencias(): Preferencias {
  const p = leerJson(PREFERENCIAS_KEY, POR_DEFECTO)
  return MODOS.includes(p.modo) ? p : { ...p, modo: POR_DEFECTO.modo }
}

function aplicar(p: Preferencias) {
  const raiz = document.documentElement
  raiz.dataset.letra = p.letra
  raiz.dataset.contraste = p.contrasteAlto ? 'alto' : 'normal'
  raiz.dataset.movimiento = p.menosMovimiento ? 'reducido' : 'normal'
  raiz.dataset.modo = p.modo
}

interface AccesibilidadValue {
  preferencias: Preferencias
  cambiar: (cambios: Partial<Preferencias>) => void
  /** Ids de usuario que ya terminaron "Primeros pasos". */
  primerosPasosHechos: (userId: string) => boolean
  marcarPrimerosPasos: (userId: string, hecho: boolean) => void
}

const AccesibilidadContext = createContext<AccesibilidadValue | null>(null)

export function AccesibilidadProvider({ children }: { children: ReactNode }) {
  const [preferencias, setPreferencias] = useState<Preferencias>(() => {
    const p = leerPreferencias()
    aplicar(p)
    return p
  })
  const [hechos, setHechos] = useState<Record<string, boolean>>(() =>
    leerJson<Record<string, boolean>>(PRIMEROS_PASOS_KEY, {}),
  )

  useEffect(() => {
    aplicar(preferencias)
    guardar(PREFERENCIAS_KEY, preferencias)
  }, [preferencias])

  const cambiar = useCallback((cambios: Partial<Preferencias>) => {
    setPreferencias((p) => ({ ...p, ...cambios }))
  }, [])

  const marcarPrimerosPasos = useCallback((userId: string, hecho: boolean) => {
    setHechos((h) => {
      const nuevo = { ...h, [userId]: hecho }
      guardar(PRIMEROS_PASOS_KEY, nuevo)
      return nuevo
    })
  }, [])

  const value = useMemo<AccesibilidadValue>(
    () => ({
      preferencias,
      cambiar,
      primerosPasosHechos: (userId) => Boolean(hechos[userId]),
      marcarPrimerosPasos,
    }),
    [preferencias, cambiar, hechos, marcarPrimerosPasos],
  )

  return <AccesibilidadContext.Provider value={value}>{children}</AccesibilidadContext.Provider>
}

export function useAccesibilidad(): AccesibilidadValue {
  const ctx = useContext(AccesibilidadContext)
  if (!ctx) throw new Error('useAccesibilidad debe usarse dentro de <AccesibilidadProvider>')
  return ctx
}

/* ------------------------------------------------------------------ */
/* Panel de opciones                                                  */
/* ------------------------------------------------------------------ */

function Opcion({
  activa,
  onClick,
  children,
  className,
}: {
  activa: boolean
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={onClick}
      className={cn(
        'flex min-h-14 flex-1 items-center justify-center gap-2 rounded-card border-2 px-4 py-3 text-center transition-colors',
        activa
          ? 'border-oro-claro bg-superficie-2 font-semibold text-tinta'
          : 'border-filete bg-superficie text-tinta-media hover:border-filete-fuerte',
        className,
      )}
    >
      {/* La opcion elegida lleva marca y negrita, no solo color. */}
      {activa && <IconCheck className="h-5 w-5 shrink-0 text-oro-claro" />}
      {children}
    </button>
  )
}

function Grupo({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2.5">
      <legend className="text-lg font-semibold text-tinta">{titulo}</legend>
      {ayuda && <p className="text-base text-tinta-media">{ayuda}</p>}
      <div className="flex flex-wrap gap-2.5">{children}</div>
    </fieldset>
  )
}

/** Las mismas opciones en Primeros pasos y en la pagina de accesibilidad. */
export function PanelAccesibilidad() {
  const { preferencias, cambiar } = useAccesibilidad()
  const { tema, elegir } = useTheme()

  return (
    <div className="space-y-7">
      <Grupo titulo="Cuánto detalle ver" ayuda="Puedes cambiarlo cuando quieras.">
        <Opcion
          activa={preferencias.modo === 'simple'}
          onClick={() => cambiar({ modo: 'simple' })}
          className="min-w-[15rem] justify-start"
        >
          <span className="flex flex-col items-start text-left">
            <span className="font-semibold text-tinta">Sencillo (recomendado)</span>
            <span className="text-base font-normal text-tinta-media">
              Letra grande y palabras de todos los días.
            </span>
          </span>
        </Opcion>
        <Opcion
          activa={preferencias.modo === 'avanzado'}
          onClick={() => cambiar({ modo: 'avanzado' })}
          className="min-w-[15rem] justify-start"
        >
          <span className="flex flex-col items-start text-left">
            <span className="font-semibold text-tinta">Con detalles técnicos</span>
            <span className="text-base font-normal text-tinta-media">
              Muestra direcciones, comprobantes y términos de Stellar.
            </span>
          </span>
        </Opcion>
      </Grupo>

      <Grupo titulo="Tamaño de la letra" ayuda="Elige el que leas sin esfuerzo.">
        <Opcion activa={preferencias.letra === 'normal'} onClick={() => cambiar({ letra: 'normal' })}>
          <span style={{ fontSize: '1rem' }}>Normal</span>
        </Opcion>
        <Opcion activa={preferencias.letra === 'grande'} onClick={() => cambiar({ letra: 'grande' })}>
          <span style={{ fontSize: '1.2rem' }}>Grande</span>
        </Opcion>
        <Opcion
          activa={preferencias.letra === 'muy-grande'}
          onClick={() => cambiar({ letra: 'muy-grande' })}
        >
          <span style={{ fontSize: '1.4rem' }}>Muy grande</span>
        </Opcion>
      </Grupo>

      <Grupo titulo="Colores de la pantalla">
        <Opcion activa={tema === 'claro'} onClick={() => elegir('claro')}>
          Fondo claro
        </Opcion>
        <Opcion activa={tema === 'oscuro'} onClick={() => elegir('oscuro')}>
          Fondo oscuro
        </Opcion>
      </Grupo>

      <Grupo titulo="Contraste" ayuda="Textos más marcados y bordes más visibles.">
        <Opcion activa={!preferencias.contrasteAlto} onClick={() => cambiar({ contrasteAlto: false })}>
          Normal
        </Opcion>
        <Opcion activa={preferencias.contrasteAlto} onClick={() => cambiar({ contrasteAlto: true })}>
          Alto contraste
        </Opcion>
      </Grupo>

      <Grupo titulo="Animaciones" ayuda="Si los movimientos de la pantalla te marean, quítalos.">
        <Opcion
          activa={!preferencias.menosMovimiento}
          onClick={() => cambiar({ menosMovimiento: false })}
        >
          Con animaciones
        </Opcion>
        <Opcion
          activa={preferencias.menosMovimiento}
          onClick={() => cambiar({ menosMovimiento: true })}
        >
          Sin animaciones
        </Opcion>
      </Grupo>
    </div>
  )
}
