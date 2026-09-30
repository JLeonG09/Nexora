/**
 * Contactos: la lista blanca de destinatarios.
 *
 * El backend NUNCA toma la direccion del mensaje de la IA: si el nombre no
 * esta en esta lista, el pago se rechaza con `CONTACTO_NO_ENCONTRADO`. Por
 * eso esta pantalla no es un CRUD de direcciones cualquiera: es el sitio donde
 * el usuario decide a quien se le puede pagar.
 *
 * Consecuencia de diseño: no hay un campo de "direccion libre" en el chat ni
 * un atajo para pagar a alguien nuevo. Anadir a alguien es siempre una
 * decision consciente en esta pantalla.
 *
 * Archivar no es borrar. El backend guarda la fila porque el historial de
 * pagos necesita poder seguir explicando a quien se le pago hace tres meses.
 * La interfaz lo dice, porque "eliminar" y "archivar" son palabras muy
 * distintas y el usuario decide con la que lee.
 */

import { useState, type FormEvent } from 'react'

import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Skeleton,
  Textarea,
} from '@/components/ui'
import {
  IconBuscar,
  IconBorrar,
  IconContactos,
  IconEditar,
  IconMas,
  IconOjo,
} from '@/components/icons'
import { Badge, StellarAddress } from '@/components/ui'
import { useConfirm } from '@/hooks/useConfirm'
import {
  errorMessage,
  useActualizarContacto,
  useArchivarContacto,
  useContactos,
  useCrearContacto,
} from '@/api/queries'
import { normalize } from '@/lib/format'
import { isValidPublicKey, publicKeyError } from '@/lib/stellar'
import type { Contact } from '@/api/types'

/* ------------------------------------------------------------------ */
/* Formulario                                                         */
/* ------------------------------------------------------------------ */

/**
 * Alta y edicion comparten el mismo formulario porque los campos son los
 * mismos y las reglas tambien. Dos formularios casi iguales divergen.
 */
function Formulario({
  contacto,
  onClose,
}: {
  contacto: Contact | null
  onClose: () => void
}) {
  const crear = useCrearContacto()
  const actualizar = useActualizarContacto(contacto?.id ?? '')
  const mutacion = contacto ? actualizar : crear

  const [nombre, setNombre] = useState(contacto?.name ?? '')
  const [direccion, setDireccion] = useState(contacto?.stellarAddress ?? '')
  const [nota, setNota] = useState(contacto?.note ?? '')
  const [tocado, setTocado] = useState(false)

  const faltaNombre = normalize(nombre) === ''
  const dirLimpia = direccion.trim()
  const errorDir = publicKeyError(dirLimpia)
  // El backend rechaza duplicados por direccion. Avisarlo aqui evita el 409.
  const valido = !faltaNombre && isValidPublicKey(dirLimpia)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setTocado(true)
    if (!valido) return
    const payload = { name: nombre.trim(), stellarAddress: dirLimpia, note: nota.trim() }
    if (contacto) await actualizar.mutateAsync(payload)
    else await crear.mutateAsync(payload)
    onClose()
  }

  return (
    <Modal
      abierto
      onClose={onClose}
      titulo={contacto ? `Editar a ${contacto.name}` : 'Añadir contacto'}
      descripcion={
        contacto
          ? 'Cambiar el nombre o la nota no afecta a pagos ya hechos.'
          : 'Con esta dirección autorizada podrá pagar el agente. Solo USDC.'
      }
      pie={
        <>
          <Button variante="fantasma" onClick={onClose} disabled={mutacion.isPending}>
            Cancelar
          </Button>
          <Button variante="primario" onClick={enviar} cargando={mutacion.isPending}>
            {contacto ? 'Guardar' : 'Añadir'}
          </Button>
        </>
      }
    >
      <form onSubmit={enviar} className="flex flex-col gap-3">
        <Field
          label="Nombre"
          requerido
          ayuda="Es el nombre que escribirás en el chat. Ponlo como lo dices."
          error={tocado && faltaNombre ? 'El agente necesita un nombre para buscarlo.' : null}
        >
          {(props) => (
            <Input
              {...props}
              value={nombre}
              autoFocus
              placeholder="María"
              onChange={(e) => setNombre(e.target.value)}
            />
          )}
        </Field>

        <Field
          label="Dirección Stellar (empieza por G)"
          requerido
          error={tocado && dirLimpia !== '' ? errorDir : null}
        >
          {(props) => (
            <Input
              {...props}
              value={direccion}
              spellCheck={false}
              autoCapitalize="characters"
              autoCorrect="off"
              placeholder="G…"
              className="mono"
              onChange={(e) => setDireccion(e.target.value.trim())}
            />
          )}
        </Field>

        <Field label="Nota (opcional)" ayuda="Solo para ti. El agente no la lee.">
          {(props) => (
            <Textarea
              {...props}
              value={nota}
              rows={2}
              placeholder="La del bar de abajo"
              onChange={(e) => setNota(e.target.value)}
            />
          )}
        </Field>

        {mutacion.isError && (
          <p role="alert" className="text-xs text-error">
            {errorMessage(mutacion.error)}
          </p>
        )}
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Tarjeta de un contacto                                            */
/* ------------------------------------------------------------------ */

function Tarjeta({
  contacto,
  onEditar,
  onArchivar,
  ocupada,
}: {
  contacto: Contact
  onEditar: () => void
  onArchivar: () => void
  ocupada: boolean
}) {
  return (
    <article className="rounded-control border border-linea bg-superficie-1 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-tinta">{contacto.name}</p>
          <div className="mt-1">
            <StellarAddress publicKey={contacto.stellarAddress} />
          </div>
        </div>
        <Badge tone="neutro">
          <IconOjo className="h-3 w-3" />
          Autorizado
        </Badge>
      </div>

      {contacto.note && <p className="mt-2 text-2xs text-tinta-media">{contacto.note}</p>}

      <footer className="mt-2.5 flex justify-end gap-2 border-t border-linea pt-2">
        <Button variante="fantasma" tamano="sm" disabled={ocupada} onClick={onEditar}>
          <IconEditar className="h-3.5 w-3.5" />
          Editar
        </Button>
        <Button variante="fantasma" tamano="sm" disabled={ocupada} onClick={onArchivar}>
          <IconBorrar className="h-3.5 w-3.5" />
          Archivar
        </Button>
      </footer>
    </article>
  )
}

/* ------------------------------------------------------------------ */
/* Pagina                                                            */
/* ------------------------------------------------------------------ */

export function ContactosPage() {
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<Contact | null>(null)
  const [creando, setCreando] = useState(false)

  const { data: contactos, isPending, isError, error, refetch } = useContactos()
  const archivar = useArchivarContacto()
  const confirmar = useConfirm()

  // Filtro en memoria: son pocos y asi el buscador responde al instante.
  const filtro = normalize(busqueda)
  const visibles = (contactos ?? []).filter(
    (c) => filtro === '' || normalize(c.name).includes(filtro) || c.stellarAddress.includes(filtro),
  )

  async function archivarUno(contacto: Contact) {
    const ok = await confirmar.confirmar({
      titulo: `¿Archivar a ${contacto.name}?`,
      mensaje:
        'El agente ya no podrá pagarle. El contacto no se borra: se queda en el historial de ' +
        'pagos para que se pueda explicar a quién se le pagó. Puedes volver a añadirlo luego.',
      textoConfirmar: 'Archivar',
    })
    if (!ok) return
    try {
      await archivar.mutateAsync(contacto.id)
    } catch (err) {
      confirmar.error('No se pudo archivar', errorMessage(err))
    }
  }

  return (
    <div className="contenedor py-6">
      <header className="pagina-cabecera">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-tinta">Contactos</h1>
            <p className="mt-0.5 max-w-2xl text-sm text-tinta-media">
              A quién puede pagar el agente. Si un nombre no está aquí, el pago se rechaza aunque
              la IA lo entienda bien.
            </p>
          </div>

          <div className="flex w-full gap-2 sm:w-auto">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-tinta-media [&_svg]:h-4 [&_svg]:w-4">
                <IconBuscar />
              </span>
              <Input
                value={busqueda}
                placeholder="Buscar por nombre o dirección"
                aria-label="Buscar contactos"
                className="pl-8"
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <Button variante="primario" onClick={() => setCreando(true)}>
              <IconMas className="h-4 w-4" />
              Añadir
            </Button>
          </div>
        </div>
      </header>

      <div className="mt-4 flex flex-col gap-2.5">
        {isPending && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24" />)}

        {isError && <ErrorState error={error} onReintentar={() => void refetch()} />}

        {!isPending && !isError && (contactos?.length ?? 0) === 0 && (
          <EmptyState
            icono={<IconContactos className="h-5 w-5" />}
            titulo="Aún no hay contactos"
            descripcion="Añade al menos uno antes de pedir un pago. El agente solo paga a direcciones de esta lista."
            accion={
              <Button variante="primario" onClick={() => setCreando(true)}>
                <IconMas className="h-4 w-4" />
                Añadir el primero
              </Button>
            }
          />
        )}

        {!isPending && (contactos?.length ?? 0) > 0 && visibles.length === 0 && (
          <EmptyState titulo="Nada con ese nombre" descripcion="Prueba con otra parte del nombre o con la dirección." />
        )}

        {visibles.map((contacto) => (
          <Tarjeta
            key={contacto.id}
            contacto={contacto}
            ocupada={archivar.isPending}
            onEditar={() => setEditando(contacto)}
            onArchivar={() => void archivarUno(contacto)}
          />
        ))}
      </div>

      {(creando || editando) && (
        <Formulario
          contacto={editando}
          onClose={() => {
            setCreando(false)
            setEditando(null)
          }}
        />
      )}
    </div>
  )
}
