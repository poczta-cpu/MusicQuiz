/**
 * odtwarzacz.js — odtwarzanie 30-sekundowych fragmentów u hosta (4.4).
 *
 * Fragment przychodzi gotowy spod previewUrl z iTunes; długości ani punktu
 * startowego nie da się wybrać (kompromis nr 4). Limit dwóch odtworzeń na utwór
 * pilnowany jest tutaj, żeby ekran hosta nie musiał o tym pamiętać.
 */

export const LIMIT_ODTWORZEN = 2;

export class Odtwarzacz {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.odtworzenia = 0;
    this.gra = false;
    this.przyZmianie = () => {};

    this.audio.addEventListener('ended', () => this._zmiana(false));
    this.audio.addEventListener('pause', () => this._zmiana(false));
    this.audio.addEventListener('playing', () => this._zmiana(true));
    this.audio.addEventListener('error', () => this._zmiana(false));
  }

  _zmiana(gra) {
    this.gra = gra;
    this.przyZmianie(this);
  }

  /** Podstawia nowy utwór i zeruje licznik odtworzeń. */
  zaladuj(previewUrl) {
    this.zatrzymaj();
    this.odtworzenia = 0;
    this.audio.src = previewUrl;
    this.audio.load();
    this.przyZmianie(this);
  }

  get zostalo() {
    return Math.max(0, LIMIT_ODTWORZEN - this.odtworzenia);
  }

  get mozeGrac() {
    return !!this.audio.src && this.zostalo > 0 && !this.gra;
  }

  /**
   * Odtwarza fragment od początku. Zwraca obietnicę, która odrzuca się
   * z czytelnym komunikatem, gdy przeglądarka odmówi odtwarzania.
   */
  async odtworz() {
    if (this.zostalo === 0) throw new Error(`Ten utwór był już odtworzony ${LIMIT_ODTWORZEN} razy.`);
    if (!this.audio.src) throw new Error('Nie wczytano żadnego utworu.');

    this.audio.currentTime = 0;
    try {
      await this.audio.play();
    } catch (e) {
      throw new Error(`Nie udało się odtworzyć fragmentu (${e.name || 'błąd'}). Sprawdź dźwięk i połączenie.`);
    }
    // Licznik rośnie dopiero po faktycznym starcie — odmowa przeglądarki
    // nie może kosztować hosta jednego z dwóch odtworzeń.
    this.odtworzenia++;
    this.przyZmianie(this);
  }

  zatrzymaj() {
    if (!this.audio.src) return;
    this.audio.pause();
    try { this.audio.currentTime = 0; } catch { /* nieistotne */ }
  }
}
