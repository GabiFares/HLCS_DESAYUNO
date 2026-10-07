# Cambios en importación Desbravador

## Parser (tolerancia a PDF real)
- Ajustados patrones de detección del encabezado (`HABITACI(?![A-Z0-9])`, `OPERAC(?![A-Z0-9])`, `DESCRIPC(?![A-Z0-9])`) para aceptar rótulos cortados/fusionados por pdf.js.
- Detección del informe basada en indicadores (`INFORME`, `DETALLE DIARIO`, `OCUPACION/HABITACI/FECHA IN/FECHA OUT/PAX`) sin exigir cadena exacta; normalización de acentos/espacios/mayúsculas.
- Extrae ancho de ítem (`width`) para interpolar posiciones de caracteres al agrupar encabezado (robusto ante fusión de celdas).

## UI Recepción
- Se quitó el botón "Nueva estadía" (creación manual deshabilitada intencionalmente). La carga de estadías será únicamente por importación desde PDF.
- Se mantiene el modal de importación Desbravador y la recarga automática tras aplicar.
- La lógica de formulario/edición queda preservada en código (no eliminada) por si se desea reactivar manualmente en el futuro.

## Importación múltiple y superposición
- El flujo ya permite importar varios PDFs (cada import crea su propio registro en `stay_imports`).
- Idempotencia: `(habitación normalizada, check_in)` identifica la estadía; al importar el mismo PDF nuevamente las filas existentes quedan `unchanged`.
- Superposición: si un mismo par aparece con diferencias, el planificador marca actualización cuando es compatible (no rompe historial de desayunos servidos, no acorta check-out con desayunos existentes, no reduce PAX por debajo de desayunos servidos, no modifica estadías finalizadas con diferencias). Casos ambiguos/transferencias van a `review`. No se generan duplicados.
- El endpoint `apply` vuelve a parsear y resuelve contra el estado actual de D1 (no confía en preview del cliente). Múltiples imports consecutivos son seguros.
