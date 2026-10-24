# Pendiente: Crashlytics / logger de producción en la app

**Estado:** pendiente
**Origen:** propuesta 001-app-bootstrap (app)
**Bloquea deploy a producción:** sí (observabilidad)

## Contexto

`setup_di.dart` registra `DebugLoggerServiceImpl` para `ILoggerService` en
todos los entornos — marcado `// PROVISIONAL`. En release `debugPrint` es
no-op, así que un crash en prod no deja rastro.

## Qué falta

- Integrar Firebase Crashlytics (`firebase_core` + `firebase_crashlytics`) y
  crear `CrashlyticsLoggerServiceImpl`; resolver impl por
  `bool.fromEnvironment('dart.vm.product')` como prevé `promt_solid`.
- Decisión previa: proyecto Firebase de Depredadog + `google-services.json`/
  `GoogleService-Info.plist` (secretos — no commitear).

## Alternativa evaluable

Sentry (`sentry_flutter`) si no se quiere Firebase — misma idea: el impl se
swapea en `setup_di` sin tocar consumers (el puerto ya está).
