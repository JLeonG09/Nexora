import { compararImportes, porcentaje, restarImportes, sumarImportes } from '../src/lib/format.ts'

let fallos = 0
function igual(etiqueta: string, obtenido: unknown, esperado: unknown) {
  const ok = obtenido === esperado
  if (!ok) fallos++
  console.log(`  ${ok ? 'ok  ' : 'FALLA'} ${etiqueta}${ok ? '' : ` -> ${obtenido} (esperado ${esperado})`}`)
}

console.log('== sumarImportes ==')
igual('vacia', sumarImportes([]), '0.0000000')
igual('con null y undefined', sumarImportes([null, undefined, '']), '0.0000000')
igual('un solo importe', sumarImportes(['8.0000000']), '8.0000000')
igual('sin el cero delante', sumarImportes(['0.5000000', '0.5000000']), '1.0000000')
igual('el clasico 0.1 + 0.2', sumarImportes(['0.1000000', '0.2000000']), '0.3000000')
igual('tres veces 0.1', sumarImportes(['0.1000000', '0.1000000', '0.1000000']), '0.3000000')
igual('con acarreo entre columnas', sumarImportes(['9.9999999', '0.0000002']), '10.0000001')
igual('mezcla de anchos', sumarImportes(['5', '0.25', '0.0000005']), '5.2500005')
igual('coma decimal', sumarImportes(['1,5']), '1.5000000')
igual('cadena vacia entre medias', sumarImportes(['1.0000000', 'x', '2.0000000']), '3.0000000')
igual('monto grande', sumarImportes(['99999999.9999999', '0.0000001']), '100000000.0000000')
igual('centimos repetidos', sumarImportes(['0.0100000', '0.0100000', '0.0100000', '0.0100000', '0.0100000']), '0.0500000')

console.log('== restarImportes ==')
igual('queda de 45 con 28 gastados', restarImportes('45.0000000', '28.0000000'), '17.0000000')
igual('no baja de cero', restarImportes('10.0000000', '25.0000000'), '0.0000000')
igual('con nulos', restarImportes(null, null), '0.0000000')
igual('gasto mayor que el tope', restarImportes('45.0000000', '80.0000000'), '0.0000000')
igual('sin acarreo flotante', restarImportes('0.3000000', '0.1000000'), '0.2000000')

console.log('== compararImportes ==')
igual('25 contra "25"', compararImportes('25.0000000', '25'), 0)
igual('menor', compararImportes('8.0000000', '10'), -1)
igual('mayor', compararImportes('80.0000000', '25'), 1)
igual('nulo contra numero', compararImportes(null, '25'), -1)

console.log('== porcentaje ==')
igual('mitad', porcentaje('25.0000000', '50.0000000'), 50)
igual('sin total', porcentaje('25.0000000', '0.0000000'), 0)
igual('sin total nulo', porcentaje('25.0000000', null), 0)
igual('acotado a 100', porcentaje('80.0000000', '50.0000000'), 100)
igual('acotado a 0', porcentaje('0.0000000', '50.0000000'), 0)

console.log(fallos === 0 ? '\ntodas correctas' : `\n${fallos} FALLOS`)
if (fallos > 0) process.exit(1)
