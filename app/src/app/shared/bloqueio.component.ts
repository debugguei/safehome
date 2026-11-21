import { Component, computed, inject, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { AuthService } from '../core/auth.service';
import { LogoComponent } from './logo.component';

type Fase = 'verificar' | 'novo' | 'confirmar';

@Component({
  selector: 'app-bloqueio',
  standalone: true,
  imports: [IonIcon, LogoComponent],
  template: `
    <div class="tela">
      <div class="topo">
        <app-logo [tamanho]="44"></app-logo>
        <h1>SafeHome</h1>
        <p>{{ titulo() }}</p>
      </div>

      <div class="pontos" [class.erro]="erro()">
        @for (i of posicoes; track i) {
          <span [class.cheio]="digitos().length > i"></span>
        }
      </div>
      <p class="aviso">{{ erro() || ' ' }}</p>

      <div class="teclado">
        @for (t of teclas; track t) {
          @if (t === '') {
            <span></span>
          } @else if (t === 'del') {
            <button type="button" (click)="apagar()" aria-label="Apagar">
              <ion-icon name="backspace-outline"></ion-icon>
            </button>
          } @else {
            <button type="button" (click)="digitar(t)">{{ t }}</button>
          }
        }
      </div>

      @if (auth.criando()) {
        <button type="button" class="cancelar" (click)="cancelar()">Cancelar</button>
      }
    </div>
  `,
  styles: [`
    .tela {
      position: fixed; inset: 0; z-index: 1000;
      background: var(--ion-background-color); color: var(--ion-text-color);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 8px; padding: 32px 24px calc(32px + env(safe-area-inset-bottom));
    }
    .topo { text-align: center; margin-bottom: 8px; }
    .topo h1 { font-size: 1.4rem; font-weight: 800; margin: 12px 0 4px; letter-spacing: -0.01em; }
    .topo p { color: var(--sh-muted); margin: 0; }

    .pontos { display: flex; gap: 16px; margin-top: 16px; }
    .pontos span { width: 15px; height: 15px; border-radius: 50%; border: 2px solid var(--sh-muted); transition: all 0.15s; }
    .pontos span.cheio { background: var(--ion-color-primary); border-color: var(--ion-color-primary); }
    .pontos.erro span { border-color: var(--ion-color-danger); animation: tremer 0.3s; }
    @keyframes tremer { 25% { transform: translateX(-5px) } 75% { transform: translateX(5px) } }
    .aviso { color: var(--ion-color-danger); font-size: 0.85rem; min-height: 1.2em; margin: 4px 0 8px; }

    .teclado { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; width: 100%; max-width: 300px; }
    .teclado button {
      aspect-ratio: 1; border-radius: 50%; border: none; cursor: pointer;
      background: var(--sh-surface); color: var(--ion-text-color);
      font-size: 1.5rem; font-weight: 600; border: 1px solid var(--sh-border);
      transition: background 0.1s; max-height: 72px; margin: 0 auto; width: 72px;
    }
    .teclado button:active { background: var(--ion-color-primary); color: var(--ion-color-primary-contrast); }
    .teclado button ion-icon { font-size: 1.5rem; }
    .cancelar { margin-top: 20px; background: none; border: none; color: var(--ion-color-primary); font-size: 0.95rem; font-weight: 600; cursor: pointer; }
  `],
})
export class BloqueioComponent {
  readonly auth = inject(AuthService);
  readonly posicoes = Array.from({ length: this.auth.tamanho }, (_, i) => i);
  readonly teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

  private readonly fase = signal<Fase>(this.auth.criando() ? 'novo' : 'verificar');
  private primeiro = '';
  readonly digitos = signal<string>('');
  readonly erro = signal<string>('');

  readonly titulo = computed(() => {
    switch (this.fase()) {
      case 'novo': return 'Crie um PIN de 4 dígitos';
      case 'confirmar': return 'Repita o PIN';
      default: return 'Digite seu PIN';
    }
  });

  digitar(d: string): void {
    if (this.digitos().length >= this.auth.tamanho) return;
    this.erro.set('');
    this.digitos.update((v) => v + d);
    if (this.digitos().length === this.auth.tamanho) setTimeout(() => this.concluir(), 120);
  }

  apagar(): void {
    this.erro.set('');
    this.digitos.update((v) => v.slice(0, -1));
  }

  cancelar(): void {
    this.auth.cancelarCriacao();
  }

  private async concluir(): Promise<void> {
    const pin = this.digitos();
    if (this.fase() === 'verificar') {
      const ok = await this.auth.verificar(pin);
      if (!ok) this.falhar('PIN incorreto');
      return;
    }
    if (this.fase() === 'novo') {
      this.primeiro = pin;
      this.digitos.set('');
      this.fase.set('confirmar');
      return;
    }
    // confirmar
    if (pin !== this.primeiro) {
      this.fase.set('novo');
      this.primeiro = '';
      this.falhar('Os PINs não coincidem');
      return;
    }
    await this.auth.definirPin(pin);
  }

  private falhar(msg: string): void {
    this.erro.set(msg);
    this.digitos.set('');
  }
}
