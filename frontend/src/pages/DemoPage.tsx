/**
 * Demo de la llave robada.
 *
 * La pregunta que responde esta pantalla es la unica que de verdad importa en
 * este producto: **si alguien roba la llave del agente, ¿puede gastar tu
 * dinero?**
 *
 * `POST /api/demo/attack` salta al firmante como lo haria un atacante: pide
 * firmar directamente, sin pasar por el chat, sin pasar por las ocho reglas de
 * la IA y sin preguntar al usuario nada. El unico freno posible es el contrato.
 *
 * Por eso el resultado se explica en dos niveles, y no se maquilla:
 *
 *  - Si la transaccion falla, el backend devuelve el codigo del contrato y la
 *    etapa (`stage`) donde se detuvo. Se enseña literal: un `code` de Soroban
 *    es la prueba de que el freno era el mandato, no esta interfaz.
 *  - Si la transaccion llegara a confirmarse, la pantalla lo dirá sin suavizar
 *    y aparecerá en Alertas, porque eso es exactamente lo que el sistema
 *    tiene que detectar.
 *
 * Nunca se maquilla un resultado: si el demo falla por una llave mal
 * configurada en la demo y no por el mandato, hay que decirlo, porque un
 * "lo paramos" falso sería peor que no tener demo.
 */

import { useState, type FormEvent } from 'react'

import {
  Button,
  Field,
  Input,
  Module,
  ModuleHeader,
} from '@/components/ui'
import { IconAlerta, IconBloqueo, IconCheck, IconDemo } from '@/components/icons'
import { BloqueRechazo, Monto, ProposalStatusBadge } from '@/components/domain'
import { EnlaceTx } from '@/components/Propuesta'
import { useConfirm } from '@/hooks/useConfirm'
import { useDemoAtaque } from '@/api/queries'
import { ApiError } from '@/api/errors'
import { useSesion } from '@/sesion/SesionContext'
import { isValidPublicKey, publicKeyError } from '@/lib/stellar'
import type { AttackDemoResponse } from '@/api/types'

/* ------------------------------------------------------------------ */
/* Resultado                                                          */
/* ------------------------------------------------------------------ */

/** Traducción de los `stage` que devuelve el firmante. */
const ETAPA: Record<string, string> = {
  FIRMA: 'Al firmar la transacción',
  ENVIO: 'Al enviarla a la red',
  ESPERA: 'Al esperar la confirmación',
  CONFIRMACION: 'Al confirmar en Stellar',
}

/** Traducción de los codigos mas habituales del contrato de smart account. */
function explicarCodigo(codigo: string | null, mensaje: string | null): string {
  if (codigo && codigo.includes('not-authorized')) {
    return 'La clave que intentó firmar no es una firmante autorizada por la regla del mandato.'
  }
  if (codigo && codigo.includes('expired')) {
    return 'La autorización de la regla había caducado cuando se intentó firmar.'
  }
  if (codigo && codigo.includes('limit')) {
    return 'La regla del mandato rechazó la operación por un tope.'
  }
  if (codigo && codigo.includes('policy')) {
    return 'La política del contrato no permite esta operación.'
  }
  return mensaje ?? 'La operación se detuvo en el contrato.'
}

function Resultado({ resultado }: { resultado: AttackDemoResponse }) {
  const fallo = resultado.error !== null
  const parado = fallo && resultado.status === 'RECHAZADO'

  return (
    <div
      className={`rounded-control border p-3 ${
        parado ? 'border-ok/40 bg-ok/50' : fallo ? 'border-error/40 bg-error-50' : 'border-aviso/40 bg-aviso-50'
      }`}
      role="status"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-tinta">
          {fallo ? (
            <IconBloqueo className="h-4 w-4 text-error" />
          ) : (
            <IconAlerta className="h-4 w-4 text-aviso" />
          )}
          {fallo ? 'La transacción no llegó a firmarse' : 'La transacción pasó'}
        </p>
        <ProposalStatusBadge status={resultado.status} />
      </div>

      <p className="mt-2 text-sm text-tinta">
        {parado
          ? 'El intento se detuvo. El freno fue el mandato en tu contrato, no esta pantalla: ' +
            'el atacante no pasó por el chat ni por las reglas del agente.'
          : fallo
            ? 'Hubo un error, pero no está claro que fuera el mandato. Mira el código antes de ' +
              'contar esto como un éxito.'
            : 'La transacción se confirmó. Eso significa que el mandato no la frenó y que ' +
              'debería aparecer en Alertas como movimiento no reconocido.'}
      </p>

      {fallo && resultado.error && (
        <div className="mt-2.5">
          <BloqueRechazo
            code={resultado.error.code}
            message={explicarCodigo(resultado.error.code, resultado.error.message)}
          />
        </div>
      )}

      {fallo && resultado.error && (
        <dl className="mt-2.5 grid gap-2 text-2xs sm:grid-cols-3">
          {resultado.error.stage && ETAPA[resultado.error.stage] && (
            <div>
              <dt className="text-tinta-media">Se detuvo en</dt>
              <dd className="mt-0.5 font-medium text-tinta">{ETAPA[resultado.error.stage]}</dd>
            </div>
          )}
          {resultado.error.code && (
            <div>
              <dt className="text-tinta-media">Código del contrato</dt>
              <dd className="mt-0.5 font-mono font-medium text-tinta">{resultado.error.code}</dd>
            </div>
          )}
          {resultado.error.contractCode !== null && (
            <div>
              <dt className="text-tinta-media">Número</dt>
              <dd className="mt-0.5 cifras font-medium text-tinta">
                {resultado.error.contractCode}
              </dd>
            </div>
          )}
        </dl>
      )}

      {resultado.txHash && (
        <p className="mt-2.5">
          <EnlaceTx txHash={resultado.txHash} texto="Ver la transacción en el explorador" />
        </p>
      )}

      <p className="mt-2.5 text-2xs text-tinta-media">
        Propuesta <span className="font-mono">{resultado.proposalId.slice(0, 8)}</span>. Búscala
        en Auditoría para ver los eventos que dejó.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Página                                                            */
/* ------------------------------------------------------------------ */

export function DemoPage() {
  const { account } = useSesion()
  const atacar = useDemoAtaque()
  const confirmar = useConfirm()

  const [destino, setDestino] = useState('')
  const [importe, setImporte] = useState('50')
  const [tocado, setTocado] = useState(false)
  const [resultado, setResultado] = useState<AttackDemoResponse | null>(null)

  const errorDestino = destino.trim() === '' ? null : publicKeyError(destino.trim())
  const importeOk = Number(importe) > 0
  /**
   * Solo hace falta la smart account, NO el mandato: el atacante va al
   * firmante saltándose el agente, asi que precisamente lo que no tiene es un
   * mandato que lo autorice. Exigirlo aqui haria imposible la demo.
   */
  const faltaCuenta = !account

  async function lanzar(e: FormEvent) {
    e.preventDefault()
    setTocado(true)
    if (!importeOk || !isValidPublicKey(destino.trim()) || faltaCuenta) return

    const ok = await confirmar.confirmar({
      titulo: '¿Simular el ataque?',
      mensaje:
        'Esto pide al firmante que firme saltándose el agente, como haría un atacante con la ' +
        'llave. En testnet no mueve dinero real, pero escribe en la red y en tu auditoría.',
      textoConfirmar: 'Lanzar el intento',
    })
    if (!ok) return

    try {
      setResultado(
        await atacar.mutateAsync({
          destinationAddress: destino.trim(),
          amount: importe.trim(),
        }),
      )
    } catch (err) {
      setResultado(null)
      // El backend responde 404 cuando `DEMO_ATTACK_ENABLED` no está puesto.
      // Decirlo evita que el usuario piense que ha roto algo.
      if (err instanceof ApiError && err.isNotFound) {
        confirmar.error(
          'La demo está desactivada en este backend',
          'Arranca el backend con DEMO_ATTACK_ENABLED=true para poder lanzar el intento.',
        )
        return
      }
      confirmar.error('No se pudo ejecutar la demo', err instanceof ApiError ? err.displayMessage : String(err))
    }
  }

  return (
    <div className="contenedor flex flex-col gap-4 py-6">
      <header className="pagina-cabecera">
        <h1 className="text-lg font-semibold tracking-tight text-tinta">Demo: llave robada</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-tinta-media">
          Comprueba qué pasa si alguien firma con la llave del agente sin pasar por el chat. Si el
          mandato está bien puesto, la transacción se detiene en el contrato.
        </p>
      </header>

      <Module>
        <ModuleHeader
          titulo="Intentar pagar saltándome al agente"
          descripcion="Esto no pide ninguna confirmación al usuario a propósito: por eso es una prueba real del contrato."
        />

        <form onSubmit={lanzar} className="modulo-cuerpo flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Dirección de destino"
              requerido
              ayuda="Una dirección cualquiera de testnet."
              error={tocado ? errorDestino : null}
            >
              {(props) => (
                <Input
                  {...props}
                  value={destino}
                  spellCheck={false}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  placeholder="G…"
                  className="mono"
                  onChange={(e) => setDestino(e.target.value.trim())}
                />
              )}
            </Field>

            <Field
              label="Importe"
              requerido
              ayuda="Prueba con algo por encima de tu tope por pago: así el mandato tiene que parar."
              error={tocado && !importeOk ? 'El importe tiene que ser mayor que cero.' : null}
            >
              {(props) => (
                <Input
                  {...props}
                  value={importe}
                  inputMode="decimal"
                  className="cifras"
                  onChange={(e) => setImporte(e.target.value)}
                />
              )}
            </Field>
          </div>

          <p className="flex items-start gap-1.5 rounded-control border border-linea bg-superficie-2 px-2.5 py-2 text-2xs text-tinta-media">
            <IconBloqueo className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Sin mandato activo esta operación no se puede ni lanzar: no hay regla en la cadena
              que pueda pararla.
            </span>
          </p>

          {atacar.isError && (
            <p role="alert" className="text-xs text-error">
              {atacar.error instanceof Error ? atacar.error.message : 'Error desconocido'}
            </p>
          )}

          <div>
            <Button
              type="submit"
              variante="primario"
              cargando={atacar.isPending}
              disabled={faltaCuenta}
            >
              <IconDemo className="h-4 w-4" />
              Intentar pagar <Monto amount={importe} asset="USDC" compacto />
            </Button>
          </div>
        </form>
      </Module>

      {resultado && <Resultado resultado={resultado} />}

      <Module>
        <ModuleHeader titulo="Cómo leer el resultado" />
        <ul className="modulo-cuerpo flex list-disc flex-col gap-2 pl-5 text-sm text-tinta-media marker:text-tinta-media">
          <li className="flex items-start gap-2">
            <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
            <span>
              <span className="font-medium text-tinta">Se detiene</span> con un error de contrato: el
              mandato hizo su trabajo. Mira el código: si es <code>not-authorized</code> o similar,
              la llave del atacante no estaba autorizada.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <IconAlerta className="mt-0.5 h-4 w-4 shrink-0 text-aviso" />
            <span>
              <span className="font-medium text-tinta">Se detiene</span> pero con un error que no
              habla de autorización: el freno no fue el mandato. Investiga antes de celebrarlo.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <IconBloqueo className="mt-0.5 h-4 w-4 shrink-0 text-error" />
            <span>
              <span className="font-medium text-tinta">Se confirma</span>: el mandato no la paró. La
              demo ha hecho su trabajo: el atacante ha movido más de lo que querías, y el
              movimiento aparecerá en Alertas como no reconocido.
            </span>
          </li>
        </ul>
      </Module>
    </div>
  )
}
