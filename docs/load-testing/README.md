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

> **Pendiente de ejecución.** El plan está listo y validado, pero la corrida
> debe hacerse con la stack levantada y, para que las cifras sean las
> definitivas, **después de mergear T1.5** (índices de base de datos y
> reescritura de `PaymentMonitoringView`). Medir antes daría un p95 que la
> optimización deja obsoleto de inmediato.

Al ejecutarlo, completar:

| Endpoint | Muestras | Media | p95 | p99 | Error % | ¿Cumple NFR? |
|---|---|---|---|---|---|---|
| `GET /api/leads/` | | | | | | |
| `GET /api/payments/monitoring/` | | | | | | |

**Conclusión:** _(se cumple el NFR / no se cumple, y por qué)_

### Qué esperar

`GET /api/payments/monitoring/` es el candidato natural a incumplir el umbral:
su costo crece de forma lineal con el número de bootcampers (ver
`docs/profiling/README.md`). Con los 4 bootcampers del seed el problema no se
manifiesta; para que la prueba sea significativa conviene sembrar un volumen
mayor, en línea con el riesgo R4 de la matriz —degradación con 10.000+
registros—.

Si el p95 supera los 500 ms, el resultado no es un fallo de la prueba sino su
hallazgo: hay que documentarlo junto a la optimización que lo corrige.

## Nota sobre el entorno

Las cifras se toman en entorno local, contra contenedores en la misma máquina
que genera la carga. Sirven para comparar antes y después de una optimización y
para detectar problemas de escalabilidad, pero no son extrapolables al VPS de
producción (2 vCPU y 3,7 GiB compartidos con otra aplicación). Cualquier
conclusión debe indicar el entorno en el que se midió.
