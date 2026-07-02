// Re-export del generador único compartido con las Netlify Functions.
// La lógica vive en netlify/functions/lib/intervals-text.js (CommonJS) para que
// el preview del frontend y el envío real usen EXACTAMENTE el mismo generador
// (antes eran dos copias divergentes — F3 de la auditoría 2026-07-02).
//
// El preview debe pasar { incluirNotas: true }; el envío real usa false.
//
// El módulo compartido es CommonJS (.cjs) para que las Netlify Functions puedan
// require()-arlo; Vite lo trata como CJS por la extensión y expone los named.
export { buildIntervalsText } from '../../netlify/functions/lib/intervals-text.cjs'
