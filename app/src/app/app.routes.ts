import { Routes } from '@angular/router';
import { TabsPage } from './tabs/tabs.page';

export const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      {
        path: 'inicio',
        loadComponent: () => import('./pages/inicio.page').then((m) => m.InicioPage),
      },
      {
        path: 'historico',
        loadComponent: () => import('./pages/historico.page').then((m) => m.HistoricoPage),
      },
      {
        path: 'alertas',
        loadComponent: () => import('./pages/alertas.page').then((m) => m.AlertasPage),
      },
      {
        path: 'dispositivo',
        loadComponent: () => import('./pages/dispositivo.page').then((m) => m.DispositivoPage),
      },
      { path: '', redirectTo: 'inicio', pathMatch: 'full' },
    ],
  },
  { path: '', redirectTo: 'tabs/inicio', pathMatch: 'full' },
  { path: '**', redirectTo: 'tabs/inicio' },
];
