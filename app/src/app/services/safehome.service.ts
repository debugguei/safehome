import { Injectable, computed, signal } from '@angular/core';
import {
  Dispositivo, Estado, Evento, Leitura, NomeSensor, Saude, SensoresStatus, Status,
} from '../models/safehome.models';

const CHAVE_URL = 'safehome.url';
const CHAVE_DEMO = 'safehome.demo';
const CHAVE_SEL = 'safehome.dispositivo';
const CHAVE_NOTIF = 'safehome.notif';
const URL_PADRAO = 'http://localhost:3000';
const INTERVALO_MS = 3000;
const TIMEOUT_MS = 4000;
const LIMIAR_DEMO = 1500;
const LIMITE_EVENTOS = 50;
const LIMITE_LEITURAS = 60;
const ID_DEMO = 'demo';
const TESTE_MS = 12000;

const ORDEM: Estado[] = ['NORMAL', 'ATENCAO', 'CRITICO'];

export function classificar(valor: number, limite: number): Estado {
  if (valor >= limite) return 'CRITICO';
  if (valor >= limite * 0.8) return 'ATENCAO';
  return 'NORMAL';
}

export function validarUrl(valor: string): string | null {
  const limpa = valor.trim();
  if (!limpa) return 'Informe o endereço do servidor.';
  try {
    const url = new URL(limpa);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'O endereço precisa começar com http:// ou https://.';
    return null;
  } catch {
    return 'Endereço inválido. Exemplo: http://192.168.0.10:3000';
  }
}

// Simulador local: um dispositivo "demo" com um ciclo de 60 s.
class SimuladorDemo {
  private readonly inicio = Date.now();
  private readonly eventos: Evento[] = [];
  private readonly leituras: Leitura[] = [];
  private sequencia = 0;
  private ultimo: Estado | null = null;
  testeAte = 0;

  passo(): { status: Status; eventos: Evento[]; leituras: Leitura[] } {
    const agora = Date.now();
    const emTeste = agora < this.testeAte;
    const t = ((agora - this.inicio) / 1000) % 60;
    const leitura: Record<NomeSensor, number> = { fumaca: 1000, gas_natural: 900, gas_glp: 950 };
    if (!emTeste) {
      if (t >= 20 && t < 35) leitura.fumaca = 1300;
      if (t >= 35 && t < 50) leitura.gas_glp = 1800;
    }

    const sensores = {} as SensoresStatus;
    (Object.keys(leitura) as NomeSensor[]).forEach((n) => {
      const adc = emTeste ? LIMIAR_DEMO : leitura[n];
      sensores[n] = { adc_raw: adc, limiar: LIMIAR_DEMO, estado: classificar(adc, LIMIAR_DEMO) };
    });

    const geral: Estado = emTeste ? 'CRITICO'
      : Object.values(sensores).reduce<Estado>((pior, s) => (ORDEM.indexOf(s.estado) > ORDEM.indexOf(pior) ? s.estado : pior), 'NORMAL');

    this.leituras.unshift({ recebido_em: new Date(agora).toISOString(), simulado: true, fumaca: sensores.fumaca.adc_raw, gas_natural: sensores.gas_natural.adc_raw, gas_glp: sensores.gas_glp.adc_raw });
    if (this.leituras.length > LIMITE_LEITURAS) this.leituras.length = LIMITE_LEITURAS;

    if (geral !== this.ultimo) {
      this.sequencia += 1;
      this.eventos.unshift({ sequencia: this.sequencia, em: new Date(agora).toISOString(), de: this.ultimo, para: geral, simulado: true, sensores });
      this.ultimo = geral;
    }

    const dispositivo: Dispositivo = {
      device_id: ID_DEMO, nome: 'Sensor (demo)', overall_state: geral, conectado: true,
      simulado: true, teste: emTeste, ultima_leitura_em: new Date(agora).toISOString(), sensores,
    };
    return {
      status: {
        overall_state: geral, conectado: true, limiares: { fumaca: LIMIAR_DEMO, gas_natural: LIMIAR_DEMO, gas_glp: LIMIAR_DEMO },
        devices: [dispositivo], simulado: true, ultima_leitura_em: dispositivo.ultima_leitura_em, sensores,
      },
      eventos: this.eventos.slice(0, LIMITE_EVENTOS),
      leituras: this.leituras.slice(0, LIMITE_LEITURAS),
    };
  }
}

@Injectable({ providedIn: 'root' })
export class SafeHomeService {
  readonly url = signal<string>(localStorage.getItem(CHAVE_URL) ?? URL_PADRAO);
  readonly modoDemo = signal<boolean>(localStorage.getItem(CHAVE_DEMO) === '1');
  readonly notificar = signal<boolean>(localStorage.getItem(CHAVE_NOTIF) === '1');
  readonly status = signal<Status | null>(null);
  readonly eventos = signal<Evento[]>([]);
  readonly leituras = signal<Leitura[]>([]);
  readonly saude = signal<Saude | null>(null);
  readonly erro = signal<string | null>(null);
  readonly ultimaAtualizacao = signal<Date | null>(null);
  readonly selecionado = signal<string | null>(localStorage.getItem(CHAVE_SEL));

  readonly dispositivos = computed<Dispositivo[]>(() => this.status()?.devices ?? []);
  readonly dispositivoAtual = computed<Dispositivo | null>(() => {
    const lista = this.dispositivos();
    if (!lista.length) return null;
    return lista.find((d) => d.device_id === this.selecionado()) ?? lista[0];
  });

  private timer: ReturnType<typeof setInterval> | null = null;
  private emAndamento = false;
  private readonly demo = new SimuladorDemo();
  private readonly demoInicio = Date.now();
  private estadosAnteriores = new Map<string, Estado>();

  iniciar(): void {
    if (this.timer !== null) return;
    void this.atualizar();
    this.timer = setInterval(() => void this.atualizar(), INTERVALO_MS);
  }
  parar(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  salvarUrl(valor: string): string | null {
    const erro = validarUrl(valor);
    if (erro) return erro;
    const limpa = valor.trim().replace(/\/+$/, '');
    this.url.set(limpa);
    localStorage.setItem(CHAVE_URL, limpa);
    void this.atualizar();
    return null;
  }
  definirDemo(ligado: boolean): void {
    this.modoDemo.set(ligado);
    localStorage.setItem(CHAVE_DEMO, ligado ? '1' : '0');
    void this.atualizar();
  }
  selecionar(id: string): void {
    this.selecionado.set(id);
    localStorage.setItem(CHAVE_SEL, id);
    void this.atualizar();
  }

  async ativarNotificacoes(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    let permissao = Notification.permission;
    if (permissao === 'default') permissao = await Notification.requestPermission();
    const ok = permissao === 'granted';
    this.notificar.set(ok);
    localStorage.setItem(CHAVE_NOTIF, ok ? '1' : '0');
    return ok;
  }
  desativarNotificacoes(): void {
    this.notificar.set(false);
    localStorage.setItem(CHAVE_NOTIF, '0');
  }

  async testarConexao(endereco: string): Promise<string> {
    const erro = validarUrl(endereco);
    if (erro) throw new Error(erro);
    const base = endereco.trim().replace(/\/+$/, '');
    const saude = await this.get<{ versao: string }>('/api/v1/health', base);
    return saude.versao;
  }

  async testarAlarme(): Promise<void> {
    const id = this.dispositivoAtual()?.device_id;
    if (this.modoDemo()) { this.demo.testeAte = Date.now() + TESTE_MS; await this.atualizar(); return; }
    await this.post('/api/v1/selftest', { device_id: id });
    await this.atualizar();
  }

  async renomear(id: string, nome: string): Promise<void> {
    if (this.modoDemo()) return;
    await this.post('/api/v1/devices', { device_id: id, nome });
    await this.atualizar();
  }

  async atualizar(): Promise<void> {
    if (this.emAndamento) return;
    this.emAndamento = true;
    try {
      if (this.modoDemo()) {
        const { status, eventos, leituras } = this.demo.passo();
        this.aplicar(status, eventos, leituras, {
          status: 'OK', versao: 'demo', uptime_s: Math.floor((Date.now() - this.demoInicio) / 1000),
          leituras_recebidas: leituras.length, idade_ultima_leitura_s: 0, token_obrigatorio: false,
          armazenamento: { gravando: true, erro: null },
        });
        return;
      }
      const alvo = this.selecionado();
      const qs = alvo ? `&device_id=${encodeURIComponent(alvo)}` : '';
      const [status, historico, leituras, saude] = await Promise.all([
        this.get<Status>('/api/v1/status'),
        this.get<{ events: Evento[] }>(`/api/v1/events?limit=${LIMITE_EVENTOS}`),
        this.get<{ readings: Leitura[] }>(`/api/v1/readings?limit=${LIMITE_LEITURAS}${qs}`),
        this.get<Saude>('/api/v1/health'),
      ]);
      this.aplicar(status, historico.events, leituras.readings, saude);
    } catch (err) {
      this.erro.set(err instanceof Error ? err.message : 'Falha desconhecida');
      this.status.set(null);
      this.saude.set(null);
    } finally {
      this.emAndamento = false;
    }
  }

  private aplicar(status: Status, eventos: Evento[], leituras: Leitura[], saude: Saude): void {
    this.detectarCriticos(status.devices);
    this.status.set(status);
    this.eventos.set(eventos);
    this.leituras.set(leituras);
    this.saude.set(saude);
    this.erro.set(null);
    this.ultimaAtualizacao.set(new Date());
    if (this.selecionado() === null && status.devices.length) this.selecionado.set(status.devices[0].device_id);
  }

  // Dispara uma notificação do navegador quando um dispositivo passa a CRÍTICO.
  private detectarCriticos(devices: Dispositivo[]): void {
    for (const d of devices) {
      const anterior = this.estadosAnteriores.get(d.device_id);
      if (this.notificar() && anterior && anterior !== 'CRITICO' && d.overall_state === 'CRITICO') {
        this.notificarCritico(d.nome, d.teste);
      }
      this.estadosAnteriores.set(d.device_id, d.overall_state);
    }
  }
  private notificarCritico(nome: string, teste: boolean): void {
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('SafeHome — Alerta', {
          body: teste ? `${nome}: teste de alarme` : `${nome}: nível de gás acima do limite de segurança`,
          tag: 'safehome-alerta',
        });
      }
    } catch { /* ignora */ }
  }

  private async post(caminho: string, corpo: unknown): Promise<void> {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(this.url() + caminho, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: controle.signal,
      });
      if (!r.ok) throw new Error(`O servidor respondeu com erro ${r.status}.`);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw new Error('O servidor demorou para responder.');
      if (err instanceof Error && err.message.startsWith('O servidor respondeu')) throw err;
      throw new Error('Não foi possível conectar ao servidor.');
    } finally {
      clearTimeout(relogio);
    }
  }

  private async get<T>(caminho: string, base: string = this.url()): Promise<T> {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);
    try {
      const resposta = await fetch(base + caminho, { signal: controle.signal, cache: 'no-store' });
      if (!resposta.ok) throw new Error(`O servidor respondeu com erro ${resposta.status}.`);
      return (await resposta.json()) as T;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw new Error('O servidor demorou para responder.');
      if (err instanceof Error && err.message.startsWith('O servidor respondeu')) throw err;
      throw new Error('Não foi possível conectar ao servidor. Verifique o endereço e a rede.');
    } finally {
      clearTimeout(relogio);
    }
  }
}
