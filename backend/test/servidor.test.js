'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORTA = 3900 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORTA}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'safehome-'));
let processo;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(caminho, opcoes) {
  const r = await fetch(BASE + caminho, opcoes);
  return { status: r.status, corpo: await r.json() };
}
function enviar(leitura, { simulado = false, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['X-Device-Token'] = token;
  return fetch(`${BASE}/api/gas${simulado ? '?simulado=1' : ''}`, {
    method: 'POST', headers, body: typeof leitura === 'string' ? leitura : JSON.stringify(leitura),
  });
}

before(async () => {
  processo = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORTA), DATA_DIR, OFFLINE_MS: '1500', TESTE_MS: '1000' }, stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(`${BASE}/api/v1/health`); return; } catch (_) { await esperar(100); }
  }
  throw new Error('servidor não subiu');
});
after(() => { processo.kill(); fs.rmSync(DATA_DIR, { recursive: true, force: true }); });

test('health responde OK com versão e contagem de dispositivos', async () => {
  const { status, corpo } = await json('/api/v1/health');
  assert.equal(status, 200);
  assert.equal(corpo.status, 'OK');
  assert.equal(corpo.versao, '1.2.0');
  assert.equal(typeof corpo.dispositivos, 'number');
});

test('leitura válida vira NORMAL e aparece em devices[]', async () => {
  const r = await enviar({ fumaca: 1000, gas_nat: 900, gas_but: 950, device_id: 'esp32-1' });
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'lido');
  const { corpo } = await json('/api/v1/status');
  assert.equal(corpo.overall_state, 'NORMAL');
  const d = corpo.devices.find((x) => x.device_id === 'esp32-1');
  assert.ok(d && d.sensores.fumaca.adc_raw === 1000);
});

test('leitura acima do limite vira CRITICO e gera evento com device_id', async () => {
  await enviar({ fumaca: 1800, gas_nat: 900, gas_but: 950, device_id: 'esp32-1' });
  const { corpo } = await json('/api/v1/status');
  assert.equal(corpo.overall_state, 'CRITICO');
  const ev = await json('/api/v1/events?limit=1');
  assert.equal(ev.corpo.events[0].para, 'CRITICO');
  assert.equal(ev.corpo.events[0].device_id, 'esp32-1');
});

test('segundo dispositivo é independente e o agregado é o pior', async () => {
  await enviar({ fumaca: 1000, gas_nat: 900, gas_but: 950, device_id: 'cozinha' });
  const { corpo } = await json('/api/v1/status');
  assert.equal(corpo.devices.length >= 2, true);
  // esp32-1 ainda CRITICO do teste anterior -> agregado CRITICO
  assert.equal(corpo.overall_state, 'CRITICO');
  const cozinha = corpo.devices.find((d) => d.device_id === 'cozinha');
  assert.equal(cozinha.overall_state, 'NORMAL');
});

test('eventos filtram por device_id', async () => {
  const { corpo } = await json('/api/v1/events?limit=200&device_id=cozinha');
  assert.ok(corpo.events.every((e) => e.device_id === 'cozinha'));
});

test('readings retorna histórico do dispositivo pedido, mais novo primeiro', async () => {
  const { status, corpo } = await json('/api/v1/readings?limit=5&device_id=esp32-1');
  assert.equal(status, 200);
  assert.equal(corpo.device_id, 'esp32-1');
  const t = corpo.readings.map((l) => Date.parse(l.recebido_em));
  assert.deepEqual(t, [...t].sort((a, b) => b - a));
});

test('autoteste força CRITICO temporário e depois volta', async () => {
  await enviar({ fumaca: 100, gas_nat: 100, gas_but: 100, device_id: 'cozinha' });
  let s = await json('/api/v1/status');
  assert.equal(s.corpo.devices.find((d) => d.device_id === 'cozinha').overall_state, 'NORMAL');
  const t = await json('/api/v1/selftest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: 'cozinha' }) });
  assert.equal(t.corpo.status, 'TESTE_INICIADO');
  s = await json('/api/v1/status');
  const d = s.corpo.devices.find((x) => x.device_id === 'cozinha');
  assert.equal(d.overall_state, 'CRITICO');
  assert.equal(d.teste, true);
  await esperar(1300); // TESTE_MS=1000
  s = await json('/api/v1/status');
  assert.equal(s.corpo.devices.find((x) => x.device_id === 'cozinha').overall_state, 'NORMAL');
});

test('renomear dispositivo persiste o nome em devices[]', async () => {
  const r = await json('/api/v1/devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: 'cozinha', nome: 'Cozinha' }) });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.nome, 'Cozinha');
  const s = await json('/api/v1/status');
  assert.equal(s.corpo.devices.find((d) => d.device_id === 'cozinha').nome, 'Cozinha');
});

test('renomear rejeita nome vazio e device_id inválido', async () => {
  assert.equal((await json('/api/v1/devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: 'x', nome: '' }) })).status, 400);
  assert.equal((await json('/api/v1/devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: 'a b', nome: 'ok' }) })).status, 400);
});

test('valores inválidos e device_id inválido são rejeitados com 400', async () => {
  for (const ruim of [{ fumaca: 1000 }, { fumaca: -1, gas_nat: 1, gas_but: 1 }, { fumaca: 9999, gas_nat: 1, gas_but: 1 }, { fumaca: 1, gas_nat: 1, gas_but: 1, device_id: 'id invalido!' }, '{nao json']) {
    assert.equal((await enviar(ruim)).status, 400, JSON.stringify(ruim));
  }
});

test('corpo acima de 1 KB -> 413; limit inválido -> 400', async () => {
  assert.equal((await enviar('x'.repeat(2000))).status, 413);
  assert.equal((await json('/api/v1/events?limit=0')).status, 400);
  assert.equal((await json('/api/v1/readings?limit=99999')).status, 400);
});

test('sem leitura por OFFLINE_MS vira SEM_CONEXAO', async () => {
  await enviar({ fumaca: 50, gas_nat: 50, gas_but: 50, device_id: 'temp' });
  await esperar(1800);
  const { corpo } = await json('/api/v1/status');
  assert.equal(corpo.devices.find((d) => d.device_id === 'temp').overall_state, 'SEM_CONEXAO');
});

test('rota desconhecida 404; método errado 405', async () => {
  assert.equal((await json('/nada')).status, 404);
  assert.equal((await fetch(`${BASE}/api/v1/status`, { method: 'DELETE' })).status, 405);
});
