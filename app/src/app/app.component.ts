import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { SafeHomeService } from './services/safehome.service';
import { ThemeService } from './core/theme.service';
import { AuthService } from './core/auth.service';
import { BloqueioComponent } from './shared/bloqueio.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet, BloqueioComponent],
  template: `
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
      @if (auth.bloqueado()) {
        <app-bloqueio></app-bloqueio>
      }
    </ion-app>
  `,
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly safehome = inject(SafeHomeService);
  private readonly tema = inject(ThemeService);
  readonly auth = inject(AuthService);

  ngOnInit(): void {
    this.tema.iniciar();
    this.auth.iniciar();
    this.safehome.iniciar();
  }

  ngOnDestroy(): void {
    this.safehome.parar();
  }
}
