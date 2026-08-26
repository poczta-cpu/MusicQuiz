/**
 * arkusz.js — układanka gracza bez ani jednego odwołania do DOM.
 *
 * Wydzielone z ekranu gracza, bo to tutaj siedzą reguły, na których stoi cała
 * gra: rok użyty raz zostaje zajęty, wybór można zmieniać do momentu
 * zatwierdzenia i ani chwili dłużej, a pominięcie utworu kosztuje punkt, ale
 * nie blokuje rocznika (4.4, 7.2).
 *
 * Dwa tryby, wybierane przez hosta i przenoszone w kodzie pokoju:
 *
 *   RUNDOWY  — pierwotne zasady. Każdy utwór zatwierdzasz nieodwracalnie zaraz
 *              po odsłuchaniu; zatwierdzonego rocznika nie da się już ruszyć.
 *
 *   SWOBODNY — przypisania żyją przez całą grę. Utwór bierze się „do ręki"
 *              jednym tapnięciem i kładzie drugim; położenie go na obsadzonym
 *              roczniku zamienia oba utwory miejscami. Dopiero `zamroz()`
 *              zamyka listę i wystawia godzinę oddania.
 *
 * Rozróżnienie, na którym stoi tryb swobodny: rocznik ZAJĘTY trzyma jakiś utwór,
 * ale nadal daje się ruszyć; rocznik ZAMROŻONY jest nietykalny. W trybie
 * rundowym te dwa zbiory są tożsame, w swobodnym zamrożone są puste aż do końca.
 */

import { TRYBY, TRYB_DOMYSLNY } from './kody.js';

/**
 * @param {object} stan   arkusz z magazynu (odpowiedzi, zatwierdzone, biezacy)
 * @param {number[]} lata kolumna roczników z kodu pokoju, rosnąco
 * @param {string} tryb   'rundowy' albo 'swobodny'
 */
export class Arkusz {
  constructor(stan, lata, tryb = TRYB_DOMYSLNY) {
    this.stan = stan;
    this.lata = lata;
    this.tryb = TRYBY.includes(tryb) ? tryb : TRYB_DOMYSLNY;
    this.swobodny = this.tryb === 'swobodny';

    // Rundowy: niezatwierdzony wybór czeka obok tablicy odpowiedzi.
    this.wybor = this.swobodny ? null : (stan.odpowiedzi[stan.biezacy] ?? null);
    // Swobodny: utwór trzymany w ręce, czekający na wskazanie rocznika.
    this.podniesiony = this.swobodny ? this.domyslnieWRece() : null;
  }

  get liczbaUtworow() { return this.lata.length; }
  get numerUtworu() { return this.stan.biezacy + 1; }
  get ostatniUtwor() { return this.stan.biezacy >= this.liczbaUtworow - 1; }
  get oddany() { return !!this.stan.zakonczonoO; }

  /** Bieżący utwór trafia do ręki sam, o ile nie ma jeszcze swojego rocznika. */
  domyslnieWRece() {
    if (this.oddany) return null;
    return this.stan.odpowiedzi[this.stan.biezacy] == null ? this.stan.biezacy : null;
  }

  /**
   * Mapa indeksRoku -> numer utworu (1-based), który na nim stoi.
   * W trybie rundowym liczą się wyłącznie utwory zatwierdzone, w swobodnym
   * każde przypisanie — także takie, które gracz zaraz przestawi.
   */
  zajete() {
    const mapa = new Map();
    this.stan.odpowiedzi.forEach((indeksRoku, utwor) => {
      if (indeksRoku == null) return;
      if (!this.swobodny && !this.stan.zatwierdzone[utwor]) return;
      mapa.set(indeksRoku, utwor + 1);
    });
    return mapa;
  }

  /** Roczniki nietykalne. W trybie swobodnym puste aż do zamrożenia listy. */
  zamrozone() {
    const mapa = new Map();
    this.stan.odpowiedzi.forEach((indeksRoku, utwor) => {
      if (indeksRoku != null && this.stan.zatwierdzone[utwor]) mapa.set(indeksRoku, utwor + 1);
    });
    return mapa;
  }

  wolneIndeksy() {
    const zajete = this.zajete();
    const wolne = [];
    for (let i = 0; i < this.lata.length; i++) if (!zajete.has(i)) wolne.push(i);
    return wolne;
  }

  /** Utwory (0-based) bez przypisanego rocznika, rosnąco. */
  nieprzypisane() {
    const lista = [];
    this.stan.odpowiedzi.forEach((indeksRoku, utwor) => { if (indeksRoku == null) lista.push(utwor); });
    return lista;
  }

  /** Czy rocznik da się jeszcze tapnąć. Zamrożonego nie da się zwolnić ani podmienić. */
  mozliwyDoWyboru(indeksRoku) {
    if (this.oddany) return false;
    return !this.zamrozone().has(indeksRoku);
  }

  // -------------------------------------------------------------- tapnięcia

  /**
   * Tapnięcie rocznika. Znaczenie zależy od trybu — patrz `tapnijRundowo`
   * i `tapnijSwobodnie`.
   */
  tapnij(indeksRoku) {
    if (!this.mozliwyDoWyboru(indeksRoku)) return false;
    return this.swobodny ? this.tapnijSwobodnie(indeksRoku) : this.tapnijRundowo(indeksRoku);
  }

  /**
   * Rundowy: ponowne tapnięcie tego samego rocznika zdejmuje wybór — dzięki temu
   * da się dojść do „zatwierdzam bez odpowiedzi" bez osobnego przycisku.
   */
  tapnijRundowo(indeksRoku) {
    this.wybor = this.wybor === indeksRoku ? null : indeksRoku;
    return true;
  }

  /**
   * Swobodny, dwa tapnięcia:
   *   pusta ręka + obsadzony rocznik   -> bierzemy stamtąd utwór
   *   utwór w ręce + wolny rocznik     -> kładziemy go, stary rocznik się zwalnia
   *   utwór w ręce + obsadzony rocznik -> oba utwory zamieniają się rocznikami
   *   tapnięcie rocznika utworu z ręki -> odkładamy bez zmian
   */
  tapnijSwobodnie(indeksRoku) {
    const zajete = this.zajete();
    const utworTam = zajete.has(indeksRoku) ? zajete.get(indeksRoku) - 1 : null;

    if (this.podniesiony === null) {
      if (utworTam === null) return false;   // pusty rocznik nie ma czego dać
      this.podniesiony = utworTam;
      return true;
    }

    if (utworTam === this.podniesiony) {
      this.podniesiony = null;
      return true;
    }

    const skad = this.stan.odpowiedzi[this.podniesiony] ?? null;
    this.stan.odpowiedzi[this.podniesiony] = indeksRoku;
    // Poprzedni lokator idzie tam, skąd przyszedł utwór z ręki. Gdy ten nie miał
    // jeszcze rocznika, lokator zostaje nieprzypisany i wraca na listę u góry.
    if (utworTam !== null) this.stan.odpowiedzi[utworTam] = skad;

    const ulozylBiezacy = this.podniesiony === this.stan.biezacy;
    this.podniesiony = null;
    if (ulozylBiezacy) {
      // Ułożenie bieżącego utworu samo przesuwa arkusz dalej — ten sam rytm, co
      // „Zatwierdź" w trybie rundowym, tylko bez zatrzaskiwania wyboru.
      this.przejdzDalej();
    } else {
      // Poprawianie starszego utworu nie może zostawić pustej ręki, kiedy bieżący
      // wciąż czeka bez rocznika — utwór leci i gracz nie ma czasu na dodatkowe
      // tapnięcie żetonu. Pustą rękę zostawia tylko świadome odłożenie utworu.
      this.podniesiony = this.domyslnieWRece();
    }
    return true;
  }

  /** Bierze utwór do ręki po numerze. Ponowne wskazanie tego samego odkłada go. */
  podnies(utwor) {
    if (!this.swobodny || this.oddany) return false;
    if (!Number.isInteger(utwor) || utwor < 0 || utwor >= this.liczbaUtworow) return false;
    this.podniesiony = this.podniesiony === utwor ? null : utwor;
    return true;
  }

  /**
   * Przy ostatnim utworze zostaje jeden wolny rocznik — zaznaczamy go z góry,
   * ale zatwierdzenie i tak wymaga kliknięcia (7.2). Dotyczy trybu rundowego;
   * w swobodnym gracz widzi całą planszę i sam decyduje, co gdzie dołożyć.
   */
  podpowiedzOstatniego() {
    if (this.swobodny) return this.podniesiony;
    const wolne = this.wolneIndeksy();
    if (wolne.length === 1 && this.wybor === null) this.wybor = wolne[0];
    return this.wybor;
  }

  // -------------------------------------------------------------- zamykanie

  /** Czy zatwierdzenie oznacza rezygnację z punktu (wymaga potwierdzenia). */
  czyPominiecie() {
    return this.wybor === null;
  }

  /** Przesuwa arkusz na kolejny utwór. Przy ostatnim nie robi nic. */
  przejdzDalej() {
    if (this.ostatniUtwor) return false;
    this.stan.biezacy++;
    if (this.swobodny) this.podniesiony = this.domyslnieWRece();
    else this.wybor = this.stan.odpowiedzi[this.stan.biezacy] ?? null;
    return true;
  }

  /**
   * Rundowy: nieodwracalnie zapisuje wybór i przesuwa arkusz na kolejny utwór.
   * @returns {{koniec:boolean}} koniec === true, gdy to był ostatni utwór
   */
  zatwierdz(godzina) {
    if (this.swobodny) throw new Error('W trybie swobodnym listę zamyka przycisk „Zamroź listę".');
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

  /**
   * Swobodny: zamyka listę. Od tej chwili nic się nie rusza, a godzina oddania
   * rozstrzyga remisy (4.5 pkt 5). Utwory bez rocznika zostają pominięte.
   */
  zamroz(godzina) {
    if (!this.swobodny) throw new Error('W trybie rundowym każdy utwór zamyka się osobno.');
    if (this.oddany) throw new Error('Arkusz jest już oddany.');

    this.stan.zatwierdzone = this.stan.zatwierdzone.map(() => true);
    this.stan.zakonczonoO = godzina;
    this.podniesiony = null;
    return { koniec: true };
  }

  // -------------------------------------------------------------- widok

  /** Opis wiersza kolumny — bez tytułów, wyłącznie numery utworów (7.2). */
  wiersze() {
    const zajete = this.zajete();
    const zamrozone = this.zamrozone();

    return this.lata.map((rok, indeks) => {
      const numerUtworu = zajete.get(indeks);
      const zajety = numerUtworu !== undefined;
      const zamrozony = zamrozone.has(indeks);
      const podniesiony = this.swobodny && zajety && numerUtworu - 1 === this.podniesiony;

      let etykieta;
      if (zajety) etykieta = `Utwór ${numerUtworu}`;
      else if (!this.swobodny && indeks === this.wybor) etykieta = `Utwór ${this.numerUtworu}`;
      else etykieta = '—';

      return {
        rok,
        indeks,
        zajety,
        zamrozony,
        podniesiony,
        wybrany: this.swobodny ? podniesiony : (!zajety && indeks === this.wybor),
        etykieta,
      };
    });
  }
}
