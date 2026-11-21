import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  IonBadge, IonContent, IonHeader, IonIcon, IonItem, IonItemDivider, IonLabel, IonList, IonNote,
  IonRefresher, IonRefresherContent, IonTitle, IonToolbar, RefresherCustomEvent,
} from '@ionic/angular/standalone';
import { Estado, Evento, infoEstado } from '../models/safehome.models';
import { SafeHomeService } from '../services/safehome.service';

interface Grupo { dia: string; eventos: Evento[]; }

@Component({
  selector: 'app-historico',
  standalone: true,
  imports: [
    IonBadge, IonContent, IonHeader, IonIcon, IonItem, IonItemDivider, IonLabel, IonList, IonNote,
    IonRefresher, IonRefresherContent, IonTitle, IonToolbar, DatePipe,
  ],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar><ion-title>Histórico</ion-title></ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-header collapse="condense">
        <ion-toolbar><ion-title size="large" class="sh-grande">Histórico</ion-title></ion-toolbar>
      </ion-header>

      <ion-refresher slot="fixed" (ionRefresh)="atualizar($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      @if (grupos().length) {
        @for (grupo of grupos(); track grupo.dia) {
          <ion-item-divider sticky><ion-label>{{ grupo.dia }}</ion-label></ion-item-divider>
          <ion-list class="sh-lista">
            @for (e of grupo.eventos; track e.sequencia) {
              <ion-item lines="full">
                <div class="pino" slot="start" [style.background]="'var(--ion-color-' + info(e.para).cor + ')'">
                  <ion-icon [name]="info(e.para).icone"></ion-icon>
                </div>
                <ion-label>
                  <h2>{{ info(e.para).rotulo }}</h2>
                  <p>
                    @if (e.de) { de {{ info(e.de).rotulo }} } @else { Primeiro registro }
                    · {{ e.em | date: 'HH:mm:ss' }}
                  </p>
                </ion-label>
                <div slot="end" class="fim">
                  <ion-note>#{{ e.sequencia }}</ion-note>
                  @if (e.simulado) { <ion-badge color="warning">Sim.</ion-badge> }
                </div>
              </ion-item>
            }
          </ion-list>
        }
      } @else {
        <div class="vazio">
          <ion-icon name="time-outline"></ion-icon>
          <h2>Sem registros</h2>
          <p>As mudanças de estado do dispositivo aparecem aqui.</p>
        </div>
      }
    </ion-content>
  `,
  styles: [`
    .pino { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
    .pino ion-icon { font-size: 20px; color: #fff; }
    .fim { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
    .fim ion-note { font-variant-numeric: tabular-nums; }
    .vazio { text-align: center; padding: 72px 32px; color: var(--sh-muted); }
    .vazio ion-icon { font-size: 48px; margin-bottom: 8px; }
    .vazio h2 { color: var(--ion-text-color); font-size: 1.1rem; margin: 0 0 4px; }
    .vazio p { margin: 0; font-size: 0.9rem; }
  `],
})
export class HistoricoPage {
  private readonly safehome = inject(SafeHomeService);
  readonly grupos = computed<Grupo[]>(() => {
    const mapa = new Map<string, Evento[]>();
    for (const e of this.safehome.eventos()) {
      const dia = new Date(e.em).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
      mapa.set(dia, [...(mapa.get(dia) ?? []), e]);
    }
    return [...mapa.entries()].map(([dia, eventos]) => ({ dia: dia.charAt(0).toUpperCase() + dia.slice(1), eventos }));
  });
  info(estado: Estado) { return infoEstado(estado); }
  async atualizar(evento: RefresherCustomEvent): Promise<void> { await this.safehome.atualizar(); evento.target.complete(); }
}
