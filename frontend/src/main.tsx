/**
 * Punto de entrada.
 *
 * Aqui solo se monta React y se conecta el error global de React, que si no
 * se captura se pierde en la consola y el usuario solo ve una pantalla en
 * blanco.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import './index.css'

const contenedor = document.getElementById('root')

if (!contenedor) {
  throw new Error('No se encontro el nodo #root en index.html')
}

createRoot(contenedor).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
