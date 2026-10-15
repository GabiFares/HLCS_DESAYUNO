# Gestión de desayunos

Aplicación web para reemplazar la planilla en papel usada por recepción y cafetería durante el servicio de desayuno. La primera versión permite administrar estadías, registrar los desayunos servidos por habitación y fecha, controlar el stock diario, guardar una nota y consultar días anteriores.

No existe autenticación en esta versión. Recepción y cafetería son áreas separadas (`/recepcion` y `/cafeteria`) y ninguna muestra navegación hacia la otra.

## Stack

- TypeScript estricto
- React y React Router
- Vite
- Tailwind CSS con `@tailwindcss/vite`
- Cloudflare Workers con el plugin oficial `@cloudflare/vite-plugin`
- Cloudflare D1 y SQL versionado
- Wrangler
- npm

## Arquitectura

La aplicación es un único despliegue full-stack de Cloudflare Workers:

1. React genera una SPA que contiene las dos áreas operativas.
2. El Worker atiende exclusivamente `/api/*`.
3. El Worker valida los datos, aplica las reglas de negocio y consulta D1 mediante prepared statements.
4. D1 refuerza la integridad mediante claves foráneas, restricciones, índices y triggers.

No se utiliza framework de backend, ORM ni estado global. Esto mantiene pocas capas y permite incorporar autenticación delante de las rutas/API más adelante.

## Estructura

```text
src/
  cafeteria/       Pantalla y componentes de cafetería
  components/      Componentes visuales compartidos
  lib/             Cliente API y utilidades de fechas
  recepcion/       Pantalla y formularios de recepción
worker/
  index.ts         Router HTTP
  stays.ts         API de estadías
  breakfast.ts     API y reglas de desayunos
  inventory.ts     API de inventario y productos
  notes.ts         API de notas
  validation.ts    Validación de servidor y fecha uruguaya
shared/            Contratos TypeScript compartidos
migrations/        Migraciones SQL de D1
scripts/           Verificaciones locales repetibles
```

## Modelo de datos

- `stays`: una fila por estadía, no por habitación. Una habitación puede aparecer en muchas estadías históricas. Contiene habitación, check-in, check-out, pasajeros y fecha efectiva de finalización.
- `breakfast_daily_status`: contador servido para una estadía y fecha. Su clave primaria es `(stay_id, service_date)`.
- `products`: catálogo configurable con nombre, unidad opcional, estado activo y orden.
- `daily_inventory`: cantidades ingresada y restante para un producto y fecha. Acepta decimales y usa `(product_id, inventory_date)` como clave.
- `daily_notes`: una nota general por fecha.

Las relaciones hacia estadías y productos usan claves foráneas. Los índices priorizan consultas por fechas y orden del catálogo. Los triggers de desayuno impiden guardar un contador mayor que los pasajeros o fuera de las fechas de la estadía. Otro trigger recorta automáticamente el contador si recepción reduce los pasajeros; por ejemplo, `3/3` pasa atómicamente a `2/2`, nunca a `3/2`.

Una estadía se puede eliminar desde recepción siempre que no tenga desayunos registrados (`served_count > 0`): en ese caso la API responde `409` y el historial queda intacto. Los registros en cero no bloquean la eliminación. La clave foránea `ON DELETE RESTRICT` es la última barrera a nivel de base, de modo que un borrado nunca pierde el historial de desayunos.

## Fechas y regla de cierre

Check-in, check-out, fecha de desayuno, inventario, nota y finalización se almacenan como fechas calendario `YYYY-MM-DD`. No se convierten a timestamps UTC. “Hoy” se calcula explícitamente en `America/Montevideo`, evitando que un cambio de zona horaria desplace el día operativo del hotel.

Una estadía participa del desayuno de una fecha cuando:

```text
check_in_date <= fecha <= check_out_date
```

El check-out de hoy sigue pendiente. Deja de bloquear sólo cuando todos sus pasajeros desayunaron o recepción marca la estadía como finalizada; `completed_on <= fecha` la excluye de las pendientes. El cierre se habilita cuando ninguna estadía incluida tiene `served_count < guest_count`.

El total diario se calcula en servidor como la suma de todos los registros de `breakfast_daily_status` de esa fecha, incluso si una estadía fue finalizada después de servir desayunos.

## Sincronización

Cafetería actualiza los contadores de manera optimista y serializa su guardado para evitar requests fuera de orden. La pantalla de hoy vuelve a consultar las habitaciones cada 15 segundos y también cuando la pestaña recupera visibilidad. Es una solución deliberadamente simple para dos puestos operativos y no utiliza WebSockets.

Inventario y notas usan autosave con 800 ms de debounce; también guardan inmediatamente cuando el campo pierde el foco. Se muestran los estados `Guardando…` y `Guardado`.

## Desarrollo local desde cero

Requisitos: Node.js actual compatible con Vite, npm y una terminal.

```bash
npm install
npm run db:migrate:local
npm run dev
```

Abrir:

- Recepción: <http://127.0.0.1:5173/recepcion>
- Cafetería: <http://127.0.0.1:5173/cafeteria>

Vite, el Worker y el binding D1 se ejecutan juntos. La base local persiste bajo `.wrangler/` y no requiere crear recursos remotos.

## Calidad y verificaciones

```bash
npm run lint
npm run typecheck
npm run build
```

Con `npm run dev` activo también se pueden repetir los flujos API locales:

```bash
npm run test:e2e:local
```

La prueba de navegador requiere Google Chrome en macOS y un Chrome headless iniciado con depuración en el puerto 9222; es una herramienta de validación del entorno actual, no un requisito para usar la aplicación:

```bash
npm run test:browser:local
```

## Migraciones D1

Aplicar las pendientes en local:

```bash
npm run db:migrate:local
```

Crear una migración nueva:

```bash
npx wrangler d1 migrations create hlcs-desayuno nombre_de_la_migracion
```

Editar el SQL creado en `migrations/`, probarlo localmente y volver a ejecutar lint, typecheck, build y los flujos relevantes.

## Despliegue a producción

El Worker `hlcs-desayuno` utiliza la base D1 `hlcs-desayuno-production`, declarada en `wrangler.jsonc`. Antes de operar sobre recursos remotos, verificar siempre la cuenta activa y que el identificador de D1 coincida con la configuración:

```bash
npx wrangler whoami
npx wrangler d1 info hlcs-desayuno-production
npx wrangler d1 migrations list hlcs-desayuno-production --remote
```

Procedimiento recomendado:

1. Ejecutar tests, lint, typecheck y build desde un commit aprobado.
2. Exportar un respaldo completo fuera del repositorio y comprobar que pueda restaurarse:

   ```bash
   npx wrangler d1 export hlcs-desayuno-production --remote --output=/ruta/segura/respaldo.sql
   ```

3. Registrar el bookmark previo mediante `wrangler d1 time-travel info hlcs-desayuno-production`.
4. Aplicar únicamente las migraciones revisadas:

   ```bash
   npm run db:migrate:remote
   ```

5. Volver a comprobar migraciones pendientes y hacer consultas de solo lectura para validar esquema y conteos.
6. Ejecutar `npx wrangler deploy --dry-run` sobre el build final.
7. Desplegar con `npm run deploy` y realizar smoke tests de `/recepcion`, `/cafeteria` y los endpoints de lectura.

Para revertir solamente el código, usar una versión estable identificada previamente con `wrangler deployments list` y `wrangler rollback <VERSION_ID>`. Un rollback del Worker no revierte D1. La recuperación de datos debe realizarse por separado mediante Time Travel o el respaldo SQL, después de detener escrituras y confirmar el punto exacto de restauración.

> **Importante:** los scripts `test:e2e:local`, `test:browser:local`, `test:ui-p0:local` y `test:dnd:local` crean, modifican o eliminan datos para verificar flujos. Deben ejecutarse exclusivamente contra el entorno local y rechazan cualquier `APP_URL` cuyo host no sea loopback.

La aplicación todavía no incluye autenticación ni autorización; esta limitación debe considerarse antes de ampliar el acceso al Worker.
