# Progreso de la implementación de la auditoría UX

Registro de trabajo de [`AUDITORIA-UX-2026-10-05.md`](AUDITORIA-UX-2026-10-05.md). Sirve para retomar si la sesión se corta.

## Decisiones aplicadas (Diego no estaba disponible: valores «seguros por defecto»)

| ID | Valor aplicado | Qué implica |
|---|---|---|
| D1 | (b) se mantiene «Agendar reunión» | Único verbo para el visitante; el interruptor del dueño pasa a «Recibir propuestas de reunión» |
| D2 | (b) se mantienen las casillas, mejoradas | Fila de ≥ 44 px y error junto al botón |
| D3 | (b) `/login` sigue creando cuenta | Aviso en `/crear` «¿Ya tenías tarjeta con otro email?» + sugerencia de erratas |
| D4 | (a) Google Wallet tras `GOOGLE_WALLET_LIVE` | Apagado por defecto; Android ve «Mi QR» |
| D5 | (b) se mantiene `PUBLISH` + botón de Google Calendar | P8.3 no se implementa |
| D6 | (b) una sola página con índice fijo y aviso de pendientes | No hay pestañas «Tarjeta · Bandeja · Actividad» |
| D7 | (b) sin modo oscuro | — |
| D8 | (a) tema inicial aleatorio y distinto del de quien te refirió | — |

Diego puede cambiar cualquiera: están aisladas en sus PRs.

## Ramas (apiladas: cada una sale de la anterior; fusionar en orden)

| PR | Rama | Estado |
|---|---|---|
| P1 | `feat/ux-p1-arreglos` | ✅ hecho y subido |
| P2 | `feat/ux-p2-mi-qr` | pendiente |
| P3 | `feat/ux-p3-sistema` | pendiente |
| P4 | `feat/ux-p4-crear` | pendiente |
| P5 | `feat/ux-p5-tarjeta` | pendiente |
| P6 | `feat/ux-p6-reuniones` | pendiente |
| P7 | `feat/ux-p7-editor` | pendiente |
| P8 | `feat/ux-p8-…` | pendiente |

## Notas de implementación

- **P1.20 / P2.5**: «Mandarle mi tarjeta a Alex» guarda el contacto con el origen de la visita (`qr`/`share`/`direct`) y un texto fijo, en vez de un origen nuevo `crear` (eso pediría migración del `CHECK`).
- **P1.9**: las páginas demo de reuniones mandan su estado al servidor (`demoState`) para encadenar acciones (confirmar y luego cancelar). Solo en demo; no se guarda nada.

## Notas para retomar

- Antes de cada push: `npm run lint`, `npm run typecheck`, `npm test`, `npm run e2e:demo`.
- No editar `src/` mientras corre `npm run e2e:demo` (el build lee los archivos).
- Los IDs hechos se marcan con ✅ en la auditoría.
