/**
 * kody.js — kodowanie i dekodowanie kodów przenoszonych między urządzeniami (sekcja 8).
 *
 * Dwa kody:
 *   1. KOD POKOJU — host -> gracze, na starcie. Ludzie go przepisują z ekranu,
 *      więc musi być krótki. Zawiera wyłącznie wersję formatu i zbiór roczników;
 *      NIE zawiera odpowiedzi (4.3).
 *   2. KLUCZ ODPOWIEDZI — host -> gracze, po ostatnim utworze. Idzie przez QR,
 *      więc może być długi.
 *
 * Alfabet base32 w wariancie Crockforda: bez I, L, O i U, żeby nie mylić znaków
 * przy przepisywaniu z ekranu.
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
export const LICZBA_ROCZNIKOW = ROK_MAX - ROK_MIN + 1;   // 52 bity maski
export const WERSJA_FORMATU = 1;

const DLUGOSC_KODU_POKOJU = 11;   // 3 bity wersji + 52 bity maski = 55 bitów = 11 znaków

/** Usuwa spacje i myślniki, ujednolica wielkość liter. */
export function oczysc(tekst) {
  return String(tekst || '').toUpperCase().replace(/[\s-]+/g, '');
}

// ---------------------------------------------------------------- base32

/** BigInt -> base32 o zadanej liczbie znaków (uzupełnia zerami z lewej). */
function bigIntNaBase32(wartosc, znakow) {
  let v = wartosc;
  let out = '';
  for (let i = 0; i < znakow; i++) {
    out = ALFABET[Number(v & 31n)] + out;
    v >>= 5n;
  }
  return out;
}

/** base32 -> BigInt. Rzuca, jeśli trafi na znak spoza alfabetu. */
function base32NaBigInt(tekst) {
  let v = 0n;
  for (const znak of tekst) {
    if (!WARTOSCI.has(znak)) throw new Error(`Nieznany znak w kodzie: "${znak}"`);
    v = (v << 5n) | BigInt(WARTOSCI.get(znak));
  }
  return v;
}

/** Bajty -> base32 (5 bitów na znak, dopełnienie zerami na końcu). */
function bajtyNaBase32(bajty) {
  let bufor = 0;
  let bitow = 0;
  let out = '';
  for (const b of bajty) {
    bufor = (bufor << 8) | b;
    bitow += 8;
    while (bitow >= 5) {
      out += ALFABET[(bufor >> (bitow - 5)) & 31];
      bitow -= 5;
    }
  }
  if (bitow > 0) out += ALFABET[(bufor << (5 - bitow)) & 31];
  return out;
}

/** base32 -> bajty. Bity dopełnienia z końca są odrzucane. */
function base32NaBajty(tekst) {
  let bufor = 0;
  let bitow = 0;
  const out = [];
  for (const znak of tekst) {
    if (!WARTOSCI.has(znak)) throw new Error(`Nieznany znak w kodzie: "${znak}"`);
    bufor = (bufor << 5) | WARTOSCI.get(znak);
    bitow += 5;
    if (bitow >= 8) {
      out.push((bufor >> (bitow - 8)) & 255);
      bitow -= 8;
    }
  }
  return Uint8Array.from(out);
}

// ---------------------------------------------------------------- kod pokoju

/**
 * Koduje zbiór roczników jako 52-bitową maskę nad zakresem 1975–2026.
 *
 * Liczba utworów NIE jest zapisywana osobno — w tej grze każdy rok jest użyty
 * dokładnie raz, więc liczba zapalonych bitów maski jest liczbą utworów.
 */
export function zakodujKodPokoju(lata, wersja = WERSJA_FORMATU) {
  if (!Array.isArray(lata) || lata.length === 0) throw new Error('Pusta lista roczników.');
  let maska = 0n;
  for (const rok of lata) {
    if (!Number.isInteger(rok) || rok < ROK_MIN || rok > ROK_MAX) {
      throw new Error(`Rocznik ${rok} jest poza zakresem ${ROK_MIN}–${ROK_MAX}.`);
    }
    const bit = 1n << BigInt(rok - ROK_MIN);
    if (maska & bit) throw new Error(`Rocznik ${rok} powtarza się — każdy rok może wystąpić raz.`);
    maska |= bit;
  }
  const wartosc = (BigInt(wersja) << BigInt(LICZBA_ROCZNIKOW)) | maska;
  return bigIntNaBase32(wartosc, DLUGOSC_KODU_POKOJU);
}

/** Dekoduje kod pokoju do { wersja, lata, liczbaUtworow }. Lata posortowane rosnąco. */
export function odkodujKodPokoju(kod) {
  const czysty = oczysc(kod);
  if (czysty.length !== DLUGOSC_KODU_POKOJU) {
    throw new Error(`Kod pokoju ma ${DLUGOSC_KODU_POKOJU} znaków, a ten ma ${czysty.length}.`);
  }
  const wartosc = base32NaBigInt(czysty);
  const maska = wartosc & ((1n << BigInt(LICZBA_ROCZNIKOW)) - 1n);
  const wersja = Number(wartosc >> BigInt(LICZBA_ROCZNIKOW));
  if (wersja !== WERSJA_FORMATU) {
    throw new Error(`Kod pochodzi z innej wersji gry (${wersja}). Odśwież stronę na obu urządzeniach.`);
  }
  const lata = [];
  for (let i = 0; i < LICZBA_ROCZNIKOW; i++) {
    if (maska & (1n << BigInt(i))) lata.push(ROK_MIN + i);
  }
  if (!lata.length) throw new Error('Kod nie zawiera żadnego rocznika.');
  return { wersja, lata, liczbaUtworow: lata.length };
}

// ---------------------------------------------------------------- klucz odpowiedzi

/**
 * Klucz odpowiedzi. Sekcja 8 wymaga permutacji „utwór i -> indeks roku"; do tego
 * dokładamy indeks utworu w bazie, bo bez niego ekran wyniku nie ma skąd wziąć
 * tytułów (4.5 pkt 4). Odcisk bazy pozwala wykryć, że telefon gracza wczytał
 * inną wersję songs.json niż laptop hosta — punktacja jest wtedy nadal poprawna,
 * a ukrywamy tylko tytuły.
 *
 * Układ bajtów:
 *   0        wersja formatu
 *   1        N (liczba utworów)
 *   2..3     odcisk bazy (uint16)
 *   4..      dla każdego utworu: indeks roku (uint8) + indeks w bazie (uint16 BE)
 */
export function zakodujKlucz(przypisania, odciskBazy, wersja = WERSJA_FORMATU) {
  const n = przypisania.length;
  if (n === 0) throw new Error('Pusty klucz odpowiedzi.');
  if (n > 255) throw new Error('Klucz obsługuje najwyżej 255 utworów.');

  const bajty = new Uint8Array(4 + n * 3);
  bajty[0] = wersja;
  bajty[1] = n;
  bajty[2] = (odciskBazy >> 8) & 255;
  bajty[3] = odciskBazy & 255;

  przypisania.forEach((p, i) => {
    if (!Number.isInteger(p.indeksRoku) || p.indeksRoku < 0 || p.indeksRoku >= n) {
      throw new Error(`Utwór ${i + 1}: indeks roku ${p.indeksRoku} poza zakresem 0–${n - 1}.`);
    }
    const idx = Number.isInteger(p.indeksWBazie) ? p.indeksWBazie : 0xffff;
    bajty[4 + i * 3] = p.indeksRoku;
    bajty[5 + i * 3] = (idx >> 8) & 255;
    bajty[6 + i * 3] = idx & 255;
  });

  return bajtyNaBase32(bajty);
}

/** Dekoduje klucz odpowiedzi. */
export function odkodujKlucz(kod) {
  const czysty = oczysc(kod);
  if (czysty.length < 8) throw new Error('Klucz odpowiedzi jest za krótki.');
  const bajty = base32NaBajty(czysty);
  if (bajty.length < 4) throw new Error('Klucz odpowiedzi jest uszkodzony.');

  const wersja = bajty[0];
  if (wersja !== WERSJA_FORMATU) {
    throw new Error(`Klucz pochodzi z innej wersji gry (${wersja}). Odśwież stronę na obu urządzeniach.`);
  }
  const n = bajty[1];
  const odciskBazy = (bajty[2] << 8) | bajty[3];
  if (bajty.length < 4 + n * 3) throw new Error('Klucz odpowiedzi jest niekompletny — zeskanuj go jeszcze raz.');

  const przypisania = [];
  for (let i = 0; i < n; i++) {
    const indeksWBazie = (bajty[5 + i * 3] << 8) | bajty[6 + i * 3];
    przypisania.push({
      indeksRoku: bajty[4 + i * 3],
      indeksWBazie: indeksWBazie === 0xffff ? null : indeksWBazie,
    });
  }
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
