/**
 * Preferencias de accesibilidad y estado de "Primeros pasos".
 *
 * Se guardan en el navegador: el backend no tiene donde guardarlas y no
 * afectan a ningun pago. Cada preferencia se aplica como atributo del
 * `<html>` (`data-letra`, `data-contraste`, `data-movimiento`) y el CSS hace
 * el resto, asi ningun componente tiene que saber que existen.
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

export type TamanoLetra = 'normal' | 'grande' | 'muy-grande'

export interface Preferencias {
  letra: TamanoLetra
  contrasteAlto: boolean
  menosMovimiento: boolean
}

const PREFERENCIAS_KEY = 'nexora.accesibilidad'
const PRIMEROS_PASOS_KEY = 'nexora.primeros-pasos'

const POR_DEFECTO: Preferencias = { letra: 'grande', contrasteAlto: false, menosMovimiento: false }

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

function aplicar(p: Preferencias) {
  const raiz = document.documentElement
  raiz.dataset.letra = p.letra
  raiz.dataset.contraste = p.contrasteAlto ? 'alto' : 'normal'
  raiz.dataset.movimiento = p.menosMovimiento ? 'reducido' : 'normal'
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
    const p = leerJson(PREFERENCIAS_KEY, POR_DEFECTO)
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
        'flex min-h-14 flex-1 items-center justify-center rounded-card border-2 px-4 py-3 text-center transition-colors',
        activa
          ? 'border-oro-claro bg-superficie font-semibold text-tinta shadow-[0_0_0_4px_rgb(224_166_58/0.15),var(--sombra-2)]'
          : 'border-filete bg-superficie text-tinta-media shadow-[var(--sombra-1)] hover:-translate-y-px hover:border-filete-fuerte hover:shadow-[var(--sombra-2)]',
        className,
      )}
    >
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
