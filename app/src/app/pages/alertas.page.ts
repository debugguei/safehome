import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  IonBadge, IonButton, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonNote,
  IonRefresher, IonRefresherContent, IonTitle, IonToolbar, RefresherCustomEvent, ToastController,
} from '@ionic/angular/standalone';
import { Estado, infoEstado } from '../models/safehome.models';
import { SafeHomeService } from '../services/safehome.service';

@Component({
  selector: 'app-alertas',
  standalone: true,
  imports: [
    IonBadge, IonButton, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonNote,
    IonRefresher, IonRefresherContent, IonTitle, IonToolbar, DatePipe,
  ],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar><ion-title>Alertas</ion-title></ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-header collapse="condense">
        <ion-toolbar><ion-title size="large" class="sh-grande">Alertas</ion-title></ion-toolbar>
      </ion-header>

      <ion-refresher slot="fixed" (ionRefresh)="atualizar($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <div class="sh-card destaque" [class]="'d-' + info(estadoAtual()).cor">
        <div class="d-top">
          <ion-icon [name]="info(estadoAtual()).icone"></ion-icon>
          <h2>{{ info(estadoAtual()).rotulo }}</h2>
        </div>
        @switch (estadoAtual()) {
          @case ('CRITICO') {
            <p>Um ou mais sensores estão acima do limite de segurança.</p>
            <ul>
              <li>Afaste-se do local com segurança.</li>
              <li>Não acione interruptores, chamas ou aparelhos elétricos.</li>
              <li>Em caso de emergência, acione os bombeiros.</li>
            </ul>
            <ion-button expand="block" color="light" href="tel:193">Ligar para os bombeiros (193)</ion-button>
          }
          @case ('ATENCAO') { <p>Uma leitura está próxima do limite configurado. Verifique o ambiente.</p> }
          @case ('SEM_CONEXAO') { <p>O app não recebe dados do dispositivo. O alarme local do ESP32 continua funcionando.</p> }
          @default { <p>Ambiente normal. Nenhum alerta ativo no momento.</p> }
        }
      </div>

      <div class="acao-teste">
        <ion-button expand="block" fill="outline" [disabled]="testando()" (click)="testar()">
          @if (testando()) { Testando alarme… } @else { Testar alarme }
        </ion-button>
        <p class="ajuda-teste">Dispara um alerta de teste no dispositivo selecionado, por alguns segundos.</p>
      </div>

      <p class="sh-secao">Ocorrências recentes</p>
      @if (ocorrencias().length) {
        <ion-list class="sh-lista">
          @for (e of ocorrencias(); track e.sequencia) {
            <ion-item lines="full">
              <div class="pino" slot="start" [style.background]="'var(--ion-color-' + info(e.para).cor + ')'">
                <ion-icon [name]="info(e.para).icone"></ion-icon>
              </div>
              <ion-label>
                <h2>{{ info(e.para).rotulo }}</h2>
                <p>{{ e.em | date: 'dd/MM/yyyy HH:mm:ss' }}</p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      } @else {
        <p class="vazio"><ion-note>Nenhuma ocorrência registrada.</ion-note></p>
      }
    </ion-content>
  `,
  styles: [`
    .destaque { padding: 20px; border: none; color: #fff; }
    .destaque .d-top { display: flex; align-items: center; gap: 10px; }
    .destaque .d-top ion-icon { font-size: 28px; }
    .destaque h2 { font-size: 1.2rem; font-weight: 800; margin: 0; }
    .destaque p { margin: 10px 0 0; opacity: 0.95; }
    .destaque ul { padding-left: 20px; margin: 10px 0 16px; opacity: 0.95; }
    .destaque ul li { margin: 3px 0; }
    .d-success { background: linear-gradient(135deg, var(--ion-color-success), var(--ion-color-success-shade)); }
    .d-warning { background: linear-gradient(135deg, var(--ion-color-warning), var(--ion-color-warning-shade)); color: #1a1200; }
    .d-danger  { background: linear-gradient(135deg, var(--ion-color-danger), var(--ion-color-danger-shade)); }
    .d-medium  { background: linear-gradient(135deg, #6b7384, #4b515e); }
    .pino { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
    .pino ion-icon { font-size: 20px; color: #fff; }
    .vazio { text-align: center; padding: 16px; }
    .acao-teste { padding: 12px 16px 0; }
    .ajuda-teste { font-size: 0.8rem; color: var(--sh-muted); padding: 6px 8px 0; text-align: center; }
  `],
})
export class AlertasPage {
  private readonly safehome = inject(SafeHomeService);
  private readonly toast = inject(ToastController);
  readonly testando = signal(false);
  readonly estadoAtual = () => this.safehome.status()?.overall_state ?? 'SEM_CONEXAO';
  readonly ocorrencias = () => this.safehome.eventos().filter((e) => e.para !== 'NORMAL').slice(0, 20);
  info(estado: Estado) { return infoEstado(estado); }
  async atualizar(evento: RefresherCustomEvent): Promise<void> { await this.safehome.atualizar(); evento.target.complete(); }

  async testar(): Promise<void> {
    this.testando.set(true);
    try {
      await this.safehome.testarAlarme();
      await this.aviso('Teste de alarme disparado.', 'success');
    } catch (err) {
      await this.aviso(err instanceof Error ? err.message : 'Falha ao testar', 'danger');
    } finally {
      this.testando.set(false);
    }
  }
  private async aviso(message: string, color: 'success' | 'danger'): Promise<void> {
    const t = await this.toast.create({ message, duration: 2200, color, position: 'top' });
    await t.present();
  }
}
