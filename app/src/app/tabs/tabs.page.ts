import { Component } from '@angular/core';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular/standalone';

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
  template: `
    <ion-tabs>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="inicio">
          <ion-icon name="home-outline"></ion-icon>
          <ion-label>Painel</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="historico">
          <ion-icon name="time-outline"></ion-icon>
          <ion-label>Histórico</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="alertas">
          <ion-icon name="notifications-outline"></ion-icon>
          <ion-label>Alertas</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="dispositivo">
          <ion-icon name="hardware-chip-outline"></ion-icon>
          <ion-label>Dispositivo</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  `,
})
export class TabsPage {}
