/**
 * Compara los DTO de Java con los tipos de TypeScript.
 *
 * El contrato vive en el backend (`dtos/**`). Si un record gana o pierde un
 * campo y el panel no se entera, el fallo aparece en produccion como
 * `undefined` en pantalla, no como un error de compilacion. Este script lee
 * los `record` de Java y los interfaces de `src/api/types.ts` y avisa de las
 * diferencias en los dos sentidos.
 *
 * Solo comprueba los NOMBRES de los campos, no los tipos: comparar
 * `Instant` con `string | null` a ojo es ruidoso y lo hace mejor el revisor.
 *
 *   npm run check:contrato
 *
 * Si el backend no esta en la ruta de abajo, se avisa y se sale con 0: el
 * frontend se puede construir sin el repositorio de Java al lado.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const RAIZ = resolve(import.meta.dirname, '..')

const CANDIDATOS = [
  process.env.NEXORA_BACKEND,
  'C:/Users/derli/AppData/Local/Temp/opencode/Nexora-dev/backend',
].filter((v): v is string => Boolean(v))

const DTOS = CANDIDATOS.map((c) => join(c, 'src/main/java/com/nexora/dtos/responses')).find((p) =>
  existsSync(p),
)

if (!DTOS) {
  console.log('No se encuentra el backend; se salta la comprobacion del contrato.')
  console.log('  Define NEXORA_BACKEND con la ruta del repositorio para comprobarlo.')
  process.exit(0)
}

const TIPOS = join(RAIZ, 'src/api/types.ts')

/**
 * Nombre del record de Java -> nombre del interface de TypeScript.
 * Solo para los que no se llamarían igual: `HealthResponse` -> `Health`.
 */
const TRADUCIONES: Record<string, string> = {
  HealthResponse: 'Health',
  UserResponse: 'User',
  AccountResponse: 'Account',
  AgentKeyResponse: 'AgentKey',
  ContactResponse: 'Contact',
  MandateResponse: 'Mandate',
  LimitsResponse: 'Limits',
  ChatMessageResponse: 'ChatMessage',
  ChatReplyDto: 'ChatReply',
  ProposalSummaryDto: 'ProposalSummary',
  ProposalResponse: 'Proposal',
  ApprovalResponse: 'Approval',
  ApprovalDecisionResponse: 'ApprovalDecision',
  AlertResponse: 'Alert',
  ReportAlertResponse: 'ReportAlertResponse',
  HistoryItemResponse: 'HistoryItem',
  AuditEventResponse: 'AuditEvent',
  AttackDemoResponse: 'AttackDemoResponse',
  PageResponse: 'Page',
}

/** Records que no aparecen en el panel: los usa el LLM o el firmante. */
const IGNORADOS = new Set(['AgentToolsResponses'])

/**
 * Campos que el backend NO envia y el panel declara igualmente.
 *
 * `sentAt` y `confirmedAt` llegan por `HistoryItemResponse`, no por
 * `ProposalResponse`; y `checks` no los manda nadie. Estan en el tipo porque
 * el mock los necesita para que el chat y el historial se vean iguales, y la
 * interfaz ya funciona sin ellos.
 */
const SOBRANTES_ACEPTADOS = new Set(['credentialId', 'sentAt', 'confirmedAt', 'checks'])

/* ------------------------------------------------------------------ */

type Forma = Record<string, string>

/**
 * Divide el cuerpo de un record por comas de nivel superior.
 * `Map<String, String> metadata` es un campo, no dos.
 */
function partir(cuerpo: string): string[] {
  const partes: string[] = []
  let actual = ''
  let angulo = 0
  let paren = 0
  for (const ch of cuerpo) {
    if (ch === '<') angulo++
    else if (ch === '>') angulo--
    else if (ch === '(') paren++
    else if (ch === ')') paren--
    if (ch === ',' && angulo === 0 && paren === 0) {
      partes.push(actual)
      actual = ''
      continue
    }
    actual += ch
  }
  partes.push(actual)
  return partes
}

/**
 * Ultima linea util de una declaracion de campo Java, sin anotaciones ni
 * genericos: `Map<String, String> metadata` -> `Map<String, String> metadata`,
 * `List<FieldErrorDetail> details` -> `List<FieldErrorDetail> details`.
 */
function limpiarCampo(declaracion: string): string {
  return (
    declaracion
      .replace(/\/\/.*$/gm, '')
      .replace(/<[^<>]*(?:<[^<>]*>)?[^<>]*>/g, ' ')
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean)
      .pop() ?? ''
  )
}

/** Nombre del ultimo identificador de una declaracion de campo Java. */
function nombreDeCampo(declaracion: string): string {
  const palabras = limpiarCampo(declaracion).split(/\s+/).filter(Boolean)
  return (palabras[palabras.length - 1] ?? '').replace(/[,;]$/, '').trim()
}

/** Tipo declarado del campo: `Map<String, String> metadata` -> `Map`. */
function tipoDeCampo(declaracion: string): string {
  const palabras = limpiarCampo(declaracion).split(/\s+/).filter(Boolean)
  return (palabras[0] ?? '').replace(/^public\s+/, '')
}

/** Devuelve el texto entre `apertura` y su parentesis de cierre. */
function dentroDeParentesis(fuente: string, desde: number): { cuerpo: string; fin: number } | null {
  let nivel = 0
  for (let i = desde; i < fuente.length; i++) {
    if (fuente[i] === '(') nivel++
    else if (fuente[i] === ')') {
      nivel--
      if (nivel === 0) return { cuerpo: fuente.slice(desde + 1, i), fin: i }
    }
  }
  return null
}

/**
 * Forma de un record de Java como `ruta -> campo`, bajando a los `record`
 * anidados. Sin esto, los campos del `ProposalDto` de `ApprovalResponse`
 * parecerian campos del record exterior.
 */
function formaJava(fuente: string, nombre: string, prefijo = ''): Forma {
  const re = new RegExp(`record\\s+${nombre}\\s*\\(`, 's')
  const m = re.exec(fuente)
  if (!m) return {}

  const abierto = fuente.indexOf('(', m.index)
  const cuerpo = dentroDeParentesis(fuente, abierto)
  if (!cuerpo) return {}

  const forma: Forma = {}
  for (const parte of partir(cuerpo.cuerpo)) {
    const campo = nombreDeCampo(parte)
    if (!campo) continue
    const ruta = prefijo + campo
    forma[ruta] = campo

    // Si el tipo del campo es un record declarado en el cuerpo, se baja.
    const tipo = tipoDeCampo(parte)
    const anidado = new RegExp(`record\\s+${tipo}\\s*\\(`).test(fuente.slice(cuerpo.fin))
    if (anidado) Object.assign(forma, formaJava(fuente, tipo, `${ruta}.`))
  }
  return forma
}

/**
 * Forma de un interface de TypeScript como `ruta -> campo`, bajando a los
 * tipos de objeto en linea. Aqui `proposal: { ... } | null` son dos niveles.
 */
function formaTs(fuente: string, nombre: string, prefijo = ''): Forma {
  const m = new RegExp(`export interface ${nombre} \\{`).exec(fuente)
  if (!m) return {}

  const inicio = fuente.indexOf('{', m.index)
  const forma: Forma = {}
  let i = inicio + 1
  let linea = ''

  while (i < fuente.length) {
    const ch = fuente[i]
    if (ch === '{') {
      // Objeto en linea: se recorre recursivamente.
      const cierre = cierreDeLlave(fuente, i)
      const rutaCampo = linea.trim().replace(/\??\s*[:(].*$/, '').trim()
      if (rutaCampo) {
        const ruta = prefijo + rutaCampo
        forma[ruta] = rutaCampo
        Object.assign(forma, formaTsObjeto(fuente.slice(i, cierre + 1), `${ruta}.`))
      }
      i = cierre + 1
      linea = ''
      continue
    }
    if (ch === '}') return forma
    if (ch === '\n') {
      const t = linea.trim()
      if (t && !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*')) {
        const campo = t.match(/^([A-Za-z_$][\w$]*)\??\s*[:(]/)
        if (campo) {
          const ruta = prefijo + campo[1]
          forma[ruta] = campo[1]
        }
      }
      linea = ''
      i++
      continue
    }
    linea += ch
    i++
  }
  return forma
}

/** Indice de la llave que cierra el `{` de `inicio`. */
function cierreDeLlave(fuente: string, inicio: number): number {
  let nivel = 0
  for (let i = inicio; i < fuente.length; i++) {
    if (fuente[i] === '{') nivel++
    else if (fuente[i] === '}') {
      nivel--
      if (nivel === 0) return i
    }
  }
  return fuente.length - 1
}

/** Igual que `formaTs` pero para un objeto `{ ... }` suelto. */
function formaTsObjeto(fuente: string, prefijo: string): Forma {
  const forma: Forma = {}
  let linea = ''
  for (const ch of fuente.slice(1, -1)) {
    if (ch === '{') continue
    if (ch === '\n') {
      const t = linea.trim()
      const campo = t.match(/^([A-Za-z_$][\w$]*)\??\s*[:(]/)
      if (campo && !t.startsWith('//') && !t.startsWith('*')) {
        const ruta = prefijo + campo[1]
        forma[ruta] = campo[1]
      }
      linea = ''
      continue
    }
    linea += ch
  }
  return forma
}

const tipos = readFileSync(TIPOS, 'utf8')
const archivos = readdirSync(DTOS).filter((f) => f.endsWith('.java'))

let problemas = 0
let comparados = 0

console.log(`Contrato: ${DTOS}\n`)

for (const archivo of archivos) {
  const nombreRecord = archivo.replace(/\.java$/, '')
  if (IGNORADOS.has(nombreRecord)) continue

  const nombreTS = TRADUCIONES[nombreRecord] ?? nombreRecord
  const fuente = readFileSync(join(DTOS, archivo), 'utf8')
  const java = formaJava(fuente, nombreRecord)
  const ts = formaTs(tipos, nombreTS)

  if (Object.keys(java).length === 0 && Object.keys(ts).length === 0) continue
  comparados++

  const sinEnTs = Object.keys(java).filter((k) => !(k in ts) && !SOBRANTES_ACEPTADOS.has(k))
  const sinEnJava = Object.keys(ts).filter((k) => !(k in java) && !SOBRANTES_ACEPTADOS.has(k))

  if (sinEnTs.length === 0 && sinEnJava.length === 0) {
    console.log(`  ok   ${nombreRecord} -> ${nombreTS} (${Object.keys(java).length} campos)`)
    continue
  }

  problemas++
  console.log(`  FALLA ${nombreRecord} -> ${nombreTS}`)
  if (sinEnTs.length > 0) console.log(`         en Java y no en TS: ${sinEnTs.join(', ')}`)
  if (sinEnJava.length > 0) console.log(`         en TS y no en Java: ${sinEnJava.join(', ')}`)
}

if (SOBRANTES_ACEPTADOS.size > 0) {
  console.log(`\nDiferencias aceptadas a proposito (no se comparan): ${[...SOBRANTES_ACEPTADOS].join(', ')}`)
}

console.log(`\n${comparados - problemas}/${comparados} records coinciden`)
if (problemas > 0) process.exit(1)
