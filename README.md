# Birra y Brujula

Aplicacion web para organizar un viaje en grupo de principio a fin: asistentes, votacion de casa, transporte, compra, actividades, itinerario y reparto de gastos.

## Que hace

- Gestiona asistentes del viaje.
- Permite proponer casas, votar y ver ranking en directo.
- Calcula transporte segun modo (coche, tren o avion).
- Lleva una lista de compra compartida con responsable y estado.
- Permite proponer actividades, votarlas y estimar presupuesto por persona.
- Genera itinerario por dias con bloques horarios.
- Calcula balance y pagos recomendados entre participantes.
- Exporta informe del plan en formato compacto o detallado para imprimir/PDF.
- Funciona con almacenamiento local y cache offline basica.

## Stack tecnico

- HTML5 (multipagina)
- CSS3
- JavaScript vanilla (sin frameworks)
- localStorage para persistencia
- Service Worker (`sw.js`) para cache del shell de la app

## Estructura del proyecto

- `index.html`: dashboard y resumen general.
- `votaciones.html`: propuestas y votacion de casa.
- `transporte.html`: calculadora y guardado de costes de transporte.
- `compra.html`: lista de compra compartida.
- `actividades.html`: propuestas, votos e itinerario.
- `app.js`: logica principal de todos los modulos.
- `style.css`: estilos globales.
- `sw.js`: cache y soporte offline basico.
- `logo.png`, `favicon.png`, `favicon.svg`: recursos visuales.

## Como ejecutar en local

Importante: para que el Service Worker funcione correctamente, sirve el proyecto por `http://` (no abrir el HTML con `file://`).

Opciones habituales:

1. Con VS Code Live Server, abrir la carpeta y lanzar servidor local.
2. Con cualquier servidor estatico (Nginx, Apache, etc.) apuntando a la raiz del proyecto.

Despues abre en navegador la URL local, por ejemplo:

- `http://localhost:5500/index.html`

## Persistencia de datos

La aplicacion guarda datos en `localStorage` del navegador con claves como:

- `trip_members`
- `trip_houses`
- `trip_transport`
- `trip_shopping`
- `trip_activities`
- `trip_itinerary`

Los datos son locales al navegador/dispositivo.

## Flujo recomendado de uso

1. Anadir asistentes desde el dashboard.
2. Proponer y votar casa en la seccion Casa.
3. Definir transporte y guardar coste.
4. Completar lista de compra.
5. Proponer y votar actividades.
6. Construir itinerario por dias.
7. Revisar liquidacion sugerida y exportar informe.

## Funcionalidades destacadas

- Ranking automatico por votos para casas y actividades.
- Conversor de gastos a coste por persona.
- Liquidacion sugerida entre deudores y acreedores.
- Generador de plan automatico en itinerario.
- Boton de reset para limpiar todo y empezar nuevo viaje.

## Notas

- El modo offline cubre principalmente el shell de la app y recursos cacheados.
- Las imagenes externas (por ejemplo, fondos remotos) dependen de disponibilidad de red si no estan en cache.

