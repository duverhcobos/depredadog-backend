# Instrucciones del Proyecto — Backend Depredadog (NestJS)

El detalle de convenciones, arquitectura y workflows de este proyecto vive en skills bajo `.devin/skills/`, no en este archivo — cada skill cubre una sola responsabilidad y se invoca solo cuando es relevante, para no cargar contexto innecesario en cada sesión.

> Estado actual: el scaffold `nest new` es mínimo (`src/` solo trae los archivos default) y las skills describen las convenciones a seguir cuando el proyecto crezca (DDD por módulos, TypeORM+Postgres, propuestas antes de código). Las skills que asuman dominio (ejemplos multi-tenant, RLS) se ajustan a medida que el dominio de Depredadog se defina.

## Reglas mínimas siempre vigentes

- **Idioma de respuesta: español neutro latinoamericano** — tuteo estándar ("tienes", "puedes", "revisa"), sin voseo ni formas de España.
- **Package manager: npm** — nunca pnpm ni yarn (solo existe `package-lock.json`).
- **Commits sin trailer de herramienta** — no agregar `Generated with ...` ni `Co-Authored-By` al mensaje; solo el texto del commit.
- **Nunca editar archivos fuente directamente** para implementar funcionalidad o lógica de negocio: ver skill `propuesta-workflow` antes de escribir/modificar código (excepción: correcciones triviales de un solo archivo).
- **OS de desarrollo**: Windows / PowerShell.
- **Decisiones con opciones, siempre**: cuando una tarea llegue a un punto de decisión con alternativas — diseño, paths, naming, orden, incluir/excluir algo — NO decidir unilateralmente ni pedir confirmación abierta; presentar las opciones como pregunta de elección con trade-offs breves para que el usuario escoja.

## Índice de skills

| Skill | Cuándo usarla |
|-------|---------------|
| `stack-info` | Antes de sugerir librerías, comandos o patrones — confirmar el stack real del proyecto |
| `ddd-architecture` | Al decidir en qué capa va algo, o al revisar si un import viola el orden de dependencias |
| `module-structure` | Al crear un archivo nuevo — para saber la ruta exacta dentro de `src/` o de un módulo |
| `code-conventions` | Al escribir código — idioma inglés en archivos/identificadores nuevos, non-null assertion, DTOs vs swagger-schemas, command objects, etc. |
| `strict-layering-rule` | Al revisar que un use-case no construya DTOs directamente y que exista el mapper de aplicación |
| `code-patterns` | Al escribir excepciones de dominio, repositorios, JWT, guards, o throttling — ejemplos exactos a replicar |
| `new-endpoint-checklist` | Al implementar un endpoint nuevo — orden exacto de archivos a crear/completar |
| `unit-test-checklist` | Al definir qué `.spec.ts` hacen falta para un endpoint nuevo y qué mockear/probar |
| `e2e-test-setup` | Al correr o escribir `npm run test:e2e` — setup de la BD de test, migraciones, y cómo neutralizar `@Throttle` en los specs |
| `migrations-workflow` | **Siempre** que una propuesta cree/altere tablas — generar vs. escribir a mano, naming (tablas nuevas en plural), corrida en dev+test, verificación de `revert`, seeds y RLS |
| `modelo-evolucion` | Al implementar algo que el modelo documentado no cubre — sugerir el cambio al modelo (campo/tabla/constraint) para aprobación antes de implementar; el doc se actualiza en la misma propuesta |
| `api-docs` | Al implementar/alterar un endpoint — crear o actualizar su doc en `documentacion/api/` en el mismo commit (contrato para consumidores: request/responses/errores con JSON real) |
| `env-secrets` | Al agregar una config nueva o tocar URLs, credenciales, tokens o puertos — archivos `.env`/`.env.test`/`.env.example`, cómo agregar una variable, higiene de secretos |
| `propuesta-workflow` | **Siempre** que se vaya a proponer un cambio de código — formato y reglas del archivo en `propuestas/` |
| `pendientes-produccion` | Al crear/consultar ítems pendientes antes del deploy a producción — carpeta `pendientes/` propia del repo (los de la app van en la suya), formato, estados y criterio de cierre |
| `planeacion-workflow` | Al crear o actualizar un documento en `planeaciones/` — convención de "Estado" (en definición / decidido / implementado / pendiente externo / descartado) |
| `idor-checklist` | Al diseñar/revisar un endpoint que recibe un identificador de recurso |
| `rls-tenant-isolation` | Al crear una tabla de negocio o migración en proyecto multi-tenant — Row Level Security de PostgreSQL como segunda capa de aislamiento |
| `listados-paginacion-indices` | Al diseñar un endpoint de listado (`GET` que devuelve varias filas) o la migración de una tabla nueva — paginación, índices `(tenant_id, ...)`, anti-N+1 y totales del servidor |
| `token-saving-tools-policy` | Al explorar el código — cuándo leer directo vs. usar el grafo codebase-memory |
| `evaluacion-modulo` | **Gate obligatorio al cerrar un módulo** — evaluación 10/10 de producción: rúbrica, gaps por severidad, críticos se resuelven ya y el resto a `pendientes/` |

Si una instrucción parece faltar acá, buscarla primero en `.devin/skills/` antes de asumir que no existe.

## Flujo de desarrollo con subagentes

El proyecto tiene dos subagentes custom en `.devin/agents/`. **Usarlos siempre que aplique** — no implementar propuestas ni auditar código directamente en la sesión principal:

| Subagente | Rol | Cuándo delegarle |
|-----------|-----|------------------|
| `implementador` | Aplica propuestas aprobadas al pie de la letra + `npm run build` + `npm run test` (+ `test:e2e` si la propuesta incluye migraciones/e2e) | Después de que la sesión principal redacte y el usuario apruebe una propuesta |
| `revisor` | Audita DDD/convenciones/IDOR — solo lee, no edita | Después de implementar, para verificar calidad del código resultante |

### Flujo estándar para cambios no triviales

```
1. Sesión principal → diseña la propuesta en propuestas/
2. Usuario aprueba
3. Subagente "implementador" → aplica la propuesta
4. Subagente "revisor" → audita el resultado
5. Sesión principal → corre verificación final si hace falta y reporta al usuario
```

La sesión principal **piensa y decide**; los subagentes **ejecutan y verifican**.
Correcciones triviales de un solo archivo no necesitan subagente.
