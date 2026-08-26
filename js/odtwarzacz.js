/**
 * odtwarzacz.js — odtwarzanie 30-sekundowych fragmentów u hosta (4.4).
 *
 * Fragment przychodzi gotowy spod previewUrl z iTunes; długości ani punktu
 * startowego nie da się wybrać (kompromis nr 4). Limit dwóch odtworzeń na utwór
 * pilnowany jest tutaj, żeby ekran hosta nie musiał o tym pamiętać.
 *
 * Fragmentu nie trzeba dosłuchać do końca — host w każdej chwili przechodzi
 * dalej, a odtwarzacz ma się z tego pozbierać bez śladu.
 */

export const LIMIT_ODTWORZEN = 2;

/**
 * Czy prowadzącemu wolno przejść do kolejnego utworu.
 *
 * Dopóki fragment nie poleciał ani razu, „Następny utwór" zostaje zablokowany.
 * Bez tego jedno przypadkowe kliknięcie przewija utwór, którego nikt nie
 * usłyszał — a gracze i tak muszą przypisać mu rocznik, więc cała sala traci
 * punkt bez szansy na odpowiedź.
 *
 * Wyjątek: gdy odtwarzanie zwróciło błąd (wygasły previewUrl, odmowa
 * przeglądarki), przejście musi się odblokować. Inaczej host utyka na
 * uszkodzonym utworze i jedynym wyjściem zostaje zakończenie całej gry.
 */
export function wolnoIscDalej({ odtworzenia = 0, blad = false } = {}) {
  return odtworzenia > 0 || blad;
}

export class Odtwarzacz {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.odtworzenia = 0;
    this.przyZmianie = () => {};

    for (const zdarzenie of ['ended', 'pause', 'playing', 'error']) {
      this.audio.addEventListener(zdarzenie, () => this.przyZmianie(this));
    }
  }

  /**
   * Czy fragment leci w tej chwili — czytane wprost z elementu audio.
   * Zapamiętana flaga potrafiła się tu zaciąć: `pause()` wysyła zdarzenie
   * `pause` dopiero w następnym zadaniu, a `load()` przy ładowaniu kolejnego
   * utworu kasuje takie zadania z kolejki. Po kliknięciu „Następny utwór"
   * w trakcie grania flaga zostawała na `true` i przycisk „Odtwórz" nie dawał
   * się już wcisnąć do końca rozgrywki.
   */
  get gra() {
    return !!this.audio.src && !this.audio.paused && !this.audio.ended;
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
      // Host przerwał sam (Następny utwór, Zakończ) — to nie jest błąd
      // i nie może kosztować odtworzenia ani zaśmiecać ekranu komunikatem.
      if (e && e.name === 'AbortError') return;
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
    this.przyZmianie(this);
  }
}
