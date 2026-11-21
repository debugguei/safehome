'use strict';

const BASE = process.env.SERVER_URL || 'http://localhost:3000';

const CENARIO = [
  { dura: 20, fumaca: 1000, gas_nat: 900, gas_but: 950 },
  { dura: 15, fumaca: 1300, gas_nat: 900, gas_but: 950 },
  { dura: 15, fumaca: 1000, gas_nat: 900, gas_but: 1800 },
  { dura: 10, fumaca: 1000, gas_nat: 900, gas_but: 950 },
];

const PERIODO_MS = 3000;
const TOKEN = process.env.DEVICE_TOKEN || '';
const DEVICE_ID = process.env.DEVICE_ID || 'esp32-1';

function passoAtual(t) {
  const total = CENARIO.reduce((soma, p) => soma + p.dura, 0);
  let resto = t % total;
  for (const fase of CENARIO) {
    if (resto < fase.dura) return fase;
    resto -= fase.dura;
  }
  return CENARIO[0];
}

async function enviar(leitura) {
  try {
    const r = await fetch(`${BASE}/api/gas?simulado=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(TOKEN ? { 'X-Device-Token': TOKEN } : {}) },
      body: JSON.stringify({ ...leitura, device_id: DEVICE_ID }),
    });
    const texto = await r.text();
    console.log(new Date().toLocaleTimeString(), r.status, texto, JSON.stringify(leitura));
  } catch (e) {
    console.log('Falha ao enviar:', e.message);
  }
}

const inicio = Date.now();
console.log(`Simulador enviando para ${BASE} a cada ${PERIODO_MS / 1000}s (Ctrl+C para parar)`);
setInterval(() => {
  const t = (Date.now() - inicio) / 1000;
  const f = passoAtual(t);
  enviar({ fumaca: f.fumaca, gas_nat: f.gas_nat, gas_but: f.gas_but });
}, PERIODO_MS);
