import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  keyOutline,
  lockClosedOutline,
  backspaceOutline,
  checkmarkCircleOutline,
  cloudOfflineOutline,
  cloudOutline,
  flameOutline,
  flaskOutline,
  globeOutline,
  linkOutline,
  hardwareChipOutline,
  homeOutline,
  notificationsOutline,
  serverOutline,
  syncOutline,
  timeOutline,
  warningOutline,
} from 'ionicons/icons';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

registerLocaleData(localePt);

addIcons({
  'key-outline': keyOutline,
  'lock-closed-outline': lockClosedOutline,
  'backspace-outline': backspaceOutline,
  'alert-circle-outline': alertCircleOutline,
  'checkmark-circle-outline': checkmarkCircleOutline,
  'cloud-offline-outline': cloudOfflineOutline,
  'cloud-outline': cloudOutline,
  'flame-outline': flameOutline,
  'flask-outline': flaskOutline,
  'globe-outline': globeOutline,
  'link-outline': linkOutline,
  'hardware-chip-outline': hardwareChipOutline,
  'home-outline': homeOutline,
  'notifications-outline': notificationsOutline,
  'server-outline': serverOutline,
  'sync-outline': syncOutline,
  'time-outline': timeOutline,
  'warning-outline': warningOutline,
});

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes),
    { provide: LOCALE_ID, useValue: 'pt-BR' },
  ],
});
