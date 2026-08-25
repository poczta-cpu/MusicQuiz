/**
 * kody.js — kodowanie i dekodowanie kodów przenoszonych między urządzeniami (sekcja 8).
 *
 * Dwa kody:
 *   1. KOD POKOJU — host -> gracze, na starcie. Ludzie go przepisują z ekranu,
 *      więc musi być krótki. Zawiera wyłącznie wersję formatu, liczbę utworów
 *      i zbiór roczników; NIE zawiera odpowiedzi (4.3).
 *   2. KLUCZ ODPOWIEDZI — host -> gracze, po ostatnim utworze. Idzie przez QR,
 *      więc może być dłuższy.
 *
 * Oba kody upakowane są bitowo, bez marnowania miejsca na granice bajtów.
 * Kod pokoju nie zapisuje maski 52 roczników, tylko numer kombinacji wybranych
 * lat — dzięki temu jego długość zależy od rozmiaru gry: 4 znaki przy trzech
 * utworach, 8 przy dziesięciu, 11 w najgorszym przypadku.
 *
 * Alfabet base32 w wariancie Crockforda: bez I, L, O i U, żeby nie mylić znaków
 * przy przepisywaniu.
 */

const ALFABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Mapa znak -> wartość, z tolerancją na typowe pomyłki przy przepisywaniu. */
const WARTOSCI = (() => {
  const m = new Map();
  for (let i = 0; i < ALFABET.length; i++) m.set(ALFABET[i], i);
  m.set('I', 1); m.set('L', 1);   // I oraz L czyta się jak 1
  m.set('O', 0);                  // O czyta się jak 0
  m.set('U', m.get('V'));         // U czyta się jak V
  return m;
})();

export const ROK_MIN = 1975;
export const ROK_MAX = 2026;
export const LICZBA_ROCZNIKOW = ROK_MAX - ROK_MIN + 1;   // 52 możliwe roczniki
export const WERSJA_FORMATU = 1;

/**
 * Typowe długości gry mieszczą się w 4 bitach nagłówka kodu pokoju, co pozwala
 * zamknąć nagłówek w jednym znaku. Kolejność jest częścią formatu — dopisywać
 * na końcu, nigdy nie przestawiać. Indeks 15 jest zarezerwowany na ucieczkę
 * dla nietypowej liczby utworów.
 */
const DLUGOSCI_W_NAGLOWKU = [3, 5, 10, 15, 20, 25, 30, 35, 40];
const UCIECZKA_DLUGOSCI = 15;

/** Usuwa spacje i myślniki, ujednolica wielkość liter. */
export function oczysc(tekst) {
  return String(tekst || '').toUpperCase().replace(/[\s-]+/g, '');
}

/** Rozbija kod na grupy po `ile` znaków — łatwiej przepisać z ekranu. */
export function formatujKod(kod, ile = 4, rozdzielacz = ' ') {
  const czysty = oczysc(kod);
  const grupy = [];
  for (let i = 0; i < czysty.length; i += ile) grupy.push(czysty.slice(i, i + ile));
  return grupy.join(rozdzielacz);
}

// ---------------------------------------------------------------- bity

/** Zapisuje kolejne pola bitowe i zamyka je w base32. */
class Zapis {
  constructor() {
    this.bity = [];
  }

  dopisz(wartosc, ile) {
    const v = BigInt(wartosc);
    if (v < 0n || (ile < 64 && v >= 1n << BigInt(ile))) {
      throw new Error(`Wartość ${v} nie mieści się w ${ile} bitach.`);
    }
    for (let i = ile - 1; i >= 0; i--) this.bity.push(Number((v >> BigInt(i)) & 1n));
  }

  naBase32() {
    let out = '';
    for (let i = 0; i < this.bity.length; i += 5) {
      let v = 0;
      for (let j = 0; j < 5; j++) v = (v << 1) | (this.bity[i + j] || 0);
      out += ALFABET[v];
    }
    return out;
  }
}

/** Czyta kolejne pola bitowe z base32. */
class Odczyt {
  constructor(tekst) {
    this.bity = [];
    for (const znak of tekst) {
      if (!WARTOSCI.has(znak)) throw new Error(`Nieznany znak w kodzie: „${znak}".`);
      const v = WARTOSCI.get(znak);
      for (let i = 4; i >= 0; i--) this.bity.push((v >> i) & 1);
    }
    this.pozycja = 0;
  }

  czytaj(ile) {
    if (this.pozycja + ile > this.bity.length) throw new Error('Kod jest niekompletny.');
    let v = 0n;
    for (let i = 0; i < ile; i++) v = (v << 1n) | BigInt(this.bity[this.pozycja++]);
    return v;
  }
}

/** Ile bitów potrzeba, żeby zapisać wartości 0…liczbaWartosci-1. */
function bitowNa(liczbaWartosci) {
  let bitow = 0;
  let granica = 1n;
  while (granica < liczbaWartosci) { granica <<= 1n; bitow++; }
  return bitow;
}

// ---------------------------------------------------------------- kombinatoryka

const pamiecDwumian = new Map();

/** Symbol Newtona C(n, k) na liczbach dowolnej wielkości. */
function dwumian(n, k) {
  if (k < 0 || n < 0 || k > n) return 0n;
  const klucz = `${n}|${k}`;
  if (pamiecDwumian.has(klucz)) return pamiecDwumian.get(klucz);
  const m = Math.min(k, n - k);
  let wynik = 1n;
  for (let i = 0; i < m; i++) wynik = (wynik * BigInt(n - i)) / BigInt(i + 1);
  pamiecDwumian.set(klucz, wynik);
  return wynik;
}

/**
 * Numer kombinacji w porządku kolejnościowym (colex): Σ C(element, pozycja).
 * Zbiór musi być posortowany rosnąco, elementy z zakresu 0…LICZBA_ROCZNIKOW-1.
 */
function rangaKombinacji(elementy) {
  let ranga = 0n;
  elementy.forEach((element, i) => { ranga += dwumian(element, i + 1); });
  return ranga;
}

/** Odwrotność rangaKombinacji: numer -> posortowany zbiór k elementów. */
function kombinacjaZRangi(ranga, k) {
  const wynik = [];
  let reszta = ranga;
  for (let i = k; i >= 1; i--) {
    let element = i - 1;
    while (dwumian(element + 1, i) <= reszta) element++;
    wynik.push(element);
    reszta -= dwumian(element, i);
  }
  return wynik.reverse();
}

const pamiecSilnia = [1n];

function silnia(n) {
  for (let i = pamiecSilnia.length; i <= n; i++) pamiecSilnia[i] = pamiecSilnia[i - 1] * BigInt(i);
  return pamiecSilnia[n];
}

/** Numer permutacji w porządku leksykograficznym (kod Lehmera). */
function rangaPermutacji(permutacja) {
  const n = permutacja.length;
  const dostepne = Array.from({ length: n }, (_, i) => i);
  let ranga = 0n;
  for (let i = 0; i < n; i++) {
    const pozycja = dostepne.indexOf(permutacja[i]);
    if (pozycja < 0) throw new Error('Klucz odpowiedzi nie jest permutacją roczników.');
    dostepne.splice(pozycja, 1);
    ranga += BigInt(pozycja) * silnia(n - 1 - i);
  }
  return ranga;
}

/** Odwrotność rangaPermutacji. */
function permutacjaZRangi(ranga, n) {
  const dostepne = Array.from({ length: n }, (_, i) => i);
  const wynik = [];
  let reszta = ranga;
  for (let i = 0; i < n; i++) {
    const podstawa = silnia(n - 1 - i);
    const pozycja = Number(reszta / podstawa);
    reszta %= podstawa;
    wynik.push(dostepne[pozycja]);
    dostepne.splice(pozycja, 1);
  }
  return wynik;
}

// ---------------------------------------------------------------- kod pokoju

const BITY_NAGLOWKA = 1 + 4;        // wersja + indeks długości
const BITY_UCIECZKI = 6;            // jawne N, gdy długość jest nietypowa

/**
 * Ile znaków zajmie kod pokoju dla danej liczby utworów.
 * Liczone na bitach, nie na znakach — nagłówek z ucieczką ma 11 bitów, więc
 * zaokrąglanie go osobno do dwóch znaków gubiło jeden bit i zaniżało wynik.
 */
export function dlugoscKoduPokoju(n) {
  const naglowek = BITY_NAGLOWKA + (DLUGOSCI_W_NAGLOWKU.includes(n) ? 0 : BITY_UCIECZKI);
  return Math.ceil((naglowek + bitowNa(dwumian(LICZBA_ROCZNIKOW, n))) / 5);
}

/**
 * Koduje zbiór roczników jako numer kombinacji nad zakresem 1975–2026.
 *
 * Nagłówek to jeden znak: bit wersji + indeks długości gry. Nietypowa liczba
 * utworów (spoza listy w nagłówku) dokłada drugi znak z jawnym N.
 */
export function zakodujKodPokoju(lata, wersja = WERSJA_FORMATU) {
  if (!Array.isArray(lata) || lata.length === 0) throw new Error('Pusta lista roczników.');
  if (lata.length > LICZBA_ROCZNIKOW) throw new Error('Za dużo roczników.');

  const widziane = new Set();
  const indeksy = [];
  for (const rok of lata) {
    if (!Number.isInteger(rok) || rok < ROK_MIN || rok > ROK_MAX) {
      throw new Error(`Rocznik ${rok} jest poza zakresem ${ROK_MIN}–${ROK_MAX}.`);
    }
    if (widziane.has(rok)) throw new Error(`Rocznik ${rok} powtarza się — każdy rok może wystąpić raz.`);
    widziane.add(rok);
    indeksy.push(rok - ROK_MIN);
  }
  indeksy.sort((a, b) => a - b);

  const n = indeksy.length;
  const indeksDlugosci = DLUGOSCI_W_NAGLOWKU.indexOf(n);
  const zapis = new Zapis();
  zapis.dopisz(wersja, 1);
  if (indeksDlugosci >= 0) {
    zapis.dopisz(indeksDlugosci, 4);
  } else {
    zapis.dopisz(UCIECZKA_DLUGOSCI, 4);
    zapis.dopisz(n, 6);
  }
  zapis.dopisz(rangaKombinacji(indeksy), bitowNa(dwumian(LICZBA_ROCZNIKOW, n)));
  return zapis.naBase32();
}

/** Dekoduje kod pokoju do { wersja, lata, liczbaUtworow }. Lata posortowane rosnąco. */
export function odkodujKodPokoju(kod) {
  const czysty = oczysc(kod);
  if (czysty.length < 2) throw new Error('Kod pokoju jest za krótki.');

  const odczyt = new Odczyt(czysty);
  let wersja;
  let n;
  try {
    wersja = Number(odczyt.czytaj(1));
    const indeksDlugosci = Number(odczyt.czytaj(4));
    if (indeksDlugosci === UCIECZKA_DLUGOSCI) {
      n = Number(odczyt.czytaj(6));
    } else {
      n = DLUGOSCI_W_NAGLOWKU[indeksDlugosci];
      if (n === undefined) throw new Error('Kod pokoju jest uszkodzony — sprawdź, czy nie ma literówki.');
    }
  } catch (e) {
    throw new Error(e.message === 'Kod jest niekompletny.' ? 'Kod pokoju jest za krótki.' : e.message);
  }

  if (wersja !== WERSJA_FORMATU) {
    throw new Error(`Kod pochodzi z innej wersji gry (${wersja}). Odśwież stronę na obu urządzeniach.`);
  }
  if (!Number.isInteger(n) || n < 1 || n > LICZBA_ROCZNIKOW) {
    throw new Error('Kod pokoju jest uszkodzony — sprawdź, czy nie ma literówki.');
  }

  const oczekiwana = dlugoscKoduPokoju(n);
  if (czysty.length !== oczekiwana) {
    throw new Error(`Kod pokoju dla ${n} utworów ma ${oczekiwana} znaków, a ten ma ${czysty.length}.`);
  }

  const liczbaKombinacji = dwumian(LICZBA_ROCZNIKOW, n);
  const ranga = odczyt.czytaj(bitowNa(liczbaKombinacji));
  if (ranga >= liczbaKombinacji) {
    throw new Error('Kod pokoju jest uszkodzony — sprawdź, czy nie ma literówki.');
  }

  const lata = kombinacjaZRangi(ranga, n).map((i) => ROK_MIN + i);
  return { wersja, lata, liczbaUtworow: n };
}

// ---------------------------------------------------------------- klucz odpowiedzi

const BITY_WERSJI = 2;
const BITY_LICZBY = 6;
const BITY_SZEROKOSCI = 4;
const BITY_ODCISKU = 16;

/**
 * Klucz odpowiedzi. Sekcja 8 wymaga permutacji „utwór i -> indeks roku"; do tego
 * dokładamy indeks utworu w bazie, bo bez niego ekran wyniku nie ma skąd wziąć
 * tytułów (4.5 pkt 4). Odcisk bazy pozwala wykryć, że telefon gracza wczytał
 * inną wersję songs.json niż laptop hosta — punktacja jest wtedy nadal poprawna,
 * a ukrywamy tylko tytuły.
 *
 * Permutacja idzie jako jeden numer (kod Lehmera), a indeksy utworów na tylu
 * bitach, ile naprawdę potrzeba — szerokość zapisana jest w nagłówku, więc
 * powiększenie bazy w przyszłości nie psuje formatu.
 */
export function zakodujKlucz(przypisania, odciskBazy, wersja = WERSJA_FORMATU) {
  const n = przypisania.length;
  if (n === 0) throw new Error('Pusty klucz odpowiedzi.');
  if (n >= 1 << BITY_LICZBY) throw new Error(`Klucz obsługuje najwyżej ${(1 << BITY_LICZBY) - 1} utworów.`);

  const permutacja = przypisania.map((p, i) => {
    if (!Number.isInteger(p.indeksRoku) || p.indeksRoku < 0 || p.indeksRoku >= n) {
      throw new Error(`Utwór ${i + 1}: indeks roku ${p.indeksRoku} poza zakresem 0–${n - 1}.`);
    }
    return p.indeksRoku;
  });

  const indeksy = przypisania.map((p) => (Number.isInteger(p.indeksWBazie) ? p.indeksWBazie : 0));
  const szerokosc = Math.max(1, bitowNa(BigInt(Math.max(...indeksy) + 1)));
  // W nagłówku siedzi szerokość pomniejszona o 1, więc 4 bity dają zakres 1–16 bitów
  // na indeks, czyli bazę do 65 535 utworów.
  if (szerokosc > (1 << BITY_SZEROKOSCI)) throw new Error('Baza utworów jest za duża dla tego formatu klucza.');

  const zapis = new Zapis();
  zapis.dopisz(wersja, BITY_WERSJI);
  zapis.dopisz(n, BITY_LICZBY);
  zapis.dopisz(szerokosc - 1, BITY_SZEROKOSCI);
  zapis.dopisz(odciskBazy, BITY_ODCISKU);
  zapis.dopisz(rangaPermutacji(permutacja), bitowNa(silnia(n)));
  for (const indeks of indeksy) zapis.dopisz(indeks, szerokosc);
  return zapis.naBase32();
}

/** Dekoduje klucz odpowiedzi. */
export function odkodujKlucz(kod) {
  const czysty = oczysc(kod);
  if (czysty.length < 6) throw new Error('Klucz odpowiedzi jest za krótki.');

  const odczyt = new Odczyt(czysty);
  const niekompletny = () => new Error('Klucz odpowiedzi jest niekompletny — zeskanuj go jeszcze raz.');

  let wersja;
  let n;
  let szerokosc;
  let odciskBazy;
  try {
    wersja = Number(odczyt.czytaj(BITY_WERSJI));
    n = Number(odczyt.czytaj(BITY_LICZBY));
    szerokosc = Number(odczyt.czytaj(BITY_SZEROKOSCI)) + 1;
    odciskBazy = Number(odczyt.czytaj(BITY_ODCISKU));
  } catch {
    throw niekompletny();
  }

  if (wersja !== WERSJA_FORMATU) {
    throw new Error(`Klucz pochodzi z innej wersji gry (${wersja}). Odśwież stronę na obu urządzeniach.`);
  }
  if (n === 0) throw new Error('Klucz odpowiedzi jest pusty.');

  let permutacja;
  const indeksy = [];
  try {
    const ranga = odczyt.czytaj(bitowNa(silnia(n)));
    if (ranga >= silnia(n)) throw niekompletny();
    permutacja = permutacjaZRangi(ranga, n);
    for (let i = 0; i < n; i++) indeksy.push(Number(odczyt.czytaj(szerokosc)));
  } catch {
    throw niekompletny();
  }

  const przypisania = permutacja.map((indeksRoku, i) => ({
    indeksRoku,
    indeksWBazie: indeksy[i],
  }));
  return { wersja, odciskBazy, przypisania };
}

/**
 * Odcisk bazy utworów — 16 bitów wyliczonych z daty wygenerowania i liczby utworów.
 * Nie ma być kryptograficzny, ma tylko wyłapać „host i gracz mają inne songs.json".
 */
export function odciskBazy(baza) {
  const tekst = `${baza.version}|${baza.generatedAt}|${baza.songs.length}`;
  let h = 0x811c;
  for (let i = 0; i < tekst.length; i++) {
    h ^= tekst.charCodeAt(i);
    h = (h * 0x0193) & 0xffff;
  }
  return h;
}
