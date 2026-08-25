/**
 * arkusz.js — układanka gracza bez ani jednego odwołania do DOM.
 *
 * Wydzielone z ekranu gracza, bo to tutaj siedzą reguły, na których stoi cała
 * gra: rok użyty raz zostaje zajęty na zawsze, wybór można zmieniać do momentu
 * zatwierdzenia i ani chwili dłużej, a pominięcie utworu kosztuje punkt, ale
 * nie blokuje rocznika (4.4, 7.2).
 */

/**
 * @param {object} stan   arkusz z magazynu (odpowiedzi, zatwierdzone, biezacy)
 * @param {number[]} lata kolumna roczników z kodu pokoju, rosnąco
 */
export class Arkusz {
  constructor(stan, lata) {
    this.stan = stan;
    this.lata = lata;
    this.wybor = stan.odpowiedzi[stan.biezacy] ?? null;   // niezatwierdzony wybór
  }

  get liczbaUtworow() { return this.lata.length; }
  get numerUtworu() { return this.stan.biezacy + 1; }
  get ostatniUtwor() { return this.stan.biezacy >= this.liczbaUtworow - 1; }
  get oddany() { return !!this.stan.zakonczonoO; }

  /** Mapa indeksRoku -> numer utworu, który go zatwierdził. */
  zajete() {
    const mapa = new Map();
    this.stan.odpowiedzi.forEach((indeksRoku, utwor) => {
      if (indeksRoku !== null && this.stan.zatwierdzone[utwor]) mapa.set(indeksRoku, utwor + 1);
    });
    return mapa;
  }

  wolneIndeksy() {
    const zajete = this.zajete();
    const wolne = [];
    for (let i = 0; i < this.lata.length; i++) if (!zajete.has(i)) wolne.push(i);
    return wolne;
  }

  /** Czy rocznik da się jeszcze tapnąć. Zatwierdzonego nie da się zwolnić ani podmienić. */
  mozliwyDoWyboru(indeksRoku) {
    return !this.zajete().has(indeksRoku);
  }

  /**
   * Tapnięcie rocznika. Ponowne tapnięcie tego samego zdejmuje wybór —
   * dzięki temu da się dojść do „zatwierdzam bez odpowiedzi" bez osobnego przycisku.
   */
  tapnij(indeksRoku) {
    if (!this.mozliwyDoWyboru(indeksRoku)) return false;
    this.wybor = this.wybor === indeksRoku ? null : indeksRoku;
    return true;
  }

  /**
   * Przy ostatnim utworze zostaje jeden wolny rocznik — zaznaczamy go z góry,
   * ale zatwierdzenie i tak wymaga kliknięcia (7.2).
   */
  podpowiedzOstatniego() {
    const wolne = this.wolneIndeksy();
    if (wolne.length === 1 && this.wybor === null) this.wybor = wolne[0];
    return this.wybor;
  }

  /** Czy zatwierdzenie oznacza rezygnację z punktu (wymaga potwierdzenia). */
  czyPominiecie() {
    return this.wybor === null;
  }

  /**
   * Nieodwracalnie zapisuje wybór i przesuwa arkusz na kolejny utwór.
   * @returns {{koniec:boolean}} koniec === true, gdy to był ostatni utwór
   */
  zatwierdz(godzina) {
    const i = this.stan.biezacy;
    if (this.stan.zatwierdzone[i]) throw new Error('Ten utwór jest już zatwierdzony.');

    this.stan.odpowiedzi[i] = this.wybor;
    this.stan.zatwierdzone[i] = true;

    if (this.ostatniUtwor) {
      this.stan.zakonczonoO = godzina;
      return { koniec: true };
    }
    this.stan.biezacy++;
    this.wybor = null;
    return { koniec: false };
  }

  /** Opis wiersza kolumny — bez tytułów, wyłącznie numery utworów (7.2). */
  wiersze() {
    const zajete = this.zajete();
    return this.lata.map((rok, indeks) => {
      const numerUtworu = zajete.get(indeks);
      const zajety = numerUtworu !== undefined;
      return {
        rok,
        indeks,
        zajety,
        wybrany: !zajety && indeks === this.wybor,
        etykieta: zajety
          ? `Utwór ${numerUtworu}`
          : (indeks === this.wybor ? `Utwór ${this.numerUtworu}` : '—'),
      };
    });
  }
}
