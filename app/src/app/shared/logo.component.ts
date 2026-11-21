import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-logo',
  standalone: true,
  template: `
    <svg [attr.width]="tamanho" [attr.height]="tamanho" viewBox="0 0 48 48" fill="none" role="img" aria-label="SafeHome">
      <rect x="2" y="2" width="44" height="44" rx="12" fill="var(--sh-brand)"></rect>
      <path d="M24 11 L36 20 V34 a2 2 0 0 1-2 2 H14 a2 2 0 0 1-2-2 V20 Z"
            fill="none" stroke="var(--ion-color-primary-contrast)" stroke-width="2.4"
            stroke-linejoin="round"></path>
      <circle cx="24" cy="26" r="3.4" fill="var(--ion-color-primary-contrast)"></circle>
      <path d="M24 29.4 V33" stroke="var(--ion-color-primary-contrast)" stroke-width="2.4" stroke-linecap="round"></path>
    </svg>
  `,
})
export class LogoComponent {
  @Input() tamanho = 32;
}
