# Informe de cambios - feature/importar-reservas-desbravador

## Estado
- Rama: `feature/importar-reservas-desbravador`
- Commit: 220defa
- Working tree: limpio
- Sin push/merge (pendiente)

## 1. Migración D1
- `migrations/0004_desbravador_import.sql`: tabla `stay_imports` para auditoría (counts por resultado). Eliminado `stay_import_items` para permitir escritura transaccional única con `db.batch()`.

## 2. Núcleo compartido (shared/desbravador)
- `normalize.ts`: normalización de texto y habitaciones (case/acentos/espacios). Convergencia de habitaciones numéricas (elimina ceros a izquierda) para evitar duplicados entre "303" y "0303".
- `types.ts`: contratos de parseo/plan/preview/result.
- `extract.ts`: extracción de texto PDF vía `unpdf` (server-side). Configura pdf.js con `definePDFJSModule(() => import("unpdf/pdfjs"))` para bundle único en Worker. Propaga errores de dominio (`ReportError`).
- `parser.ts`: parser posicional tolerante al PDF real. Detección de encabezado robusta (interpolación por ancho de caracteres, búsqueda por posición ante fusión de ítems por pdf.js). Patrones flexibles para etiquetas (`HABITACI`, `OPERAC`, `DESCRIPC`) y detección del informe por indicadores (`INFORME`, `DETALLE DIARIO`, `OCUPACION`, columnas). Reconstrucción de filas partidas, filtrado de ruido (totales/pies), transferencias marcadas para revisión, deduplicación intra-informe.
- `plan.ts`: deduplicación contra D1 (`(roomNumber normalizado, checkInDate)`). Decide `create/update/unchanged/review/ignored`. Protecciones de integridad con historial de desayunos: no reduce PAX por debajo de servidos, no acorta check-out excluyendo desayunos existentes, no modifica estadías finalizadas con diferencias. Transferencias siempre van a revisión.

## 3. Worker (backend)
- `worker/desbravador/import.ts`: endpoints `POST /api/import/desbravador/preview` y `POST /api/import/desbravador/apply`. Preview sin escritura; apply vuelve a parsear y resuelve contra estado actual de D1 en `db.batch()` (transaccional). Escribe auditoría en `stay_imports` y devuelve conteos + `importId`.
- `worker/index.ts`: registra rutas de importación.
- `worker/http.ts`: errores HTTP (reutilizado).

## 4. Frontend
- `src/lib/api.ts`: helpers `previewDesbravador(file)` y `applyDesbravador(file)` con FormData (sin forzar `Content-Type` JSON).
- `src/recepcion/ImportModal.tsx`: modal mobile-first con preview por bloques (Nuevas/Actualizaciones/Para revisar/Ignoradas), conteos, carga/apply y resultado final. UI pulida (bordes redondeados, espaciados, estados busy).
- `src/recepcion/ReceptionPage.tsx`: botón único "Importar reservas", eliminación de creación manual. Recarga automática tras aplicar. Textos de empty state actualizados para flujo solo-import.
- `shared/types.ts`: agrega `source?: "manual" | "desbravador"` y `externalId?: string | null` a `Stay`.

## 5. Tests
- `tests/desbravadorParser.test.ts` (21): casos normales, operaciones, no-HOSPEDAJE, filas partidas, transferencias, validaciones, varias páginas, duplicados intra-informe, normalización, no-reconocimiento.
- `tests/desbravadorPlan.test.ts` (14): nuevas, idempotencia, actualizaciones, protección desayunos, ambiguas, no importables.
- `tests/pdfText.test.ts` (5): integración real con `unpdf` (encabezado fusionado, varias páginas, rechazo PDF inválido, propagación errores). Verifica robustez frente a fusión de ítems de pdf.js.
- `tests/helpers/pdfFixture.ts`: generador sintético anonimizado para reproducir grilla/particiones.

Total: 40 tests, 100% pasando.

## 6. Configuración/Build
- `vite.config.ts`: `inlineDynamicImports: true` para environment `hlcs_desayuno` (evita `import()` dinámico a chunk separado en Worker con `unpdf/pdfjs`).
- `tsconfig.test.json`, referencia en `tsconfig.json`, habilitado `.ts` en app. Dependencias: `unpdf@1.8.1`, `@types/node`.
- Script `npm test` agregado.

## 7. Documentación
- `CHANGES_IMPORT.md`: resumen funcional/técnico y notas sobre importación múltiple y superposición.

## Validación end-to-end
- PDF real probado: preview → 200 OK con 20 reservas creadas, 1 en revisión (transferencia), 32 ignoradas. Apply correcto. Idempotencia verificada (unchanged en re-import). Múltiples imports seguros.
- Calidad: lint/typecheck/build verdes. UI responsiva mobile-first.
