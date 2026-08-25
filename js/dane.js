/**
 * dane.js — wczytanie bazy utworów i pytania o dostępność roczników.
 *
 * Baza to statyczny JSON w repozytorium (D5). Gra nigdy nie odpytuje iTunes
 * w trakcie rozgrywki (D6) — jedyne, co leci do Apple, to samo odtworzenie
 * fragmentu spod gotowego previewUrl.
 */

import { ROK_MIN, ROK_MAX } from './kody.js';

export const REPERTUARY = {
  // `opis` to forma do wstawienia w zdanie „dla repertuaru ..." — sama etykieta
  // z listy rozwijanej brzmiałaby w komunikacie o błędzie nienaturalnie.
  swiat: { etykieta: 'Świat', opis: 'światowego', tagi: ['swiat'] },
  mix: { etykieta: 'Mix', opis: 'mieszanego', tagi: ['swiat', 'pl'] },
  pl: { etykieta: 'Polska', opis: 'polskiego', tagi: ['pl'] },
};

export const LICZBY_UTWOROW = [10, 15, 20, 25, 30, 35, 40];

/**
 * Podpis utworu dla ekranu prowadzącego — używany tylko wtedy, gdy prowadzący
 * świadomie włączył podgląd w konfiguracji.
 *
 * Zwraca `null`, gdy oba przełączniki są wyłączone. To celowe: wywołujący ma
 * wtedy nie dotykać DOM-u w ogóle, żeby przy domyślnych ustawieniach żadne
 * metadane nie trafiły do dokumentu (7.1).
 *
 * Rok NIE jest pokazywany nigdy — to jest odpowiedź, a nie podpowiedź.
 */
export function opisUtworu(utwor, { pokazTytul = false, pokazWykonawce = false } = {}) {
  if (!utwor || (!pokazTytul && !pokazWykonawce)) return null;
  const czesci = [];
  if (pokazTytul) czesci.push(utwor.tytul);
  if (pokazWykonawce) czesci.push(utwor.wykonawca);
  return czesci.filter(Boolean).join(' — ') || null;
}

let bazaWPamieci = null;

/** Wczytuje data/songs.json. Wynik jest zapamiętywany na czas życia strony. */
export async function wczytajBaze(sciezka = 'data/songs.json') {
  if (bazaWPamieci) return bazaWPamieci;

  let odp;
  try {
    odp = await fetch(sciezka, { cache: 'no-cache' });
  } catch (e) {
    throw new Error(`Nie udało się wczytać bazy utworów (${e.message}). Sprawdź połączenie i odśwież stronę.`);
  }
  if (!odp.ok) throw new Error(`Nie udało się wczytać bazy utworów: HTTP ${odp.status}.`);

  const baza = await odp.json();
  if (!baza || !Array.isArray(baza.songs) || baza.songs.length === 0) {
    throw new Error('Baza utworów jest pusta lub uszkodzona. Uruchom scripts/enrich.mjs.');
  }
  // Indeks w bazie jest tym, co wędruje w kluczu odpowiedzi — musi być stabilny
  // przez całą rozgrywkę, więc przypisujemy go raz, przy wczytaniu.
  baza.songs.forEach((u, i) => { u.indeksWBazie = i; });
  bazaWPamieci = baza;
  return baza;
}

/** Tylko do testów — pozwala podstawić bazę bez sieci. */
export function ustawBaze(baza) {
  if (baza) baza.songs.forEach((u, i) => { u.indeksWBazie = i; });
  bazaWPamieci = baza;
  return baza;
}

/** Utwory pasujące do repertuaru i mieszczące się w zakresie lat. */
export function filtruj(songs, { od, doRoku, repertuar }) {
  const tagi = (REPERTUARY[repertuar] || REPERTUARY.mix).tagi;
  return songs.filter((u) => u.rok >= od && u.rok <= doRoku && tagi.includes(u.tag));
}

/**
 * Roczniki, które mają co najmniej jeden utwór po filtrze repertuaru (4.1 pkt 2).
 * To one — a nie szerokość przedziału — ograniczają liczbę utworów w grze.
 */
export function dostepneRoczniki(songs, opcje) {
  const zbior = new Set();
  for (const u of filtruj(songs, opcje)) zbior.add(u.rok);
  return [...zbior].sort((a, b) => a - b);
}

/** Mapa rok -> lista utworów, gotowa do losowania. */
export function pogrupujPoRocznikach(songs, opcje) {
  const mapa = new Map();
  for (const u of filtruj(songs, opcje)) {
    if (!mapa.has(u.rok)) mapa.set(u.rok, []);
    mapa.get(u.rok).push(u);
  }
  return mapa;
}

/**
 * Walidacja konfiguracji hosta (4.1). Kolejność sprawdzeń jest istotna:
 * najpierw sensowność zakresu, dopiero potem policzenie roczników.
 */
export function sprawdzKonfiguracje(songs, { od, doRoku, repertuar, liczbaUtworow }) {
  if (!Number.isInteger(od) || !Number.isInteger(doRoku)) {
    return { ok: false, komunikat: 'Podaj oba lata — początkowy i końcowy.', roczniki: [] };
  }
  if (od < ROK_MIN || doRoku > ROK_MAX) {
    return { ok: false, komunikat: `Zakres lat musi mieścić się w ${ROK_MIN}–${ROK_MAX}.`, roczniki: [] };
  }
  if (doRoku < od) {
    return {
      ok: false,
      komunikat: `Rok końcowy (${doRoku}) jest wcześniejszy niż początkowy (${od}). Zamień je miejscami.`,
      roczniki: [],
    };
  }

  const roczniki = dostepneRoczniki(songs, { od, doRoku, repertuar });
  const nazwa = (REPERTUARY[repertuar] || REPERTUARY.mix).opis;

  if (roczniki.length === 0) {
    return {
      ok: false,
      komunikat: `Dla repertuaru ${nazwa} w latach ${od}–${doRoku} nie mam ani jednego utworu. Poszerz zakres lat albo zmień repertuar.`,
      roczniki,
    };
  }

  if (liczbaUtworow > roczniki.length) {
    // Podpowiadamy największą wartość, którą host faktycznie może wybrać
    // z listy 10–40 co 5 — sam licznik roczników bywa nieosiągalny.
    const osiagalne = LICZBY_UTWOROW.filter((n) => n <= roczniki.length);
    const wyjscie = osiagalne.length
      ? `Wybierz maksymalnie ${osiagalne[osiagalne.length - 1]} utworów albo poszerz zakres lat.`
      : `Gra wymaga co najmniej ${LICZBY_UTWOROW[0]} roczników. Poszerz zakres lat albo zmień repertuar.`;
    return {
      ok: false,
      komunikat: `Dla repertuaru ${nazwa} w latach ${od}–${doRoku} mam utwory z ${roczniki.length} roczników. ${wyjscie}`,
      roczniki,
    };
  }

  return { ok: true, komunikat: '', roczniki };
}
