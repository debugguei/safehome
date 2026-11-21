import { Injectable, signal } from '@angular/core';

export type Tema = 'system' | 'light' | 'dark';
const CHAVE = 'safehome.tema';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly tema = signal<Tema>((localStorage.getItem(CHAVE) as Tema) ?? 'system');
  private readonly mql = window.matchMedia('(prefers-color-scheme: dark)');

  iniciar(): void {
    this.mql.addEventListener('change', () => {
      if (this.tema() === 'system') this.aplicar();
    });
    this.aplicar();
  }

  definir(tema: Tema): void {
    this.tema.set(tema);
    localStorage.setItem(CHAVE, tema);
    this.aplicar();
  }

  /** True se o tema efetivo (resolvendo "system") é escuro. */
  escuroEfetivo(): boolean {
    const t = this.tema();
    return t === 'dark' || (t === 'system' && this.mql.matches);
  }

  private aplicar(): void {
    document.documentElement.classList.toggle('ion-palette-dark', this.escuroEfetivo());
  }
}
