# Sistema de diseño - Nexora

**Sencillo y grande.** Nexora es para personas mayores y para quien tiene poca
práctica con lo digital. Le pide pagos a un asistente y quiere entender, sin
esfuerzo, qué pasó con su dinero. Eso decide todo lo que sigue: letra grande,
pocas pantallas, pocas palabras y casi nada que se mueva.

> Esta versión (1 oct 2026) sustituye a la anterior, que describía un panel de
> control denso con letra de 14 px. Ese enfoque chocaba con el público real.

Tailwind CSS v4. No hay `tailwind.config.js`: los tokens viven en `@theme`
dentro de `src/index.css`.

---

## Fundamento

1. **Una cosa por pantalla.** El chat es el producto. Las demás pantallas son
   vistas del mismo estado, no secciones independientes.
2. **El color dice algo o no aparece.** Tres colores con significado y todo lo
   demás en grises:

| Color | Significado |
|---|---|
| `led` | Estado vivo: confirmado, activo, conectado. |
| `acento` | Acción: el botón que hace algo. |
| `oro` | Dinero y la marca del asistente. Nunca texto con degradado. |

3. **Nada flota.** Superficies con borde de 1 px (`.elevada`) y, como mucho,
   `--sombra-1`. Las sombras grandes son solo para lo que de verdad está
   encima de la página: diálogos, cajón y toasts.

---

## Navegación

Seis entradas, en este orden: **Inicio, Mi billetera, Pendientes, Mis
contactos, Mis reglas de pago, Mis movimientos.** Ni una más.

- **Accesibilidad** va en el pie de la barra lateral, junto a la cuenta.
- `/auditoria` y `/demo` existen por URL, pero no están en el menú: la
  auditoría es para soporte y la demo del atacante es para presentar.
- Las palabras son del usuario, no del sistema: "Mis reglas de pago" y no
  "Mandato"; "Pendientes" y no "Aprobaciones y alertas".

---

## Tipografía

Stack del sistema, sin fuentes externas: cero parpadeo y funciona sin internet.

- La escala vive en `rem`. La preferencia de letra (`data-letra` en `<html>`)
  escala toda la interfaz: `normal` 100 %, **`grande` 112,5 % (por defecto)**,
  `muy-grande` 125 %.
- El texto de lectura no baja de `base`. `2xs` y `xs` son solo para datos
  secundarios (fecha de un mensaje, detalle técnico plegado).
- El **monoespaciado** es para lo que se copia o se alinea en columna: hashes,
  direcciones `G...`/`C...` e importes en columna (`.mono`, `.cifras`).

---

## Tamaños y espaciado

- Objetivo: botones y controles táctiles de **48 px de alto como mínimo**
  (44 px en la barra superior del celular). Todo lo nuevo debe cumplirlo; lo
  que ya existe se revisa pantalla por pantalla.
- Escala de 4 px. `--radius-control` (6 px) para controles y `--radius-card`
  (10 px) para contenedores; nada pasa de 10 px salvo los avatares redondos.
- Aire generoso dentro de cada bloque. Mejor una pantalla más larga que una
  pantalla apretada.

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

Poco y corto. Todo respeta `prefers-reduced-motion` y la opción "Sin
animaciones" de Accesibilidad (`data-movimiento='reducido'`).

| | |
|---|---|
| `emerger` | Entrada de mensajes y pasos: 240 ms, 6 px, sin desenfoque. |
| `.orbe.pensando` | La marca del asistente parpadea suave **solo mientras piensa**. Quieta el resto del tiempo. |
| `latido` | El LED de conexión. |
| `aparecer` | Diálogos y notificaciones. |

`--ease-salida: cubic-bezier(0.16, 1, 0.3, 1)`. Nada pasa de 260 ms: una
animación larga se lee como lentitud del sistema.

La landing tiene su propio revelado al bajar y es la única excepción.

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
| `< 64rem` | Una columna. La barra lateral pasa a cajón y hay barra superior. |
| `≥ 64rem` | Barra lateral fija. |

El chat ocupa la pantalla y la caja de escribir queda abajo; con el chat
vacío va centrada.

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

- **Texto con degradado, fondos con grano o con "luz ambiental".** Decoran y
  restan contraste.
- **Sombras grandes y superficies que flotan** fuera de diálogos y toasts.
- **Animaciones en bucle** que no comuniquen un estado.
- **Escalar botones al pasar el ratón.** El cambio de color basta.
- **Colores de estado sin etiqueta.**
- **Iconos sin texto** en acciones que no sean obvias.
- **`alert()` y `confirm()` nativos.** Hay `useConfirm` y `Toast`.
- **Más de seis entradas en el menú.**

---

## Responsive y tipografía: dónde mirar

`src/index.css` es la fuente. Los bloques están separados por comentarios con
la regla de cada uno y qué componente los consume, para que se pueda cambiar un
token sin tener que buscar quién lo usa.
