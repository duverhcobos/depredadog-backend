---
name: new-endpoint-checklist
description: Checklist del orden exacto de archivos a crear/completar al agregar un endpoint nuevo a este backend
argument-hint: "<módulo> <acción>"
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

Checklist de archivos para implementar un **endpoint nuevo** en el backend. Usar esto para definir el orden de una propuesta (ver skill `propuesta-workflow`) — no improvisar un orden distinto.

El orden de creación **no sigue las capas de DDD** (domain → application → infrastructure → presentation); sigue el orden en el que un desarrollador escribiría el código: empieza por el controlador y va creando cada dependencia en el momento exacto en que el código la referencia — no cuando "le toca por capa". Swagger queda excluido (ver skill `propuesta-workflow`, punto sobre Swagger).

**Un archivo no se escribe completo la primera vez que se crea.** Se crea vacío o con solo la firma en el momento en que otro archivo lo necesita para compilar (ej. un tipo en el constructor), y se completa después, cuando el desarrollador vuelve a él porque ya tiene lo que le faltaba (ej. el DTO que le pasa a su método). Por eso el mismo archivo puede aparecer dos veces en el checklist: una vez al crearse (stub) y otra al completarse.

### 0. ¿En qué módulo va? — evaluación previa, antes de listar archivos

- [ ] Decidir si el endpoint va en un **módulo existente** o amerita un **módulo nuevo**, y declararlo en la propuesta con su razón. No asumir el módulo por defecto (precedente típico: endpoints de administración que nacen dentro de `auth` por inercia y terminan extraídos a su propio módulo).
- Criterios de ubicación:
  - **Responsabilidad**: cada módulo tiene su bounded context (ej. `auth` = credenciales, sesiones y ciclo de vida de tokens; `users` = administración de miembros). Un endpoint de negocio nuevo probablemente amerita módulo nuevo.
  - **Entidades que toca**: si opera sobre entidades compartidas del kernel está bien; si necesita entidades de otro contexto, es señal de módulo nuevo (o de extender el kernel si son realmente compartidas).
  - **Ruta honesta**: el path dice *qué* es, no dónde quedó por historia (`/users/:id/role`, no `/auth/users/:id/role`). Si el path correcto no cuadra con el módulo elegido, el módulo está mal.
  - **Dependencias**: un módulo puede consumir exports de otro, nunca crear un ciclo. Si el endpoint requiere que `A` importe de `B` **y** `B` de `A`, falta extraer lo compartido a un kernel o repensar la división.
- [ ] Si el endpoint necesita algo que vive en otro módulo, la ubicación del **código compartido** se decide por tipo (regla "segundo consumidor"):
  - **Entidad/repo/VO compartido** → vive en el kernel compartido (ej. `identity`); consumirlo, no duplicarlo. Si un dato compartido está atrapado en un módulo y aparece el segundo consumidor → se extrae al kernel.
  - **Servicio/use-case de aplicación** → **NO se extrae al kernel**: el módulo dueño lo exporta y el consumidor lo importa (precedente: `users` → `AuthModule` exporta `BcryptService`/`SendInvitation`). El kernel es solo datos de identidad — no es un cajón "common".
  - **Utilidad genérica sin dueño** (ej. storage de archivos) → módulo de infraestructura compartida separado — tampoco `identity`.
  - **Timing**: se extrae cuando existe el segundo consumidor real — nunca preventivamente.
- Si es módulo nuevo, el checklist se repite completo dentro de su carpeta (`module-structure` da el árbol exacto) y el `AppModule` se actualiza al final.

### 1. Controlador — clase + constructor
- [ ] `presentation/controllers/<modulo>.controller.ts` *(crear)* — `@Controller()`, constructor con el service inyectado. El método del endpoint puede quedar sin escribir todavía.

### 2. Service — stub, porque el constructor del controller ya lo necesita
- [ ] `application/services/<modulo>.service.ts` *(crear, vacío o sin el método nuevo todavía)* — se crea aquí, **antes que los DTOs**, porque el constructor referencia el tipo `XService` antes de que el método del controller referencie ningún DTO

### 3. DTOs que el método del controller necesita para tipar `@Body()`/`@Query()`/el retorno
- [ ] `application/dtos/<accion>.dto.ts`
- [ ] `application/dtos/<respuesta>-response.dto.ts` *(si la respuesta es nueva)*

### 4. Controlador — se completa el método del endpoint
- [ ] `presentation/controllers/<modulo>.controller.ts` *(actualizar)* — ahora que existen los DTOs, se escribe la firma completa del método y su cuerpo, que llama a un método del service que aún no existe

### 5. Service — se completa con el método que el controller ya invoca
- [ ] `application/services/<modulo>.service.ts` *(actualizar)* — agrega el método, delega a un use-case que aún no existe

### 6. Use-case — la lógica de negocio del endpoint
- [ ] `application/use-cases/<accion>.use-case.ts`

### 7. Dominio — lo que el use-case necesita para expresar sus reglas
- [ ] `domain/exceptions/<nombre>.exception.ts` *(una por cada excepción que el use-case lanza)*
- [ ] `domain/entities/<entidad>.entity.ts` *(si el use-case opera sobre una entidad nueva)*
- [ ] `domain/value-objects/<vo>.vo.ts` *(si aplica)*
- [ ] `domain/repositories/<entidad>.repository.interface.ts` *(si el use-case necesita persistencia nueva: define la interfaz + token; la implementación viene después)*

### 8. Persistencia — solo si el repositorio requiere tabla/columna nueva
- [ ] `src/infrastructure/database/migrations/<timestamp>-<Descripcion>.ts`
- [ ] `src/infrastructure/database/schemas/<entidad>.schema.ts`
- [ ] **Anti-N+1** — si el endpoint devuelve la entidad con relaciones (roles, perfil, líneas, etc.), el repositorio las carga en un solo query (`leftJoinAndSelect`/`relations`/`In(ids)`) — nunca un `find` por fila (ver skill `listados-paginacion-indices`, sección N+1)

### 9. Infraestructura — implementa lo que el dominio dejó como interfaz
- [ ] `infrastructure/repositories/<entidad>.repository.ts` *(implements IXxxRepository)*
- [ ] `infrastructure/mappers/<entidad>.mapper.ts` *(domain ↔ schema, si el repositorio lo necesita)*
- [ ] `infrastructure/services/<servicio>.service.ts` *(si el use-case depende de un servicio externo nuevo: bcrypt, email, etc.)*

### 10. Mapper de aplicación — obligatorio si el use-case retorna una entidad de dominio y la respuesta es un DTO
- [ ] `application/mappers/<entidad>.mapper.ts` *(domain entity → response DTO; ver skill `strict-layering-rule`: el use-case nunca construye el DTO directamente)*

### 11. Módulo — conecta todas las piezas (siempre el último paso)
- [ ] `<nombre>.module.ts` *(actualizar providers/imports: token del repositorio, use-case, servicios)*

### Doc del contrato (obligatoria, mismo commit)

- [ ] `documentacion/api/<modulo>/NNN-<metodo>-<ruta>.md` *(crear o actualizar — ver skill `api-docs`)* + fila en `documentacion/api/README.md`. Los JSONs se copian de lo que el endpoint **realmente** devuelve (fuente: los e2e), no de lo diseñado.

**Nota:** si el `service`, `use-case`, etc. ya existen (endpoint agregado a un módulo existente), no hay stub que crear — se salta directo al paso de "actualizar". Los pasos de stub (2) y completar (4, 5) solo aplican cuando el archivo es nuevo.

Para las rutas exactas de cada tipo de archivo, ver el skill `module-structure`. Para saber qué archivos necesitan tests unitarios, ver el skill `unit-test-checklist`. Antes de dar por cerrado el checklist en un endpoint que recibe un identificador de recurso, aplicar también el skill `idor-checklist`.
