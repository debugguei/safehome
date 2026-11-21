import { Component, computed, inject } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  IonBadge, IonButton, IonContent, IonHeader, IonIcon, IonRefresher, IonRefresherContent,
  IonSkeletonText, IonTitle, IonToolbar, RefresherCustomEvent,
} from '@ionic/angular/standalone';
import {
  CorIonic, Estado, NomeSensor, ORDEM_SENSORES, SENSORES, infoEstado,
} from '../models/safehome.models';
import { SafeHomeService } from '../services/safehome.service';
import { LogoComponent } from '../shared/logo.component';

const LARGURA_GRAFICO = 320;
const ALTURA_GRAFICO = 120;
const CIRCUNFERENCIA = 2 * Math.PI * 44;
const LIMIAR_PADRAO = 1500;

interface Medidor {
  nome: NomeSensor; adc: number; dash: string; cor: CorIonic;
  rotuloCurto: string; sigla: string; titulo: string;
}
interface Grafico { limiarY: number; linhas: Record<NomeSensor, string>; pontos: number; }

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [
    IonBadge, IonButton, IonContent, IonHeader, IonIcon, IonRefresher, IonRefresherContent,
    IonSkeletonText, IonTitle, IonToolbar, DatePipe, DecimalPipe, RouterLink, LogoComponent,
  ],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <div class="marca" slot="start">
          <app-logo [tamanho]="26"></app-logo>
          <span>SafeHome</span>
        </div>
        <ion-badge slot="end" class="ion-margin-end" [color]="chipCor()">
          <span class="ponto" [class.vivo]="chipRotulo() === 'Ao vivo'"></span>{{ chipRotulo() }}
        </ion-badge>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large" class="sh-grande">Painel</ion-title>
        </ion-toolbar>
      </ion-header>

      <ion-refresher slot="fixed" (ionRefresh)="atualizar($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      @if (status(); as s) {
        <section class="hero sh-card" [class]="'hero-' + info(s.overall_state).cor">
          <ion-icon [name]="info(s.overall_state).icone"></ion-icon>
          <div class="hero-txt">
            <p class="hero-rotulo">Estado geral</p>
            <h1>{{ info(s.overall_state).rotulo }}</h1>
            <p class="hero-desc">{{ info(s.overall_state).descricao }}</p>
          </div>
        </section>

        @if (dispositivos().length > 1) {
          <div class="seletor">
            @for (d of dispositivos(); track d.device_id) {
              <button type="button" class="chip" [class.ativo]="d.device_id === atual()?.device_id" (click)="selecionar(d.device_id)">
                <span class="pt" [style.background]="'var(--ion-color-' + info(d.overall_state).cor + ')'"></span>
                {{ d.nome }}
              </button>
            }
          </div>
        }

        <div class="faixa">
          <div class="faixa-item">
            <span class="faixa-num">{{ amostras() }}</span>
            <span class="faixa-lab">amostras</span>
          </div>
          <div class="faixa-item">
            <span class="faixa-num">{{ recebidas() | number }}</span>
            <span class="faixa-lab">leituras</span>
          </div>
          <div class="faixa-item">
            <span class="faixa-num">{{ uptime() }}</span>
            <span class="faixa-lab">no ar</span>
          </div>
        </div>

        @if (medidores(); as lista) {
          <div class="medidores">
            @for (m of lista; track m.nome) {
              <article class="medidor sh-card" [attr.aria-label]="m.titulo + ': ' + m.rotuloCurto">
                <svg viewBox="0 0 120 120" role="img">
                  <circle class="trilha" cx="60" cy="60" r="44"></circle>
                  <circle class="arco" cx="60" cy="60" r="44"
                          [attr.stroke]="'var(--ion-color-' + m.cor + ')'"
                          [attr.stroke-dasharray]="m.dash"></circle>
                </svg>
                <div class="medidor-centro">
                  <strong>{{ m.adc | number }}</strong>
                  <span>{{ m.sigla }}</span>
                </div>
                <h3>{{ m.titulo }}</h3>
                <ion-badge [color]="m.cor">{{ m.rotuloCurto }}</ion-badge>
              </article>
            }
          </div>
        }

        @if (grafico(); as g) {
          <div class="sh-card cartao">
            <div class="cartao-cab">
              <h2>Tendência</h2>
              <span>{{ g.pontos }} amostras</span>
            </div>
            <svg class="grafico" [attr.viewBox]="'0 0 ' + largura + ' ' + altura" preserveAspectRatio="none"
                 role="img" aria-label="Gráfico das últimas leituras">
              <line class="limiar" x1="0" [attr.x2]="largura" [attr.y1]="g.limiarY" [attr.y2]="g.limiarY"></line>
              @for (nome of nomes; track nome) {
                <polyline [attr.points]="g.linhas[nome]" [attr.stroke]="'var(--ion-color-' + corSensor(nome) + ')'"></polyline>
              }
            </svg>
            <div class="legenda">
              @for (nome of nomes; track nome) {
                <span><i [style.background]="'var(--ion-color-' + corSensor(nome) + ')'"></i>{{ SENSORES[nome].sigla }}</span>
              }
              <span class="limiar-rotulo">limite</span>
            </div>
          </div>
        }

        <p class="rodape">
          Valores em contagens do ADC (0–4095), não em ppm. Limites provisórios, pendentes de calibração.
          @if (s.ultima_leitura_em) { <br>Última leitura {{ s.ultima_leitura_em | date: 'dd/MM HH:mm:ss' }} }
        </p>
      } @else if (erro()) {
        <div class="sh-card erro-box">
          <ion-icon name="cloud-offline-outline"></ion-icon>
          <h2>Servidor indisponível</h2>
          <p>{{ erro() }}</p>
          <ion-button fill="outline" routerLink="/tabs/dispositivo">Verificar conexão</ion-button>
        </div>
      } @else {
        <div class="carregando">
          <ion-skeleton-text animated class="bl-g"></ion-skeleton-text>
          <ion-skeleton-text animated class="bl-m"></ion-skeleton-text>
        </div>
      }
    </ion-content>
  `,
  styles: [`
    .marca { display: flex; align-items: center; gap: 8px; padding-inline-start: 16px; }
    .marca span { font-weight: 800; font-size: 1.02rem; letter-spacing: -0.01em; }
    ion-badge .ponto { display: inline-block; width: 7px; height: 7px; border-radius: 50%;
      background: currentColor; margin-right: 6px; vertical-align: middle; }
    ion-badge .ponto.vivo { animation: pulsar 1.6s ease-in-out infinite; }
    @keyframes pulsar { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }

    .hero { display: flex; align-items: center; gap: 16px; padding: 20px; border: none; color: #fff; }
    .hero ion-icon { font-size: 46px; flex-shrink: 0; }
    .hero h1 { font-size: 1.5rem; font-weight: 800; margin: 2px 0; letter-spacing: -0.01em; }
    .hero-rotulo { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; margin: 0; }
    .hero-desc { font-size: 0.88rem; opacity: 0.94; margin: 0; }
    .hero-success { background: linear-gradient(135deg, var(--ion-color-success), var(--ion-color-success-shade)); }
    .hero-warning { background: linear-gradient(135deg, var(--ion-color-warning), var(--ion-color-warning-shade)); color: #1a1200; }
    .hero-danger  { background: linear-gradient(135deg, var(--ion-color-danger), var(--ion-color-danger-shade)); }
    .hero-medium  { background: linear-gradient(135deg, #6b7384, #4b515e); }

    .seletor { display: flex; gap: 8px; overflow-x: auto; padding: 4px 16px 10px; -webkit-overflow-scrolling: touch; }
    .seletor::-webkit-scrollbar { display: none; }
    .chip { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; flex-shrink: 0;
      border: 1px solid var(--sh-border); background: var(--sh-surface); color: var(--ion-text-color);
      border-radius: 999px; padding: 7px 14px; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
    .chip.ativo { border-color: var(--ion-color-primary); color: var(--ion-color-primary); }
    .chip .pt { width: 8px; height: 8px; border-radius: 50%; }
    .faixa { display: flex; margin: 0 16px 12px; background: var(--sh-surface);
      border: 1px solid var(--sh-border); border-radius: var(--sh-radius-sm); overflow: hidden; }
    .faixa-item { flex: 1; text-align: center; padding: 12px 4px; border-right: 1px solid var(--sh-border); }
    .faixa-item:last-child { border-right: none; }
    .faixa-num { display: block; font-size: 1.15rem; font-weight: 800; font-variant-numeric: tabular-nums; }
    .faixa-lab { font-size: 0.7rem; color: var(--sh-muted); text-transform: uppercase; letter-spacing: 0.05em; }

    .medidores { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 0 16px 12px; }
    .medidores .medidor { margin: 0; }
    .medidor { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px 6px; position: relative; }
    .medidor svg { width: 90px; height: 90px; transform: rotate(-90deg); }
    .medidor .trilha { fill: none; stroke: var(--sh-border); stroke-width: 9; }
    .medidor .arco { fill: none; stroke-width: 9; stroke-linecap: round; transition: stroke-dasharray 0.6s ease; }
    .medidor-centro { position: absolute; top: 14px; left: 0; right: 0; height: 90px;
      display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .medidor-centro strong { font-size: 1rem; font-variant-numeric: tabular-nums; }
    .medidor-centro span { font-size: 0.68rem; color: var(--sh-muted); }
    .medidor h3 { font-size: 0.78rem; font-weight: 600; margin: 2px 0 0; }
    .medidor ion-badge { font-size: 0.62rem; }

    .cartao { padding: 16px; }
    .cartao-cab { display: flex; justify-content: space-between; align-items: baseline; }
    .cartao-cab h2 { font-size: 1rem; font-weight: 700; margin: 0; }
    .cartao-cab span { font-size: 0.74rem; color: var(--sh-muted); }
    .grafico { width: 100%; height: 140px; margin-top: 12px; overflow: visible; }
    .grafico polyline { fill: none; stroke-width: 2.2; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
    .grafico .limiar { stroke: var(--ion-color-danger); stroke-dasharray: 4 4; stroke-width: 1; vector-effect: non-scaling-stroke; opacity: 0.7; }
    .legenda { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 10px; font-size: 0.74rem; color: var(--sh-muted); }
    .legenda span { display: inline-flex; align-items: center; gap: 5px; }
    .legenda i { width: 9px; height: 9px; border-radius: 50%; }
    .limiar-rotulo::before { content: ''; display: inline-block; width: 14px; border-top: 1px dashed var(--ion-color-danger);
      margin-right: 5px; vertical-align: middle; }

    .rodape { padding: 6px 24px 28px; font-size: 0.74rem; color: var(--sh-muted); line-height: 1.5; }
    .erro-box { text-align: center; padding: 36px 24px; }
    .erro-box ion-icon { font-size: 44px; color: var(--sh-muted); }
    .erro-box h2 { font-weight: 700; margin: 8px 0 4px; }
    .erro-box p { color: var(--sh-muted); }
    .carregando { padding: 16px; display: grid; gap: 12px; }
    .bl-g { height: 110px; border-radius: 20px; } .bl-m { height: 220px; border-radius: 16px; }
  `],
})
export class InicioPage {
  readonly safehome = inject(SafeHomeService);
  readonly status = this.safehome.status;
  readonly erro = this.safehome.erro;
  readonly nomes = ORDEM_SENSORES;
  readonly SENSORES = SENSORES;
  readonly dispositivos = this.safehome.dispositivos;
  readonly atual = this.safehome.dispositivoAtual;
  readonly largura = LARGURA_GRAFICO;
  readonly altura = ALTURA_GRAFICO;

  readonly amostras = () => this.safehome.leituras().length;
  readonly recebidas = () => this.safehome.saude()?.leituras_recebidas ?? this.safehome.leituras().length;
  readonly uptime = () => {
    const s = this.safehome.saude()?.uptime_s ?? 0;
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}min`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  };

  readonly medidores = computed<Medidor[] | null>(() => {
    const d = this.safehome.dispositivoAtual();
    if (!d?.sensores) return null;
    return this.nomes.map((nome) => {
      const sensor = d.sensores![nome];
      const info = infoEstado(sensor.estado);
      const pct = Math.min(sensor.adc_raw / sensor.limiar, 1);
      return {
        nome, adc: sensor.adc_raw,
        dash: `${(pct * CIRCUNFERENCIA).toFixed(1)} ${CIRCUNFERENCIA.toFixed(1)}`,
        cor: info.cor, rotuloCurto: info.curto,
        sigla: SENSORES[nome].sigla, titulo: SENSORES[nome].nome,
      };
    });
  });

  readonly grafico = computed<Grafico | null>(() => {
    const leituras = [...this.safehome.leituras()].reverse();
    if (leituras.length < 2) return null;
    const limiar = this.status()?.limiares?.fumaca ?? LIMIAR_PADRAO;
    const maximo = Math.max(...leituras.flatMap((l) => this.nomes.map((n) => l[n])));
    const yMax = Math.max(maximo, limiar * 1.25);
    const passoX = LARGURA_GRAFICO / (leituras.length - 1);
    const linhas = {} as Record<NomeSensor, string>;
    for (const nome of this.nomes) {
      linhas[nome] = leituras
        .map((l, i) => `${(i * passoX).toFixed(1)},${(ALTURA_GRAFICO - (l[nome] / yMax) * ALTURA_GRAFICO).toFixed(1)}`)
        .join(' ');
    }
    return { limiarY: ALTURA_GRAFICO - (limiar / yMax) * ALTURA_GRAFICO, linhas, pontos: leituras.length };
  });

  chipRotulo(): string {
    if (this.safehome.modoDemo()) return 'Simulação';
    if (this.erro()) return 'Offline';
    return this.status()?.conectado ? 'Ao vivo' : 'Sem sinal';
  }
  chipCor(): CorIonic {
    if (this.safehome.modoDemo()) return 'warning';
    if (this.erro()) return 'danger';
    return this.status()?.conectado ? 'success' : 'medium';
  }
  corSensor(nome: NomeSensor): CorIonic {
    const s = this.safehome.dispositivoAtual()?.sensores?.[nome];
    return s ? infoEstado(s.estado).cor : 'medium';
  }
  selecionar(id: string): void { this.safehome.selecionar(id); }
  info(estado: Estado) { return infoEstado(estado ?? 'SEM_CONEXAO'); }

  async atualizar(evento: RefresherCustomEvent): Promise<void> {
    await this.safehome.atualizar();
    evento.target.complete();
  }
}
