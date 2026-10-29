# Repaso visual

Recorre la app con **datos simulados** y saca capturas de 12 pantallas (coach y
atleta) en móvil (375 px) y escritorio (1280 px). Sirve para revisar un lote de
cambios antes de mergear sin tocar producción ni cuentas reales.

```bash
npm i --no-save playwright && npx playwright install chromium   # solo la primera vez
npm run repaso
```

Deja en `repaso-visual-out/` (gitignoreado) una captura por pantalla y vista y
`informe.json`, con los errores de consola y si hay scroll horizontal. Al acabar
imprime una línea por captura; `OK` significa sin errores de consola y sin scroll
horizontal (si no, `SCROLL ancho>viewport` y/o los errores).

## Cómo funciona

- Hace `vite build` con un Supabase ficticio (`https://mock.supabase.co`).
- Playwright intercepta las llamadas:
  - **Supabase REST**: un mini-PostgREST en memoria con los datos de `fixtures.cjs`
    (filtros `eq/neq/gte/lt/in/is`, `order`, `offset/limit`, upsert, patch y delete).
  - **Auth**: sesión sembrada en `localStorage`; el rol se elige por pantalla.
  - **Netlify Functions**: `coach-athlete-data` se ejecuta **de verdad** (su
    handler) con Strava y Supabase simulados; el resto devuelve respuestas fijas.
- Las fechas de `fixtures.cjs` son relativas a hoy (Madrid): pasadas, hoy y
  futuras, con un doble de carrera, Hyrox, sesiones por distancia, feedback y
  nutrición (plan y lo tomado).

Para añadir una pantalla, añade una entrada a `PANTALLAS` en `repaso.cjs`. Los
pasos posibles son `tab:<nombre>`, `nutricion`, `historial` y `editar`.

Limitaciones: no prueba el envío real a Intervals ni Strava, y el arrastre en la
agenda no se simula.
