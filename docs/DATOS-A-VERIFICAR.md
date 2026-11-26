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
