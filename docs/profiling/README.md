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
# 1. SILK_ENABLED=True en el .env (NO alcanza con exportarla en el shell:
#    docker-compose.yml sólo declara `env_file: .env` para backend, sin
#    interpolar variables de entorno del host — verificado en esta sesión,
#    corrigiendo la instrucción anterior de este documento).
echo "SILK_ENABLED=True" >> .env

# 2. Recrear el contenedor para que tome el .env actualizado
#    (`docker compose restart` NO relee env_file; hace falta recrear).
docker compose up -d --force-recreate backend

# 3. Crear sus tablas (sólo la primera vez)
docker compose exec backend python manage.py migrate

# 4. Generar tráfico: usar la aplicación, o
docker compose exec backend python manage.py seed_dev

# 5. Abrir http://localhost:8000/silk/ — pide sesión de usuario staff
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

### Estado — resuelto, medido con silk el 2026-08-11

| | Queries | Tiempo de respuesta | Cómo se obtuvo |
|---|---|---|---|
| **Antes** | crecía ~4 por bootcamper | no medido con silk (ya no reproducible: el fix está mergeado) | `pytest tests/test_payments_query_count.py -s`, corrida original |
| **Después** | **5 queries, constante — no crece con el número de bootcampers** | 73–116 ms (4 muestras reales) | `pytest tests/test_payments_query_count.py -v -s` + panel de silk contra `GET /api/payments/monitoring/` |

La corrida de `test_payments_query_count.py` del 2026-08-11 confirma el fix con datos, no solo con el status del test: **6 queries con 2 bootcampers, 6 queries con 6 bootcampers** (incremento por bootcamper: 0.0), y **1 sola consulta** a `programs_program` para 3 bootcampers (antes se releía el programa en cada iteración). Con silk activo contra la app real (`SILK_ENABLED=True`, endpoint golpeado 4 veces con datos del seed), el número estabilizado en producción de tráfico real es de **5 queries por request**, consistente con el test.

### Hallazgo nuevo — `GET /api/leads/` tiene un N+1 sin resolver

Perfilando con silk el mismo día se encontró un patrón equivalente al que ya se había arreglado en pagos, esta vez en el endpoint de leads: **38 queries por request**, de las cuales **28 son consultas idénticas a `authentication_customuser`** (una por cada combinación de lead × lookup del dueño), contra apenas **12 leads** en el seed. Tiempo de respuesta medido: 430–670 ms en 3 corridas.

`LeadListCreateView._annotated_qs()` (`apps/leads/views.py`) ya usa `select_related('bootcamper', 'bootcamper__verified_by')` — ese `select_related` fue añadido justamente para evitar el mismo problema con el bootcamper convertido — pero **no incluye `'owner'`**, el vendedor asignado al lead, que el serializer sí expone por cada fila. Es el mismo patrón que motivó DB-1/PERF-1 en pagos, sin resolver todavía en leads.

| | Queries | Tiempo de respuesta | Cómo se obtuvo |
|---|---|---|---|
| **Estado actual (2026-08-11)** | 38 por request (12 leads en el seed) | 430–670 ms (3 muestras reales) | Panel de silk contra `GET /api/leads/`, autenticado como admin |
| **Fix propuesto** | agregar `'owner'` a `select_related(...)` en `_annotated_qs()` | — | No implementado en esta sesión — queda como hallazgo para que el equipo lo priorice |

## Frontend y móvil

Fuera del alcance de este documento: React DevTools Profiler + Web Vitals en
web, y el Performance Monitor de React Native en móvil.
