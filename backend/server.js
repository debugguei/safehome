'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSAO = '1.2.0';
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ARQ_LEITURAS = path.join(DATA_DIR, 'leituras.ndjson');
const ARQ_EVENTOS = path.join(DATA_DIR, 'eventos.ndjson');
const ARQ_NOMES = path.join(DATA_DIR, 'nomes.json');
const DEVICE_TOKEN = process.env.DEVICE_TOKEN || '';

const LIMIARES = {
  fumaca: Number(process.env.LIMIAR_FUMACA) || 1500,
  gas_natural: Number(process.env.LIMIAR_GAS_NAT) || 1500,
  gas_glp: Number(process.env.LIMIAR_GAS_BUT) || 1500,
};
const FRACAO_ATENCAO = 0.8;
const OFFLINE_MS = Number(process.env.OFFLINE_MS) || 15000;
const TESTE_MS = Number(process.env.TESTE_MS) || 12000;
const CHECAGEM_MS = 3000;
const MAX_EVENTOS = 200;
const MAX_LEITURAS = 500;
const ADC_MAX = 4095;
const MAX_CORPO_BYTES = 1024;
const MAX_ARQUIVO_BYTES = 5 * 1024 * 1024;
const ID_PADRAO = 'esp32-1';
const INICIO = Date.now();

const ORDEM = { NORMAL: 0, ATENCAO: 1, CRITICO: 2 };
const CAMPOS_ENTRADA = { fumaca: 'fumaca', gas_natural: 'gas_nat', gas_glp: 'gas_but' };
const SENSORES = Object.keys(CAMPOS_ENTRADA);

/** id -> { ultimaLeitura, ultimoEstado, leituras:[], teste:{ate}|null } */
const dispositivos = new Map();
let eventos = [];
let sequencia = 0;
let nomes = {};
let leiturasRecebidas = 0;
const armazenamento = { gravando: true, erro: null };

class CorpoGrande extends Error {}

function log(nivel, mensagem, extra) {
  const linha = { em: new Date().toISOString(), nivel, mensagem, ...(extra || {}) };
  (nivel === 'erro' ? console.error : console.log)(JSON.stringify(linha));
}

function idValido(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(id);
}

function disp(id) {
  let d = dispositivos.get(id);
  if (!d) {
    d = { ultimaLeitura: null, ultimoEstado: null, leituras: [], teste: null };
    dispositivos.set(id, d);
  }
  return d;
}

function nomeDe(id) {
  return nomes[id] || `Sensor ${id}`;
}

function lerUltimasLinhas(arquivo, n) {
  if (!fs.existsSync(arquivo)) return [];
  const tamanho = fs.statSync(arquivo).size;
  if (tamanho === 0) return [];
  const bloco = Math.min(tamanho, n * 1024 + 8192);
  const buffer = Buffer.alloc(bloco);
  const fd = fs.openSync(arquivo, 'r');
  try { fs.readSync(fd, buffer, 0, bloco, tamanho - bloco); } finally { fs.closeSync(fd); }
  const linhas = buffer.toString('utf8').split('\n').filter(Boolean);
  if (bloco < tamanho) linhas.shift();
  const objetos = [];
  for (const linha of linhas.slice(-n)) {
    try { objetos.push(JSON.parse(linha)); } catch (_) { /* ignora linha corrompida */ }
  }
  return objetos;
}

function anexar(arquivo, objeto) {
  try {
    if (fs.existsSync(arquivo) && fs.statSync(arquivo).size > MAX_ARQUIVO_BYTES) {
      fs.renameSync(arquivo, arquivo.replace(/\.ndjson$/, `-${Date.now()}.ndjson`));
    }
    fs.appendFileSync(arquivo, JSON.stringify(objeto) + '\n');
    if (!armazenamento.gravando) log('info', 'gravação restabelecida');
    armazenamento.gravando = true; armazenamento.erro = null;
  } catch (err) {
    armazenamento.gravando = false; armazenamento.erro = err.message;
    log('erro', 'falha ao gravar', { arquivo: path.basename(arquivo), erro: err.message });
  }
}

function salvarNomes() {
  try { fs.writeFileSync(ARQ_NOMES, JSON.stringify(nomes)); }
  catch (err) { log('erro', 'falha ao salvar nomes', { erro: err.message }); }
}

function restaurar() {
  try { if (fs.existsSync(ARQ_NOMES)) nomes = JSON.parse(fs.readFileSync(ARQ_NOMES, 'utf8')) || {}; }
  catch (_) { nomes = {}; }

  for (const leitura of lerUltimasLinhas(ARQ_LEITURAS, MAX_LEITURAS * 4)) {
    const id = leitura.device_id || ID_PADRAO;
    const d = disp(id);
    d.leituras.push(leitura);
    if (d.leituras.length > MAX_LEITURAS) d.leituras.shift();
    d.ultimaLeitura = leitura;
  }
  eventos = lerUltimasLinhas(ARQ_EVENTOS, MAX_EVENTOS);
  if (eventos.length) {
    sequencia = eventos[eventos.length - 1].sequencia;
    for (const ev of eventos) disp(ev.device_id || ID_PADRAO).ultimoEstado = ev.para;
  }
  log('info', 'estado restaurado', { dispositivos: dispositivos.size, eventos: eventos.length });
}

function classificar(valor, limite) {
  if (valor >= limite) return 'CRITICO';
  if (valor >= limite * FRACAO_ATENCAO) return 'ATENCAO';
  return 'NORMAL';
}

function detalhar(leitura) {
  if (!leitura) return null;
  const saida = {};
  for (const sensor of SENSORES) {
    const adc = leitura[sensor];
    saida[sensor] = { adc_raw: adc, limiar: LIMIARES[sensor], estado: classificar(adc, LIMIARES[sensor]) };
  }
  return saida;
}

function sensoresTeste() {
  const s = {};
  for (const sensor of SENSORES) s[sensor] = { adc_raw: LIMIARES[sensor], limiar: LIMIARES[sensor], estado: 'CRITICO' };
  return s;
}

function testeAtivo(d, agora) {
  return d.teste && agora < d.teste.ate;
}

/** Estado e detalhes de um dispositivo. */
function estadoDisp(d, agora) {
  if (testeAtivo(d, agora)) {
    return { overall: 'CRITICO', sensores: sensoresTeste(), conectado: true, simulado: false, teste: true, ultima_leitura_em: new Date(agora).toISOString() };
  }
  const leitura = d.ultimaLeitura;
  if (!leitura || agora - Date.parse(leitura.recebido_em) > OFFLINE_MS) {
    return { overall: 'SEM_CONEXAO', sensores: detalhar(leitura), conectado: false, simulado: Boolean(leitura && leitura.simulado), teste: false, ultima_leitura_em: leitura ? leitura.recebido_em : null };
  }
  const sensores = detalhar(leitura);
  const overall = Object.values(sensores).reduce((pior, s) => (ORDEM[s.estado] > ORDEM[pior] ? s.estado : pior), 'NORMAL');
  return { overall, sensores, conectado: true, simulado: Boolean(leitura.simulado), teste: false, ultima_leitura_em: leitura.recebido_em };
}

function registrarEvento(id, de, para, info, agora) {
  sequencia += 1;
  const evento = {
    sequencia, em: new Date(agora).toISOString(), de, para,
    device_id: id, nome: nomeDe(id), simulado: info.simulado, teste: info.teste, sensores: info.sensores,
  };
  eventos.push(evento);
  if (eventos.length > MAX_EVENTOS) eventos.shift();
  anexar(ARQ_EVENTOS, evento);
  log('info', 'mudança de estado', { device_id: id, de, para, sequencia });
}

function atualizarDisp(id, agora = Date.now()) {
  const d = disp(id);
  const info = estadoDisp(d, agora);
  if (info.overall !== d.ultimoEstado) {
    const anterior = d.ultimoEstado;
    d.ultimoEstado = info.overall;
    registrarEvento(id, anterior, info.overall, info, agora);
  }
  return info;
}

function atualizarTodos(agora = Date.now()) {
  for (const id of dispositivos.keys()) atualizarDisp(id, agora);
}

function estadoAgregado(agora) {
  const infos = [...dispositivos.keys()].map((id) => ({ id, ...estadoDisp(disp(id), agora) }));
  let overall = 'SEM_CONEXAO';
  if (infos.some((i) => i.overall === 'CRITICO')) overall = 'CRITICO';
  else if (infos.some((i) => i.overall === 'ATENCAO')) overall = 'ATENCAO';
  else if (infos.some((i) => i.overall === 'NORMAL')) overall = 'NORMAL';
  return { overall, infos };
}

function validarLeitura(corpo) {
  let dados;
  try { dados = JSON.parse(corpo); } catch (_) { throw new Error('JSON inválido'); }
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw new Error('corpo deve ser objeto');
  const valores = {};
  for (const [sensor, campo] of Object.entries(CAMPOS_ENTRADA)) {
    const valor = dados[campo];
    if (!Number.isInteger(valor) || valor < 0 || valor > ADC_MAX) throw new Error(`campo inválido: ${campo}`);
    valores[sensor] = valor;
  }
  let id = dados.device_id;
  if (id === undefined) id = ID_PADRAO;
  else if (!idValido(id)) throw new Error('device_id inválido');
  return { id, valores };
}

function receberLeitura(corpo, simulado, idQuery) {
  const { id: idCorpo, valores } = validarLeitura(corpo);
  const id = idQuery && idValido(idQuery) ? idQuery : idCorpo;
  const leitura = { recebido_em: new Date().toISOString(), device_id: id, simulado, ...valores };
  const d = disp(id);
  d.ultimaLeitura = leitura;
  d.leituras.push(leitura);
  if (d.leituras.length > MAX_LEITURAS) d.leituras.shift();
  leiturasRecebidas += 1;
  anexar(ARQ_LEITURAS, leitura);
  atualizarDisp(id);
}

function autorizado(req) {
  if (!DEVICE_TOKEN) return true;
  const enviado = Buffer.from(String(req.headers['x-device-token'] || ''));
  const esperado = Buffer.from(DEVICE_TOKEN);
  return enviado.length === esperado.length && crypto.timingSafeEqual(enviado, esperado);
}

function lerCorpo(req, limite) {
  return new Promise((resolve, reject) => {
    const pedacos = []; let tamanho = 0;
    req.on('data', (p) => { tamanho += p.length; if (tamanho > limite) { reject(new CorpoGrande()); req.resume(); return; } pedacos.push(p); });
    req.on('end', () => resolve(Buffer.concat(pedacos).toString('utf8')));
    req.on('error', reject);
  });
}

function enviarJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function enviarTexto(res, status, txt) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(txt);
}
function erro(res, status, codigo, mensagem) {
  enviarJson(res, status, { schema_version: 1, error: { code: codigo, message: mensagem } });
}
function inteiro(bruto, padrao, min, max) {
  if (bruto === null) return padrao;
  const n = Number(bruto);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function responderStatus(res) {
  atualizarTodos();
  const agora = Date.now();
  const { overall, infos } = estadoAgregado(agora);
  const devices = infos.map((i) => ({
    device_id: i.id, nome: nomeDe(i.id), overall_state: i.overall, conectado: i.conectado,
    simulado: i.simulado, teste: i.teste, ultima_leitura_em: i.ultima_leitura_em, sensores: i.sensores,
  }));
  const primario = devices.find((d) => d.device_id === ID_PADRAO) || devices[0] || null;
  enviarJson(res, 200, {
    schema_version: 2,
    overall_state: overall,
    conectado: devices.some((d) => d.conectado),
    limiares: LIMIARES,
    devices,
    // compatibilidade: espelha o dispositivo primário no topo
    sensores: primario ? primario.sensores : null,
    simulado: primario ? primario.simulado : false,
    ultima_leitura_em: primario ? primario.ultima_leitura_em : null,
  });
}

function responderEventos(res, url) {
  atualizarTodos();
  const limite = inteiro(url.searchParams.get('limit'), 50, 1, MAX_EVENTOS);
  if (limite === null) return erro(res, 400, 'INVALID_PARAMETER', `limit deve estar entre 1 e ${MAX_EVENTOS}`);
  const idFiltro = url.searchParams.get('device_id');
  let lista = eventos;
  if (idFiltro !== null) {
    if (!idValido(idFiltro)) return erro(res, 400, 'INVALID_PARAMETER', 'device_id inválido');
    lista = eventos.filter((e) => (e.device_id || ID_PADRAO) === idFiltro);
  }
  enviarJson(res, 200, { schema_version: 2, capacity: MAX_EVENTOS, last_sequence: sequencia, events: lista.slice(-limite).reverse() });
}

function responderLeituras(res, url) {
  const limite = inteiro(url.searchParams.get('limit'), 60, 1, MAX_LEITURAS);
  if (limite === null) return erro(res, 400, 'INVALID_PARAMETER', `limit deve estar entre 1 e ${MAX_LEITURAS}`);
  const idFiltro = url.searchParams.get('device_id');
  let id = idFiltro;
  if (idFiltro !== null && !idValido(idFiltro)) return erro(res, 400, 'INVALID_PARAMETER', 'device_id inválido');
  if (id === null) id = dispositivos.has(ID_PADRAO) ? ID_PADRAO : [...dispositivos.keys()][0];
  const d = id ? dispositivos.get(id) : null;
  enviarJson(res, 200, {
    schema_version: 2, device_id: id || null, capacity: MAX_LEITURAS,
    readings: d ? d.leituras.slice(-limite).reverse() : [],
  });
}

function responderHealth(res) {
  enviarJson(res, 200, {
    schema_version: 2, status: armazenamento.gravando ? 'OK' : 'DEGRADADO', versao: VERSAO,
    uptime_s: Math.floor((Date.now() - INICIO) / 1000), armazenamento,
    leituras_recebidas: leiturasRecebidas, dispositivos: dispositivos.size, token_obrigatorio: Boolean(DEVICE_TOKEN),
  });
}

function responderSelftest(res, corpo) {
  let id = ID_PADRAO;
  if (corpo.trim()) {
    try {
      const d = JSON.parse(corpo);
      if (d.device_id !== undefined) { if (!idValido(d.device_id)) return erro(res, 400, 'INVALID_PARAMETER', 'device_id inválido'); id = d.device_id; }
    } catch (_) { return erro(res, 400, 'INVALID_PARAMETER', 'JSON inválido'); }
  }
  const agora = Date.now();
  disp(id).teste = { ate: agora + TESTE_MS };
  atualizarDisp(id, agora);
  log('info', 'autoteste disparado', { device_id: id, ate_ms: TESTE_MS });
  enviarJson(res, 200, { schema_version: 2, status: 'TESTE_INICIADO', device_id: id, dura_ms: TESTE_MS });
}

function responderRenomear(res, corpo) {
  let d;
  try { d = JSON.parse(corpo); } catch (_) { return erro(res, 400, 'INVALID_PARAMETER', 'JSON inválido'); }
  if (!idValido(d.device_id)) return erro(res, 400, 'INVALID_PARAMETER', 'device_id inválido');
  const nome = typeof d.nome === 'string' ? d.nome.trim() : '';
  if (!nome || nome.length > 40) return erro(res, 400, 'INVALID_PARAMETER', 'nome deve ter de 1 a 40 caracteres');
  nomes[d.device_id] = nome;
  salvarNomes();
  enviarJson(res, 200, { schema_version: 2, device_id: d.device_id, nome });
}

function tratar(req, res) {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Device-Token');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'POST' && url.pathname === '/api/gas') {
    if (!autorizado(req)) return enviarTexto(res, 401, 'nao autorizado');
    lerCorpo(req, MAX_CORPO_BYTES)
      .then((corpo) => { receberLeitura(corpo, url.searchParams.get('simulado') === '1', url.searchParams.get('id')); enviarTexto(res, 200, 'lido'); })
      .catch((err) => { if (err instanceof CorpoGrande) return enviarTexto(res, 413, 'muito grande'); log('aviso', 'leitura rejeitada', { motivo: err.message }); enviarTexto(res, 400, 'invalido'); });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/selftest') {
    lerCorpo(req, MAX_CORPO_BYTES).then((c) => responderSelftest(res, c)).catch(() => erro(res, 400, 'INVALID_PARAMETER', 'corpo inválido'));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/devices') {
    lerCorpo(req, MAX_CORPO_BYTES).then((c) => responderRenomear(res, c)).catch(() => erro(res, 400, 'INVALID_PARAMETER', 'corpo inválido'));
    return;
  }

  if (req.method !== 'GET') { res.setHeader('Allow', 'GET, POST, OPTIONS'); return erro(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido'); }

  try {
    if (url.pathname === '/api/v1/status') return responderStatus(res);
    if (url.pathname === '/api/v1/events') return responderEventos(res, url);
    if (url.pathname === '/api/v1/readings') return responderLeituras(res, url);
    if (url.pathname === '/api/v1/health') return responderHealth(res);
  } catch (err) {
    log('erro', 'falha na resposta', { rota: url.pathname, erro: err.message });
    return erro(res, 500, 'INTERNAL', 'Erro interno');
  }
  return erro(res, 404, 'NOT_FOUND', 'Rota inexistente');
}

const servidor = http.createServer(tratar);
servidor.requestTimeout = 10000;
servidor.headersTimeout = 10000;
servidor.keepAliveTimeout = 5000;

if (require.main === module) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  restaurar();
  setInterval(() => { try { atualizarTodos(); } catch (err) { log('erro', 'checagem', { erro: err.message }); } }, CHECAGEM_MS).unref();
  servidor.listen(PORT, () => log('info', 'servidor no ar', { versao: VERSAO, porta: PORT, dados: DATA_DIR, token: Boolean(DEVICE_TOKEN) }));
  const encerrar = (s) => { log('info', 'encerrando', { sinal: s }); servidor.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on('SIGINT', () => encerrar('SIGINT'));
  process.on('SIGTERM', () => encerrar('SIGTERM'));
  process.on('unhandledRejection', (err) => log('erro', 'promessa rejeitada', { erro: String(err) }));
}

module.exports = { servidor, classificar, validarLeitura, LIMIARES };
