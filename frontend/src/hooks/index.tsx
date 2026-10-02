import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

/**
 * Devuelve el valor DESPUES de que el usuario deja de escribir, para no
 * lanzar una peticion a la API en cada tecla.
 */
export function useDebounced<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}

/**
 * Estado del tema con persistencia.
 *
 * El valor inicial se lee de `data-tema`, que `index.html` ya aplico antes del
 * primer pintado (asi no hay destello). Al cambiar, se actualiza el atributo
 * del `<html>` y se guarda en localStorage.
 *
 * Valores: 'claro' | 'oscuro'. Si no hay eleccion guardada, manda el sistema.
 *
 * OJO: esto es un CONTEXTO, no un `useState` suelto. Con estado local cada
 * componente que llama a `useTheme` tendria su propia copia y el boton de
 * tema de la barra lateral no cambiaria el tema de la pagina: dos fuentes de
 * verdad escribiendo el mismo atributo del `<html>`.
 */
export type Tema = 'claro' | 'oscuro'

interface TemaContextValue {
  tema: Tema
  alternar: () => void
  elegir: (tema: Tema) => void
  esOscuro: boolean
}

const TemaContext = createContext<TemaContextValue | null>(null)

const STORAGE_KEY = 'nexora.tema'

function readInitialTema(): Tema {
  if (typeof document === 'undefined') return 'oscuro'
  const actual = document.documentElement.dataset.tema
  if (actual === 'claro' || actual === 'oscuro') return actual
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'oscuro'
}

export function TemaProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(readInitialTema)

  useEffect(() => {
    document.documentElement.dataset.tema = tema
    try {
      localStorage.setItem(STORAGE_KEY, tema)
    } catch {
      /* sin persistencia: el tema dura lo que dura la pestana */
    }
  }, [tema])

  // Si el usuario nunca eligio tema, se sigue al sistema mientras navega.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = (e: MediaQueryListEvent) => {
      let guardado: string | null = null
      try {
        guardado = localStorage.getItem(STORAGE_KEY)
      } catch {
        /* sin lectura */
      }
      if (!guardado) setTema(e.matches ? 'claro' : 'oscuro')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const value = useMemo<TemaContextValue>(
    () => ({
      tema,
      alternar: () => setTema((t) => (t === 'oscuro' ? 'claro' : 'oscuro')),
      elegir: setTema,
      esOscuro: tema === 'oscuro',
    }),
    [tema],
  )

  return <TemaContext.Provider value={value}>{children}</TemaContext.Provider>
}

export function useTheme(): TemaContextValue {
  const ctx = useContext(TemaContext)
  if (!ctx) throw new Error('useTheme debe usarse dentro de <TemaProvider>')
  return ctx
}

/**
 * Marca de tiempo que se actualiza sola. La usan los "hace 3 h" para que no
 * se queden congelados mientras el usuario mira la pantalla.
 */
export function useTick(intervalMs = 30_000): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return tick
}

/**
 * Copia texto al portapapeles y avisa de que se ha copiado.
 *
 * `navigator.clipboard` falla sin HTTPS y en navegadores antiguos, asi que
 * lleva un plan B con `execCommand`. El boton cambia a "copiado" 1,5 s para
 * que el usuario tenga una confirmacion visible y no tenga que adivinar.
 */
export function useCopy(valor: string, duracionMs = 1500) {
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    if (!copiado) return
    const timer = setTimeout(() => setCopiado(false), duracionMs)
    return () => clearTimeout(timer)
  }, [copiado, duracionMs])

  async function copiar() {
    const texto = valor
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto)
      } else {
        const area = document.createElement('textarea')
        area.value = texto
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        document.body.removeChild(area)
      }
      setCopiado(true)
    } catch {
      // Sin portapapeles no es un fallo de la app: no se avisa al usuario.
    }
  }

  return { copiado, copiar }
}

/** Detecta si la pantalla es ancha, para decide el menu lateral o el cajon. */
export function useIsWide(minWidthPx = 1024): boolean {
  const [ancha, setAncha] = useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth >= minWidthPx,
  )
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${minWidthPx}px)`)
    const onChange = (e: MediaQueryListEvent) => setAncha(e.matches)
    setAncha(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [minWidthPx])
  return ancha
}

/**
 * Cierra un panel al hacer clic fuera o al pulsar Escape.
 * Lo usan el cajon de navegacion, el menu de usuario y los popovers.
 */
export function useDismiss(
  abierto: boolean,
  onClose: () => void,
  ref: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!abierto) return

    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [abierto, onClose, ref])
}
