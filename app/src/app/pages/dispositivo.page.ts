import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  InputCustomEvent, IonBadge, IonButton, IonContent, IonHeader, IonIcon, IonInput, IonItem,
  IonLabel, IonList, IonNote, IonSegment, IonSegmentButton, IonTitle, IonToggle, IonToolbar,
  SegmentCustomEvent, ToastController, ToggleCustomEvent, AlertController,
} from '@ionic/angular/standalone';
import { SafeHomeService } from '../services/safehome.service';
import { Tema, ThemeService } from '../core/theme.service';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-dispositivo',
  standalone: true,
  imports: [
    IonBadge, IonButton, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList,
    IonNote, IonSegment, IonSegmentButton, IonTitle, IonToggle, IonToolbar, DatePipe,
  ],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar><ion-title>Dispositivo</ion-title></ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-header collapse="condense">
        <ion-toolbar><ion-title size="large" class="sh-grande">Dispositivo</ion-title></ion-toolbar>
      </ion-header>

      <p class="sh-secao">Servidor</p>
      <ion-list class="sh-lista">
        <ion-item lines="none">
          <ion-icon name="globe-outline" slot="start" color="medium"></ion-icon>
          <ion-input label="Endereço" labelPlacement="stacked" placeholder="http://192.168.0.10:3000"
                     inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false"
                     [value]="rascunho()" (ionInput)="alterarRascunho($event)"></ion-input>
        </ion-item>
      </ion-list>
      @if (erroForm(); as m) { <p class="erro-form">{{ m }}</p> }
      <div class="acoes">
        <ion-button expand="block" [disabled]="testando()" (click)="testar()">
          @if (testando()) { Testando conexão… } @else { Testar conexão }
        </ion-button>
        <ion-button expand="block" fill="outline" (click)="salvar()">Salvar endereço</ion-button>
      </div>

      <p class="sh-secao">Aparência</p>
      <div class="sh-card seg-card">
        <ion-segment [value]="tema.tema()" (ionChange)="mudarTema($event)">
          <ion-segment-button value="system"><ion-label>Sistema</ion-label></ion-segment-button>
          <ion-segment-button value="light"><ion-label>Claro</ion-label></ion-segment-button>
          <ion-segment-button value="dark"><ion-label>Escuro</ion-label></ion-segment-button>
        </ion-segment>
      </div>

      <p class="sh-secao">Segurança</p>
      <ion-list class="sh-lista">
        <ion-item [lines]="auth.temPin() ? 'full' : 'none'">
          <ion-icon name="lock-closed-outline" slot="start" color="medium"></ion-icon>
          <ion-toggle [checked]="auth.temPin()" (ionChange)="alternarPin($event)">Exigir PIN ao abrir</ion-toggle>
        </ion-item>
        @if (auth.temPin()) {
          <ion-item lines="none" button detail (click)="trocarPin()">
            <ion-icon name="key-outline" slot="start" color="medium"></ion-icon>
            <ion-label>Trocar PIN</ion-label>
          </ion-item>
        }
      </ion-list>
      <p class="ajuda">O PIN fica guardado apenas neste aparelho e é pedido toda vez que o app abre.</p>

      <p class="sh-secao">Modo</p>
      <ion-list class="sh-lista">
        <ion-item lines="none">
          <ion-icon name="flask-outline" slot="start" color="medium"></ion-icon>
          <ion-toggle [checked]="safehome.modoDemo()" (ionChange)="alternarDemo($event)">Modo demonstração</ion-toggle>
        </ion-item>
      </ion-list>
      <p class="ajuda">Os dados são simulados no próprio app. Nada é enviado ao servidor e o histórico real não é alterado.</p>

      <p class="sh-secao">Notificações</p>
      <ion-list class="sh-lista">
        <ion-item lines="none">
          <ion-icon name="notifications-outline" slot="start" color="medium"></ion-icon>
          <ion-toggle [checked]="safehome.notificar()" (ionChange)="alternarNotif($event)">Avisar no navegador</ion-toggle>
        </ion-item>
      </ion-list>
      <p class="ajuda">Mostra um aviso do sistema quando um sensor fica crítico, mesmo com o app em outra aba.</p>

      @if (safehome.dispositivos().length) {
        <p class="sh-secao">Sensores</p>
        <ion-list class="sh-lista">
          @for (d of safehome.dispositivos(); track d.device_id) {
            <ion-item button detail lines="full" (click)="renomear(d.device_id, d.nome)">
              <ion-icon name="hardware-chip-outline" slot="start" color="medium"></ion-icon>
              <ion-label>
                <h2>{{ d.nome }}</h2>
                <p>{{ d.device_id }}</p>
              </ion-label>
              <ion-badge slot="end" [color]="d.conectado ? 'success' : 'medium'">{{ d.conectado ? 'Online' : 'Offline' }}</ion-badge>
            </ion-item>
          }
        </ion-list>
        <p class="ajuda">Toque para renomear um sensor.</p>
      }

      <p class="sh-secao">Situação</p>
      <ion-list class="sh-lista">
        <ion-item lines="full">
          <ion-icon name="link-outline" slot="start" color="medium"></ion-icon>
          <ion-label>Endereço em uso</ion-label>
          <ion-note slot="end">{{ safehome.url() }}</ion-note>
        </ion-item>
        <ion-item lines="full">
          <ion-icon name="hardware-chip-outline" slot="start" color="medium"></ion-icon>
          <ion-label>Dispositivo</ion-label>
          @if (safehome.status(); as s) {
            <ion-badge slot="end" [color]="s.conectado ? 'success' : 'medium'">{{ s.conectado ? 'Conectado' : 'Sem sinal' }}</ion-badge>
          } @else { <ion-badge slot="end" color="medium">Desconhecido</ion-badge> }
        </ion-item>
        @if (safehome.saude(); as h) {
          <ion-item lines="full">
            <ion-icon name="server-outline" slot="start" color="medium"></ion-icon>
            <ion-label>Servidor</ion-label>
            <ion-note slot="end">v{{ h.versao }} · no ar {{ h.uptime_s }}s</ion-note>
          </ion-item>
        }
        @if (safehome.ultimaAtualizacao(); as d) {
          <ion-item lines="full">
            <ion-icon name="sync-outline" slot="start" color="medium"></ion-icon>
            <ion-label>Última atualização</ion-label>
            <ion-note slot="end">{{ d | date: 'dd/MM HH:mm:ss' }}</ion-note>
          </ion-item>
        }
        @if (safehome.erro(); as e) {
          <ion-item lines="none">
            <ion-icon name="alert-circle-outline" slot="start" color="danger"></ion-icon>
            <ion-label class="erro">{{ e }}</ion-label>
          </ion-item>
        }
      </ion-list>
      <p class="rodape">SafeHome · app de monitoramento de gás e fumaça</p>
    </ion-content>
  `,
  styles: [`
    .acoes { display: grid; gap: 8px; padding: 4px 16px 0; }
    .ajuda { font-size: 0.82rem; color: var(--sh-muted); padding: 0 24px; }
    .erro-form { color: var(--ion-color-danger); font-size: 0.85rem; padding: 0 24px; margin-top: 4px; }
    .erro { color: var(--ion-color-danger); white-space: normal; }
    .seg-card { padding: 8px; }
    .rodape { text-align: center; font-size: 0.74rem; color: var(--sh-muted); padding: 24px; }
  `],
})
export class DispositivoPage {
  readonly safehome = inject(SafeHomeService);
  readonly tema = inject(ThemeService);
  readonly auth = inject(AuthService);
  private readonly toast = inject(ToastController);
  private readonly alerta = inject(AlertController);

  readonly rascunho = signal<string>(this.safehome.url());
  readonly erroForm = signal<string | null>(null);
  readonly testando = signal(false);

  alterarRascunho(e: InputCustomEvent): void { this.rascunho.set(e.detail.value ?? ''); this.erroForm.set(null); }

  salvar(): void {
    const erro = this.safehome.salvarUrl(this.rascunho());
    this.erroForm.set(erro);
    if (!erro) void this.mostrar('Endereço salvo.', 'success');
  }

  async testar(): Promise<void> {
    this.erroForm.set(null); this.testando.set(true);
    try {
      const versao = await this.safehome.testarConexao(this.rascunho());
      await this.mostrar(`Servidor respondeu. Versão ${versao}.`, 'success');
    } catch (err) {
      this.erroForm.set(err instanceof Error ? err.message : 'Falha desconhecida');
    } finally { this.testando.set(false); }
  }

  mudarTema(e: SegmentCustomEvent): void { this.tema.definir(e.detail.value as Tema); }

  alternarPin(e: ToggleCustomEvent): void {
    if (e.detail.checked) this.auth.iniciarCriacao();
    else this.auth.remover();
  }
  trocarPin(): void { this.auth.iniciarCriacao(); }
  alternarDemo(e: ToggleCustomEvent): void { this.safehome.definirDemo(e.detail.checked); }

  async alternarNotif(e: ToggleCustomEvent): Promise<void> {
    if (e.detail.checked) {
      const ok = await this.safehome.ativarNotificacoes();
      if (!ok) await this.mostrar('Permissão de notificação negada no navegador.', 'danger');
    } else {
      this.safehome.desativarNotificacoes();
    }
  }

  async renomear(id: string, atual: string): Promise<void> {
    const al = await this.alerta.create({
      header: 'Renomear sensor',
      inputs: [{ name: 'nome', type: 'text', value: atual, attributes: { maxlength: 40 } }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Salvar', handler: async (d) => {
            const nome = (d.nome ?? '').trim();
            if (!nome) return;
            try { await this.safehome.renomear(id, nome); await this.mostrar('Nome salvo.', 'success'); }
            catch (err) { await this.mostrar(err instanceof Error ? err.message : 'Falha ao renomear', 'danger'); }
          } },
      ],
    });
    await al.present();
  }

  private async mostrar(message: string, color: 'success' | 'danger'): Promise<void> {
    const t = await this.toast.create({ message, duration: 2500, color, position: 'top' });
    await t.present();
  }
}
