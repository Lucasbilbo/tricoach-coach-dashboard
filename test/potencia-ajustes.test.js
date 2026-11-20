import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ftpValido, fcUmbralValida, fcUmbralPorDefecto, fechaFtpNueva, ftpAntiguo } from '../src/lib/potencia.js'

test('validación de FTP y FC umbral (vacío = null, fuera de rango = undefined)', () => {
  assert.equal(ftpValido(''), null)
  assert.equal(ftpValido('230'), 230)
  assert.equal(ftpValido('20'), undefined)
  assert.equal(fcUmbralValida(''), null)
  assert.equal(fcUmbralValida('168'), 168)
  assert.equal(fcUmbralValida('90'), undefined)
  assert.equal(fcUmbralPorDefecto(190), 171)
  assert.equal(fcUmbralPorDefecto(null), null)
})

test('la fecha del FTP solo cambia si cambia el FTP', () => {
  const previo = { ftp_w: 230, ftp_fecha: '2026-09-01' }
  assert.equal(fechaFtpNueva(previo, 230, '2026-11-20'), '2026-09-01') // solo se tocó el interruptor
  assert.equal(fechaFtpNueva(previo, 240, '2026-11-20'), '2026-11-20') // FTP nuevo
  assert.equal(fechaFtpNueva(previo, null, '2026-11-20'), null) // sin FTP
  assert.equal(fechaFtpNueva({}, 230, '2026-11-20'), '2026-11-20')
})

test('FTP con más de 8 semanas avisa', () => {
  assert.equal(ftpAntiguo('2026-09-20', '2026-11-20'), true)
  assert.equal(ftpAntiguo('2026-10-20', '2026-11-20'), false)
  assert.equal(ftpAntiguo(null), false)
})
