/**
 * magazyn.js — trwały stan w localStorage (D2).
 *
 * Stan gracza kluczowany jest kodem pokoju, więc przeładowanie strony w środku
 * gry nie kasuje odpowiedzi, a dwie różne rozgrywki nie mieszają się ze sobą.
 *
 * Stan hosta trzymamy z tego samego powodu: gdyby laptop odświeżył stronę,
 * bez zapisu przepadłby klucz odpowiedzi i impreza kończyłaby się w połowie.
 * Kompromis nr 7 z sekcji 9 i tak zakłada, że host ma klucz w przeglądarce.
 */

const PRZEDROSTEK = 'muzycznyRok:v1';

function dostepny() {
  try {
    const probny = `${PRZEDROSTEK}:test`;
    localStorage.setItem(probny, '1');
    localStorage.removeItem(probny);
    return true;
  } catch {
    return false;   // tryb prywatny albo zablokowane ciasteczka
  }
}

export const magazynDostepny = dostepny();

function odczytaj(klucz) {
  if (!magazynDostepny) return null;
  try {
    const tekst = localStorage.getItem(klucz);
    return tekst ? JSON.parse(tekst) : null;
  } catch {
    return null;
  }
}

function zapisz(klucz, wartosc) {
  if (!magazynDostepny) return false;
  try {
    localStorage.setItem(klucz, JSON.stringify(wartosc));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- gracz

const kluczGracza = (kodPokoju) => `${PRZEDROSTEK}:gracz:${kodPokoju}`;

/**
 * Pusty arkusz gracza.
 * odpowiedzi[i] — indeks rocznika przypisany utworowi i, albo null (pominięty).
 * zatwierdzone[i] — czy utwór i został już nieodwracalnie zatwierdzony (4.4 pkt 5).
 */
export function pustyStanGracza(kodPokoju, liczbaUtworow) {
  return {
    kodPokoju,
    imie: '',
    liczbaUtworow,
    odpowiedzi: new Array(liczbaUtworow).fill(null),
    zatwierdzone: new Array(liczbaUtworow).fill(false),
    biezacy: 0,
    zakonczonoO: null,
    kodKlucza: null,
  };
}

export function wczytajStanGracza(kodPokoju, liczbaUtworow) {
  const stan = odczytaj(kluczGracza(kodPokoju));
  if (!stan || stan.liczbaUtworow !== liczbaUtworow) return null;
  // Zapisane tablice mogą pochodzić ze starszego zapisu — przycinamy do rozmiaru.
  stan.odpowiedzi = Array.from({ length: liczbaUtworow }, (_, i) => stan.odpowiedzi?.[i] ?? null);
  stan.zatwierdzone = Array.from({ length: liczbaUtworow }, (_, i) => !!stan.zatwierdzone?.[i]);
  return stan;
}

export function zapiszStanGracza(stan) {
  return zapisz(kluczGracza(stan.kodPokoju), stan);
}

export function skasujStanGracza(kodPokoju) {
  if (magazynDostepny) localStorage.removeItem(kluczGracza(kodPokoju));
}

// ---------------------------------------------------------------- host

const KLUCZ_HOSTA = `${PRZEDROSTEK}:host`;

export function wczytajStanHosta() {
  return odczytaj(KLUCZ_HOSTA);
}

export function zapiszStanHosta(stan) {
  return zapisz(KLUCZ_HOSTA, stan);
}

export function skasujStanHosta() {
  if (magazynDostepny) localStorage.removeItem(KLUCZ_HOSTA);
}
