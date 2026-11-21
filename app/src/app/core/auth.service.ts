import { Injectable, signal } from '@angular/core';

const CHAVE = 'safehome.pin';
const TAM_PIN = 4;

interface PinGuardado { salt: string; hash: string; }

async function sha256(texto: string): Promise<string> {
  const dados = new TextEncoder().encode(texto);
  const buffer = await crypto.subtle.digest('SHA-256', dados);
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  /** Existe um PIN configurado. */
  readonly temPin = signal<boolean>(false);
  /** A sessão atual está liberada (não mostra a tela de bloqueio). */
  readonly desbloqueado = signal<boolean>(true);
  /** O usuário pediu para criar/trocar o PIN agora. */
  readonly criando = signal<boolean>(false);

  readonly tamanho = TAM_PIN;

  iniciar(): void {
    const existe = localStorage.getItem(CHAVE) !== null;
    this.temPin.set(existe);
    this.desbloqueado.set(!existe); // sem PIN, o app já abre liberado
  }

  /** True quando a tela de bloqueio deve aparecer. */
  bloqueado(): boolean {
    return this.criando() || (this.temPin() && !this.desbloqueado());
  }

  iniciarCriacao(): void {
    this.criando.set(true);
  }

  cancelarCriacao(): void {
    this.criando.set(false);
    // se não havia PIN, segue liberado; se havia, mantém o estado atual
    if (!this.temPin()) this.desbloqueado.set(true);
  }

  async definirPin(pin: string): Promise<void> {
    const salt = crypto.randomUUID();
    const hash = await sha256(salt + pin);
    localStorage.setItem(CHAVE, JSON.stringify({ salt, hash } satisfies PinGuardado));
    this.temPin.set(true);
    this.desbloqueado.set(true);
    this.criando.set(false);
  }

  async verificar(pin: string): Promise<boolean> {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return false;
    const { salt, hash } = JSON.parse(bruto) as PinGuardado;
    const ok = (await sha256(salt + pin)) === hash;
    if (ok) this.desbloqueado.set(true);
    return ok;
  }

  remover(): void {
    localStorage.removeItem(CHAVE);
    this.temPin.set(false);
    this.desbloqueado.set(true);
    this.criando.set(false);
  }

  bloquear(): void {
    if (this.temPin()) this.desbloqueado.set(false);
  }
}
