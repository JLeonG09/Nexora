# Sistema de diseño — Riendas

Un panel de pagos se lee como un **panel de control**, no como un tablero de
anuncios. Eso decide casi todo lo que sigue: la densidad, la jerarquía y,
sobre todo, cuándo se usa color.

Tailwind CSS v4. No hay `tailwind.config.js`: en v4 los tokens viven en
`@theme` dentro de `src/index.css`, y cada uno genera sus utilidades
automáticamente.

---

## Fundamento

**El color es un LED, no un adorno.** Un verde en la interfaz significa que
algo está encendido: un pago confirmado, un mandato activo, una conexión con el
backend. Nunca decora, nunca resume, nunca agrada. Si un color no responde a
"¿qué está encendido?", no debería estar.

De ahí salen tres colores con significado y todo lo demás en escala de grises:

| Color | Significado |
|---|---|
| `led` | Estado vivo: confirmó, activo, conectado. |
| `acento` | Acción: el botón que hace algo. |
| `oro` | Dinero: importes, saldos, topes. |

Los estados que no son "vivo" usan `tinta-media` y una etiqueta de texto.

---

## Los datos son cajas, no tarjetas flotantes

La pantalla se construye con **módulos** unidos por filetes de 1 px dentro de
un marco, no con tarjetas suspendidas con sombra. Sin sombras debajo, sin
gradientes, sin esquinas redondeadas por encima de 10 px.

Es la diferencia entre un panel y un tablero: un tablero invita a mirar, un
panel invita a trabajar. La densidad es alta a propósito —interlineados de
1.4–1.55, tipografía de 11 a 14 px— porque la persona que usa esto tiene otras
nueve pestañas abiertas.

`.modulo`, `.modulo-cabecera`, `.modulo-cuerpo`, `.valla`, `.seccion`,
`.pagina-cabecera`, `.kpi` y `.cifras` son el vocabulario del layout. Los
componentes de React no inventan clases: consumen estas.

---

## Tipografía

Stack del sistema, sin peticiones de red: cero parpadeo de fuente y funciona sin
internet.

El **monoespaciado** está reservado para lo que debe alinearse en columna o
copiarse sin error:

- hashes Stellar (`txHash`, `publicKeyHex`)
- direcciones (`G...`, `C...`)
- importes en columna

`.mono` y `.cifras` aplican esto. Un importe suelto en medio de una frase usa
la tipografía normal; el mismo importe en una columna, monoespaciada.

### Escala cerrada

Ocho tamaños y ni uno más. Un panel denso no necesita nueve:

`2xs` (11) · `xs` (12) · `sm` (13) · `base` (14) · `lg` (16) · `xl` (20) ·
`2xl` (28) · `3xl` (36)

`base` es 14 px: más grande se siente como una landing, más pequeño ilegible en
un portátil de 13".

---

## Espaciado

Escala de 4 px. Los módulos usan `--radius-control` (6 px) para controles y
`--radius-card` (10 px) para contenedores. Por encima de 10 px las esquinas
empiezan a gritar "aplicación móvil".

El espaciado vertical entre secciones se marca con filetes, no con aire: aire
solo cuando el contenido respira dentro de un módulo.

---

## Estados

Cada estado tiene **color, borde y etiqueta**. Nunca color solo.

| Estado | Borde/fondo | Texto |
|---|---|---|
| `ok` | `#e6f4ec` | "Confirmado" |
| `aviso` | `#fdf1d6` | "Pendiente de aprobación" |
| `error` | `#fdeceb` | "Rechazado: supera el tope diario" |
| `info` | `#e5f0f7` | "Enviado a Stellar" |
| `neutro` | `#eef0f3` | "Archivado" |

`Badge` exige etiqueta siempre. Un LED verde sin palabra es invisible para
quien no distingue el verde, y en un panel de pagos eso es inaceptable.

Los mensajes de rechazo nunca son solo el código: salen con la frase que el
backend ya redactó y, cuando aplica, con la acción concreta —"quedan 12 USDC
disibles en 24 h"—.

---

## Vacío y carga

Tres estados, no uno:

1. **Vacío**: explica qué falta y ofrece la acción que lo resuelve. "No hay
   contactos. Añade el primero para poder pagar."
2. **Carga**: la forma del contenido, no un spinner en el centro de la nada.
   `Esqueleto` replica el módulo que va a aparecer.
3. **Error**: qué pasó y qué hacer. Nunca un `undefined` en pantalla ni un
   error técnico desnudo.

El error de la demo tiene caso propio: si el ataque no se puede lanzar porque
`DEMO_ATTACK_ENABLED=false`, se dice eso y no "404".

---

## Movimiento

Solo hay tres animaciones y todas son cortas:

| | |
|---|---|
| `latido` | El LED de conexión. Único elemento que se mueve sin interacción. |
| `entrar-izq` / `entrar-abajo` / `subir` | Entrada de mensajes y paneles. |
| `aparecer` | Modales y notificaciones. |

`--ease-salida: cubic-bezier(0.16, 1, 0.3, 1)` y duraciones de 150–260 ms.
Nada dura más de medio segundo: en un panel de pagos, una animación larga se
lee como lentitud del sistema.

Todo pasa por `prefers-reduced-motion`: si el sistema lo pide, las animaciones
se desactivan. No es cortesía, es que el usuario ya lo dijo.

---

## Tema

Dos temas, con el oscuro como ciudadano de primera clase porque es donde se
vive un panel de control de noche.

```
:root[data-tema='oscuro']           /* elección explícita */
@media (prefers-color-scheme: dark)  /* si el sistema lo pide */
:root:not([data-tema='claro'])       /* y no se eligió claro */
```

La preferencia se guarda y **se imprime en `index.html` antes de que corra
React**, para que no haya un destello blanco al cargar.

El panel es oscuro por defecto de hecho, no de palabra: `--color-fondo-cierre`
define el marco exterior y `--color-texto-cierre` el texto sobre él.

---

## Responsive

| Ancho | Qué cambia |
|---|---|
| `< 40rem` | Una columna. Barra lateral como cajón. Tabla → lista. |
| `≥ 40rem` | Los KPI pasan a rejilla de 2. |
| `≥ 48rem` | Rejilla de KPI a 4. Las acciones del chat se alinean a la derecha. |
| `≥ 64rem` | Sidebar fija, 3 columnas de KPI, ancho de contenido acotado. |
| `≥ 80rem` | Contenido más ancho para el historial y la auditoría. |

El chat es el caso especial: en móvil el hilo ocupa la pantalla y el campo de
escritura se pega abajo; en escritorio, hilo a la izquierda y barra de topes a
la derecha.

---

## Accesibilidad

- Foco visible en todos los controles. Nunca `outline: none` sin sustituto.
- Contraste AA en texto normal y en los cinco tonos de estado, en los dos temas.
- Iconos siempre con `aria-hidden` y etiqueta siempre con texto.
- Los estados live (`aria-live`) se reservan para avisos y alertas, no para
  números que cambian solos.
- Formularios con `<label>` asociado, no con `placeholder` como etiqueta.
- Toasts con `role="status"`; diálogos con foco atrapado y `Esc` para cerrar.

---

## Lo que no se usa

Y por qué, para que no vuelva a aparecer:

- **Sombras** salvo en popovers, que sí flotan sobre la página.
- **Gradientes** en nada que no sea un LED encendido.
- **Colores de estado sin etiqueta.**
- **Iconos sin texto** en acciones que no sean obvias.
- **Transiciones largas.** Si tarda más de 260 ms, parece un fallo.
- **`alert()` y `confirm()` nativos.** Hay `useConfirm` y `Toast`.

---

## Responsive y tipografía: dónde mirar

`src/index.css` es la fuente. Los bloques están separados por comentarios con
la regla de cada uno y qué componente los consume, para que se pueda cambiar un
token sin tener que buscar quién lo usa.
