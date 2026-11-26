<!-- Movido tal cual desde CLAUDE.md (2026-11-27). Resumen: Potenciómetro, FTP y FC umbral por atleta. Índice: CLAUDE.md. -->

## Potenciómetro por atleta (2026-11-20, migración 021)

- Tabla `atleta_potencia` (PK `athlete_id`): `potenciometro` bool, `ftp_w` (50–700),
  `ftp_fecha`. La editan atleta y coach vinculado (RLS, `actualizado_por`).
  **Migración 021 aplicada 2026-11-20** (aditiva; deshacer: `DROP TABLE public.atleta_potencia;`).
  Sin tabla: todo sigue por pulso. UI: `PotenciaAjustes.jsx` (Sesiones del coach y
  /home del atleta, plegable), `usePotencia`, `potenciaApi.js` (caché 5 min).
- Con interruptor ON: el creador ofrece en bici «Zona potencia» (`zona_potencia`,
  texto `Zn`) y «Potencia % FTP» (`potencia`, ` 95-105%`); la escritura rápida
  convierte Zn → potencia (`zonasAPotencia`); sin objetivo por defecto `Z1`.
  `bikePotencia` pasa por `construirEvento` (send-to-intervals y move-session).
  Sesiones antiguas por `zona`/FC no cambian.
- **FTP también en Intervals.icu**: al guardar un FTP nuevo, `PotenciaAjustes`
  llama a `sync-ftp` (Netlify), que lee el FTP de la BD y hace
  `PUT /api/v1/athlete/{id}/sport-settings/Ride {ftp}` con la key del atleta
  (2026-11-20). Si falla o no hay Intervals, se avisa en la tarjeta (el FTP sí
  queda guardado en la app). Tests: `test/sync-ftp.test.js`.
- **FC umbral** (migración 022, `atleta_potencia.fc_umbral`, 100–220, opcional):
  base del hrTSS. Se edita en la misma tarjeta.
- **Por potencia = interruptor Y FTP** (`bikePotencia` de `lib/potencia`; igual en el creador): con el interruptor pero sin FTP la bici sigue por pulso (sin FTP el reloj no puede pasar las zonas a vatios).
- **Sin potenciómetro** (apagado después de prescribir): los objetivos de
  potencia de bici ya prescritos van al reloj por PULSO con la misma zona
  (`zona_potencia` Zn → `Zn HR`; `% FTP` → su zona de Coggan → `Zn HR`).
- Lectura ÚNICA de estos ajustes en el backend: `lib/potencia.js`
  (`leerAjustes`/`leerPotencia` → `{ potenciometro, ftp, fcUmbral }`), usada por
  send-to-intervals, move-session y las tres de métricas.
- **UI**: `PotenciaAjustes.jsx` («Bici y pulso»): en /home del atleta, tarjeta
  abierta en «Ajustes y conexiones» y con el botón de ajustes (deslizadores) de
  la cabecera, que la pone arriba; en Sesiones del coach, plegable. Interruptor,
  FTP (fecha del test; aviso si > 8 semanas — la fecha solo cambia si cambia el
  FTP) y FC umbral. El creador avisa si hay potenciómetro sin FTP.
- Detalle de actividad: con TSS por potencia enseña también el TSS por pulso
  (para comprobar que cuadran) y la eficiencia aeróbica NP/FC (W/ppm).
- TSS de bici: si la actividad tiene `device_watts` real, NP y el atleta tiene
  interruptor + FTP → TSS = horas × (NP/FTP)² × 100 (`tssPotencia`, `fuente:'potencia'`,
  `tss_por_potencia`); si no, hrTSS. TSS previsto: zonas Coggan (Z1 45…Z5 113 %).
- Assioma Uno = medidor de un pedal (×2): sin balance L/R; hay que calibrar (offset).
- **Pendiente (potenciómetro, desde 2026-11-20)**:
  - Hablar con Jon: test de FTP. Hasta que haya FTP en `atleta_potencia`, el TSS de bici sigue por pulso.
  - Con el FTP: ponerlo en la app («Bici y pulso»); se sube solo a Intervals (comprobar el aviso verde la primera vez).
  - Activar el interruptor del atleta; reenviar con «Guardar y actualizar reloj» las sesiones de bici ya enviadas.
  - Opcional: poner la FC umbral real (test de 30 min o la de Intervals/Garmin); sin ella se usa el 90 % de la FC máx.
  - Calibrar (offset a cero) y emparejar el Assioma Uno con el Garmin; es de un solo pedal (×2, sin balance L/R).
  - Revisar tras las primeras salidas: que `device_watts`/NP lleguen de Strava y que el TSS por potencia y el de pulso (detalle de la actividad) estén cerca; si no, FTP o FC umbral mal puestos.
  - Ideas sin hacer: bienestar de Intervals (sueño/FC reposo/HRV), alerta de molestias al coach.
