# Datos pendientes de verificar

Todo lo siguiente son estimaciones razonables para que el prototipo sea jugable. Antes de
llamarlo «realista» hay que contrastarlo con documentación oficial (Renfe, Adif, fabricante,
Libro Horario, Cuadro de Velocidades Máximas, especificación ASFA Digital) o con maquinistas.

## Renfe Civia (`src/data/civia.js`)
- Serie y composición modelada: 465, 5 coches, ~98,6 m.
- Masa en vacío (160 t), plazas, factor de masas rotativas.
- Potencia (2200 kW), esfuerzo máximo (170 kN), velocidad máxima (120 km/h).
- Coeficientes de resistencia al avance (Davis).
- Presiones de freno, deceleración de emergencia, regulador del compresor (8–10 bar),
  presión mínima de pantógrafo y de aflojamiento del freno de estacionamiento.
- Tensión de baterías (72 V) y número de puertas por costado.
- El manipulador real es continuo; aquí tiene 6 puntos de tracción y 7 de freno.
- El compresor auxiliar está acelerado para que el arranque en frío no sea eterno.

## Línea C-1 Santa Justa – Utrera (`src/data/line-c1.js`)
- Puntos kilométricos de las estaciones y longitud de andenes.
- Lado del andén en cada estación.
- Velocidades máximas por tramo, rampas y pendientes, curvas.
- Posición real de señales y balizas (aquí se generan automáticamente).
- Horario (se calcula con un modelo sencillo) y números de tren (ficticios).

## ASFA Digital (`src/data/asfa.js`, `src/core/asfa.js`)
- Sólo se modelan las balizas L1 (anuncio de parada), L3 (vía libre), L7 (previa de señal en
  parada) y L8 (señal en parada). Frecuencias aproximadas.
- Curvas de control: anuncio de parada → 60 km/h en 30 s; previa de parada → comprobación
  de 60 km/h y control hasta 40 km/h en 14 s. Tipo de tren 120.
- Faltan: anuncio de precaución, preanuncio, vía libre condicional, paso a nivel, LTV,
  modos de ASFA (BTS, RAM, etc.) y la secuencia real de pulsadores.

## Simplificaciones de diseño
- Vía única de circulación (la vía 2 sólo se dibuja).
- Señal de salida: se abre cuando el tren está detenido en el andén y faltan 15 s.
- Hombre muerto de tipo «vigilancia» cada 30 s en marcha.

## Ruta real C-1 (`src/data/c1/`, generada por `tools/route/build-route.mjs`)
Construida con datos abiertos; resumen de la última construcción en `src/data/c1/resumen.json`.
- **Trazado, puentes, túneles y desvíos**: OpenStreetMap. Es fiable en planta, pero la vía
  concreta por la que circula el tren en cada estación la elige la herramienta (camino más corto).
- **Rasantes**: obtenidas del MDT del IGN a lo largo del eje, ignorando puentes y túneles y
  suavizadas. El MDT es la superficie del terreno, no la rasante de la vía: contrastar con el
  perfil longitudinal oficial.
- **Velocidades máximas**: etiquetas `maxspeed` de OSM limitadas a 120 km/h (velocidad de la
  unidad). Donde OSM no tiene dato se usa 80 km/h y el tramo lleva `verificar`. Contrastar con la
  Declaración sobre la Red y el Cuadro de Velocidades Máximas de Adif.
- **Señales**: OpenStreetMap apenas tiene señales mapeadas en esta línea, así que las señales y
  balizas se siguen **generando** a partir de las estaciones. Pendiente: posiciones reales.
- **Andenes**: longitud y lado salen de OSM donde el andén está mapeado (`verified: true`). En
  Santa Justa y San Bernardo se usan 200 m y lado derecho por defecto. [Verificar]
- **Horario**: tiempos de recorrido y salidas del GTFS de Cercanías (número de tren real).
- **Postes kilométricos**: no hay hitos en OSM en este tramo; se muestra la distancia desde
  Santa Justa, no el PK oficial de la línea.
- **Edificios**: Catastro (huella y plantas) o, si el servicio no responde, OpenStreetMap.
  Altura = plantas × 3,1 m.
