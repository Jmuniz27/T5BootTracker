# Profiling del backend

Herramienta: **django-silk**, sólo en desarrollo.

## Por qué silk y no Django Debug Toolbar

El backend es una API DRF: responde JSON, no HTML. La Debug Toolbar funciona
inyectando un panel en una respuesta HTML, algo que aquí no tiene equivalente.
Silk perfila a nivel de middleware —independiente del content type— y guarda
historial consultable en vez de un snapshot por página, que es lo que hace
falta para comparar un antes y un después.

Esta decisión reemplaza la nota operativa anterior que mencionaba Debug Toolbar
y cProfile.

## Cómo activarlo

Silk viene **apagado por defecto**, incluso en desarrollo. La razón es que
`pytest.ini` apunta a `config.settings.local`, así que cargarlo siempre metería
su middleware y sus escrituras en las 286 pruebas de la suite.

```bash
# 1. Levantar el backend con el profiling activo
SILK_ENABLED=True docker compose up -d backend

# 2. Crear sus tablas (sólo la primera vez)
docker compose exec backend python manage.py migrate

# 3. Generar tráfico: usar la aplicación, o
docker compose exec backend python manage.py seed_dev

# 4. Abrir http://localhost:8000/silk/ — pide sesión de usuario staff
```

El dashboard exige autenticación y rol staff (`SILKY_AUTHENTICATION`,
`SILKY_AUTHORISATION`, `SILKY_PERMISSIONS`). No es opcional: silk almacena
cuerpos de requests y respuestas, que aquí incluyen datos personales y tokens.

Para apagarlo, basta con levantar el backend sin la variable.

## Hallazgo PERF-1 — `GET /api/payments/monitoring/`

`PaymentMonitoringView` (`apps/payments/views.py`) recorre cada programa y,
dentro, cada bootcamper, llamando a `PaymentProgressService.get_payment_summary()`
una vez por par bootcamper–programa. Cada una de esas llamadas dispara:

1. `Program.objects.get(id=program_id)` — **el mismo programa, releído en cada
   iteración**, pese a que la vista ya lo tiene en memoria.
2. Un `aggregate(Sum)` sobre los pagos aprobados.
3. Un `count()` sobre los pagos pendientes.

A eso se suma una consulta de bootcampers por programa. El costo crece de forma
lineal con el número de bootcampers: es un N+1 de manual.

### Medición

`tests/test_payments_query_count.py` cuantifica el problema con
`CaptureQueriesContext` en lugar de estimarlo. Para verlo:

```bash
docker compose exec backend pytest tests/test_payments_query_count.py -v -s
```

Los tests imprimen el número de queries con 2 y con 6 bootcampers, y el
incremento por bootcamper. Están escritos para **fallar cuando la optimización
esté hecha**, con un mensaje que indica qué actualizar: así el antes/después
queda registrado en el propio repositorio y no depende de que alguien recuerde
volver a medir.

### Estado

| | Queries | Cómo se obtuvo |
|---|---|---|
| **Antes** | crece ~4 por bootcamper | `pytest tests/test_payments_query_count.py -s` |
| **Después** | *pendiente* | se completa al cerrar T1.5 |

> **Pendiente:** la reescritura de la vista con `values()`/`annotate()` y los
> índices de base de datos son T1.5 del plan de entrega, que todavía no está
> mergeado. Cuando lo esté: correr de nuevo los tests, anotar el número
> resultante en esta tabla y adjuntar una captura del panel de silk para el
> mismo endpoint. El contrato JSON no debe cambiar — lo fijan los tests de
> `tests/test_payments.py`, que no se tocan.

## Frontend y móvil

Fuera del alcance de este documento: React DevTools Profiler + Web Vitals en
web, y el Performance Monitor de React Native en móvil.
