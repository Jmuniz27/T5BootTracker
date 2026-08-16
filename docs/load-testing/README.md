# Pruebas de carga

Verifican el requisito no funcional de rendimiento del proyecto:

> **p95 por debajo de 500 ms con 50 usuarios concurrentes.**

Herramienta: **Apache JMeter 5.6.3**. Plan: `boot-tracker-load-test.jmx`.

## Qué ejercita

Un vendedor haciendo su trabajo habitual, que es el perfil de carga real del
sistema:

| Paso | Endpoint | Por qué está |
|---|---|---|
| Login | `POST /api/auth/login/` | Una vez por usuario virtual; el resto del recorrido va autenticado |
| Listado de leads | `GET /api/leads/` | La pantalla más usada. Anota conteos y subconsultas de la última interacción |
| Monitoreo de pagos | `GET /api/payments/monitoring/` | El endpoint más caro del sistema (hallazgo PERF-1) |

50 hilos, rampa de 30 s, 10 iteraciones por hilo (≈1000 peticiones a los
endpoints medidos), con una pausa aleatoria de 0,5–1,5 s entre iteraciones para
no convertir la prueba en un martilleo sin pausas que ningún usuario real
reproduce.

El login queda fuera de la medición del NFR —va en un `Once Only Controller`—
porque el requisito habla del uso sostenido de la aplicación, no del coste de
autenticarse. Aun así se le exige un 200: si falla, el resto del recorrido no
sería representativo.

## Cómo ejecutarlo

Requiere la stack levantada **y la base sembrada** (los tiempos sobre una base
vacía no significan nada):

```bash
# 1. Desde la raíz del repo
docker compose up -d
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py seed_dev

# 2. Ejecutar sin interfaz gráfica y generar el informe HTML
cd docs/load-testing
jmeter -n -t boot-tracker-load-test.jmx \
       -l resultados.jtl \
       -e -o informe-html

# 3. Abrir informe-html/index.html
```

Parámetros ajustables sin tocar el plan:

```bash
jmeter -n -t boot-tracker-load-test.jmx -Jusers=100 -Jrampup=60 -Jloops=20 \
       -Jhost=localhost -Jport=8000 -l resultados.jtl
```

`resultados.jtl` e `informe-html/` no se versionan: son salida de cada corrida.

## Resultados

Ejecutado el **2026-08-15** contra la stack local, con 5.000 leads sembrados y
50 usuarios concurrentes (rampa de 30 s, 10 iteraciones por hilo, 1.050
peticiones en total). **0 % de error.**

| Endpoint | Muestras | Media | p95 | p99 | Error % | ¿Cumple NFR? |
|---|---|---|---|---|---|---|
| `GET /api/leads/` | 500 | 32,9 ms | **51 ms** | 83 ms | 0 % | Sí |
| `GET /api/payments/monitoring/` | 500 | 10,8 ms | **25 ms** | 50 ms | 0 % | Sí |
| `POST /api/auth/login/` (fuera del NFR) | 50 | 139,7 ms | 202,8 ms | 308,9 ms | 0 % | n/a |

**Conclusión:** se cumple el NFR con holgura. El p95 del listado de leads queda
en 51 ms frente al umbral de 500 ms, y el de monitoreo de pagos en 25 ms. El
endpoint que era el candidato natural a incumplir, `monitoring`, resultó el más
rápido de los dos, que es el efecto directo de los arreglos DB-1 (índices) y
PERF-1 (eliminación del N+1).

### Ajustes necesarios para poder ejecutarlo

La primera corrida falló al 100 %. Tres defectos del plan, ya corregidos:

1. La cabecera `Authorization: Bearer ${ACCESS_TOKEN}` estaba en el ámbito del
   grupo de hilos, así que se enviaba también en el login, con la variable sin
   resolver. DRF rechazaba la autenticación con 401 antes de validar
   credenciales. Se movió al ámbito de los dos samplers medidos.
2. El plan entraba como `vendedor1` (SALESPERSON), rol que no tiene acceso a
   `/api/payments/monitoring/` (`IsFinanceOrAdmin`) y recibía 403. Se cambió a
   `finanzas1`, que ejercita ambos endpoints.
3. El throttle de autenticación (`auth`, 5/min) devolvía 429 a 45 de los 50
   hilos. Para la medición se elevó `AUTH_THROTTLE_RATE`, ya que el NFR mide el
   uso sostenido de la aplicación y no el coste de autenticarse, que el plan
   deja fuera con un `Once Only Controller`. El valor por defecto no se
   modificó en el repositorio.
