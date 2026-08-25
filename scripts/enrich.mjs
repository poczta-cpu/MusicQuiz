#!/usr/bin/env node
/**
 * enrich.mjs — scala kandydatów z data/candidates/ i wzbogaca ich o previewUrl z iTunes.
 *
 * Użycie:
 *   node scripts/enrich.mjs                  pełne przetworzenie -> data/songs.json
 *   node scripts/enrich.mjs --refresh        odświeża same previewUrl w istniejącym songs.json
 *   node scripts/enrich.mjs --verify-years   dodatkowo sprawdza rok w MusicBrainz (1 zap./s)
 *   node scripts/enrich.mjs --limit 20       tylko N pierwszych wpisów (do testów)
 *   node scripts/enrich.mjs --concurrency 2  równoległość zapytań do iTunes (domyślnie 2)
 *
 * D6: iTunes służy WYŁĄCZNIE do pobrania previewUrl. releaseDate jest ignorowane —
 * rok jest odpowiedzią w grze i pochodzi z ręcznie skuratorowanej bazy kandydatów.
 */

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR_CANDIDATES = path.join(ROOT, 'data', 'candidates');
const FILE_SONGS = path.join(ROOT, 'data', 'songs.json');
const FILE_REJECTED = path.join(ROOT, 'data', 'rejected.json');
const FILE_CONFLICTS = path.join(ROOT, 'data', 'year-conflicts.json');
const FILE_CACHE = path.join(ROOT, 'data', '.itunes-cache.json');

const KONTAKT = 'poczta.dokumentacja@gmail.com';
const UA_MUSICBRAINZ = `MuzycznyRok/1.0 ( ${KONTAKT} )`;
// Naglowki HTTP musza byc czystym ASCII — bez polskich znakow.
const UA_ITUNES = 'MuzycznyRok/1.0 (song database build script)';
const MB_ODSTEP_MS = 1100;          // maks. 1 zapytanie na sekundę, z zapasem
const PROG_DOPASOWANIA = 0.55;      // minimalny wynik podobieństwa, żeby uznać trafienie

const ZAKRES_OD = 1975;
const ZAKRES_DO = 2026;

// ---------------------------------------------------------------- argumenty

const HELP = [
  'Kalendarz muzyczny — wzbogacanie bazy utworów',
  '',
  '  node scripts/enrich.mjs [--refresh] [--verify-years] [--limit N] [--concurrency N]',
  '',
  '  --refresh        odśwież tylko previewUrl w istniejącym data/songs.json',
  '  --verify-years   zweryfikuj roczniki w MusicBrainz (sekwencyjnie, 1 zap./s)',
  '  --limit N        przetwórz tylko N pierwszych wpisów (test)',
  '  --concurrency N  równoległość zapytań do iTunes (domyślnie 2)',
  '  --offline        zbuduj bazę z samego cache, bez ani jednego zapytania do iTunes',
].join('\n');

function parseArgs(argv) {
  const a = { refresh: false, verifyYears: false, limit: 0, concurrency: 2, offline: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--refresh') a.refresh = true;
    else if (v === '--offline') a.offline = true;
    else if (v === '--verify-years') a.verifyYears = true;
    else if (v === '--limit') a.limit = Number(argv[++i]) || 0;
    else if (v === '--concurrency') a.concurrency = Math.max(1, Number(argv[++i]) || 4);
    else if (v === '--help' || v === '-h') { console.log(HELP); process.exit(0); }
    else { console.error(`Nieznany argument: ${v}`); process.exit(2); }
  }
  return a;
}

// ---------------------------------------------------------------- pomocnicze

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Usuwa znaki diakrytyczne i sprowadza do małych liter. */
function bezOgonkow(s) {
  return String(s)
    .replace(/\u0142/g, 'l')
    .replace(/\u0141/g, 'L')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Klucz porównawczy: bez ogonków, bez interpunkcji, pojedyncze spacje. */
function normalizuj(s) {
  return bezOgonkow(s).replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Obcina dopiski wydawnicze, które psują dopasowanie:
 * "(Remastered 2011)", "- Live", "[Radio Edit]", "feat. X".
 */
function rdzenTytulu(s) {
  const bezNawiasow = String(s)
    .replace(/\s*[([][^)\]]*[)\]]/g, ' ')
    .replace(/\s+-\s+(remaster|remastered|live|radio edit|single version|album version|mono|stereo).*$/i, ' ')
    .replace(/\s+(feat|ft|featuring)\.?\s+.*$/i, ' ');
  return normalizuj(bezNawiasow);
}

/** Identyfikator utworu, np. "1985-aha-take-on-me". */
function zbudujId(rok, wykonawca, tytul) {
  const czesc = (s) => bezOgonkow(s)
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
    .join('-');
  return `${rok}-${czesc(wykonawca)}-${czesc(rdzenTytulu(tytul) || tytul)}`;
}

/** Współczynnik Dice'a na bigramach — odporny na literówki i drobne różnice zapisu. */
function podobienstwo(a, b) {
  const x = normalizuj(a);
  const y = normalizuj(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const bigramy = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const ma = bigramy(x);
  const mb = bigramy(y);
  let wspolne = 0;
  let sumA = 0;
  let sumB = 0;
  for (const v of ma.values()) sumA += v;
  for (const v of mb.values()) sumB += v;
  for (const [g, v] of ma) if (mb.has(g)) wspolne += Math.min(v, mb.get(g));
  return (2 * wspolne) / (sumA + sumB || 1);
}

/**
 * Jedno zapytanie HTTPS na świeżym połączeniu.
 *
 * Świadomie NIE używamy tu fetch(). Przy kilkuset zapytaniach pod rząd Apple
 * przestaje odpowiadać na współdzielonym połączeniu keep-alive, nie zamykając
 * go — pula undici stoi wtedy na martwym gnieździe aż do timeoutu i cały skrypt
 * zwalnia do jednego wpisu na minutę. `agent: false` daje nowe połączenie na
 * każde zapytanie: przy odstępie rzędu sekundy to żaden koszt, a problem znika.
 */
function zapytajJson(url, naglowki = {}, limitCzasuMs = 10000) {
  return new Promise((resolve) => {
    const zadanie = https.request(
      url,
      { method: 'GET', agent: false, headers: { Accept: 'application/json', ...naglowki } },
      (odp) => {
        const kawalki = [];
        odp.on('data', (k) => kawalki.push(k));
        odp.on('end', () => {
          const status = odp.statusCode;
          const tresc = Buffer.concat(kawalki).toString('utf8');
          if (status < 200 || status >= 300) return resolve({ ok: false, status, blad: `HTTP ${status}` });
          try {
            resolve({ ok: true, status, dane: JSON.parse(tresc) });
          } catch {
            resolve({ ok: false, status, blad: 'odpowiedź nie jest poprawnym JSON-em' });
          }
        });
      }
    );
    zadanie.setTimeout(limitCzasuMs, () => {
      zadanie.destroy(new Error(`timeout ${limitCzasuMs / 1000} s`));
    });
    zadanie.on('error', (e) => resolve({ ok: false, status: 0, blad: e.message }));
    zadanie.end();
  });
}

/** Zapytanie z ponowieniami i wykładniczym odczekaniem (429 / 5xx / błąd sieci). */
async function pobierz(url, naglowki = {}, proby = 4) {
  let ostatniBlad = 'nieznany błąd';
  for (let i = 0; i < proby; i++) {
    const odp = await zapytajJson(url, naglowki);
    if (odp.ok) return odp;
    ostatniBlad = odp.blad;
    if (odp.status === 429 || odp.status >= 500 || odp.status === 0) {
      await sleep(1000 * 2 ** i);
      continue;
    }
    return { ok: false, blad: odp.blad };
  }
  return { ok: false, blad: ostatniBlad };
}

// ---------------------------------------------------------------- tempo iTunes

/**
 * iTunes Search API nie ma klucza, ale ma limit zapytań i sygnalizuje jego
 * przekroczenie zarówno przez 429, jak i przez 403. Bez regulatora tempa całe
 * 400 wpisów odbija się od ściany. Regulator jest wspólny dla wszystkich
 * robotników: rozsuwa zapytania w czasie, a po odbiciu zatrzymuje je wszystkie
 * na rosnącą chwilę i zwalnia stałe tempo.
 */
const PROG_BLOKADY = 20;            // tyle odbić z rzędu bez jednego sukcesu = poddajemy się

class BlokadaItunes extends Error {}

const tempo = {
  odstepMs: 1200,
  minOdstep: 1000,
  maxOdstep: 8000,
  nastepneOkno: 0,
  pauzaDo: 0,
  kara: 10000,
  ostatniaKara: 0,
  odbicia: 0,
  zRzedu: 0,
};

async function bramka() {
  if (tempo.zRzedu >= PROG_BLOKADY) {
    throw new BlokadaItunes(`iTunes odrzucił ${tempo.zRzedu} zapytań z rzędu — blokada po stronie API.`);
  }
  for (;;) {
    const teraz = Date.now();
    const czekaj = Math.max(tempo.pauzaDo - teraz, tempo.nastepneOkno - teraz);
    if (czekaj <= 0) break;
    await sleep(czekaj);
  }
  // Ustawienie okna jest synchroniczne względem sprawdzenia powyżej, więc dwaj
  // robotnicy nie przejdą przez bramkę w tym samym oknie.
  tempo.nastepneOkno = Date.now() + tempo.odstepMs;
}

function zglosOdbicie() {
  tempo.odbicia++;
  tempo.zRzedu++;
  const teraz = Date.now();
  tempo.odstepMs = Math.min(tempo.maxOdstep, Math.round(tempo.odstepMs * 1.6) + 100);
  // Kara rośnie tylko raz na serię — inaczej lawina równoległych 403 wywindowałaby ją do maksimum.
  if (teraz - tempo.ostatniaKara > 5000) {
    tempo.kara = Math.min(60000, tempo.kara * 2);
    tempo.ostatniaKara = teraz;
  }
  tempo.pauzaDo = Math.max(tempo.pauzaDo, teraz + tempo.kara);
}

function zglosSukces() {
  tempo.zRzedu = 0;
  tempo.kara = 10000;
  tempo.odstepMs = Math.max(tempo.minOdstep, Math.round(tempo.odstepMs * 0.95));
}

/** Zapytanie do iTunes przez bramkę tempa, z ponowieniami przy 403/429/5xx. */
async function pobierzItunes(url) {
  let ostatniBlad = 'nieznany błąd';
  for (let proba = 0; proba < 5; proba++) {
    await bramka();                                // rzuca BlokadaItunes, gdy zadziała bezpiecznik
    const odp = await zapytajJson(url, { 'User-Agent': UA_ITUNES });
    if (odp.ok) {
      zglosSukces();
      return odp;
    }
    ostatniBlad = odp.blad;
    // 403 jest u Apple sygnałem przekroczenia limitu, nie odmową dostępu.
    if (odp.status === 403 || odp.status === 429 || odp.status >= 500) {
      zglosOdbicie();
      continue;
    }
    if (odp.status === 0) {                        // zerwane połączenie albo timeout
      await sleep(800 * 2 ** proba);
      continue;
    }
    return { ok: false, blad: odp.blad };
  }
  return { ok: false, blad: ostatniBlad };
}

// ---------------------------------------------------------------- cache iTunes

/**
 * Odpowiedzi iTunes trafiają na dysk, żeby ponowne uruchomienie po odbiciu się
 * od limitu nie zaczynało od zera. Cache jest artefaktem budowania — nie wchodzi do repo.
 */
const cache = new Map();
let cacheDoZapisu = 0;

/** Ustawiany w main; szukajWSklepie musi go widziec, a nie dostaje argumentow. */
const TRYB_OFFLINE = { wlaczony: false };

async function wczytajCache() {
  if (!existsSync(FILE_CACHE)) return;
  try {
    const dane = JSON.parse(await readFile(FILE_CACHE, 'utf8'));
    for (const [k, v] of Object.entries(dane)) cache.set(k, v);
  } catch {
    // Uszkodzony cache to nie powód do przerywania — po prostu zaczynamy od nowa.
  }
}

async function zapiszCache(wymus = false) {
  if (!wymus && cacheDoZapisu < 25) return;
  cacheDoZapisu = 0;
  await writeFile(FILE_CACHE, JSON.stringify(Object.fromEntries(cache)), 'utf8');
}

// ---------------------------------------------------------------- iTunes

/**
 * Ocenia kandydata z iTunes względem wpisu z bazy.
 * Wynik = 0.45 * wykonawca + 0.55 * tytuł, z premią za dokładne trafienie rdzenia.
 */
function ocenTrafienie(wpis, wynik) {
  const simArtysta = podobienstwo(wpis.wykonawca, wynik.artistName || '');
  const tytulSzukany = rdzenTytulu(wpis.tytul);
  const tytulZnaleziony = rdzenTytulu(wynik.trackName || '');
  let simTytul = podobienstwo(tytulSzukany, tytulZnaleziony);
  if (tytulSzukany && tytulSzukany === tytulZnaleziony) simTytul = 1;
  return 0.45 * simArtysta + 0.55 * simTytul;
}

/** Odpytuje jeden sklep iTunes i zwraca najlepiej dopasowany wynik z previewUrl. */
async function szukajWSklepie(wpis, kraj, pomijajCache = false) {
  const fraza = `${wpis.wykonawca} ${wpis.tytul}`;
  const kluczCache = `${kraj}|${normalizuj(fraza)}`;
  let wyniki = pomijajCache ? null : cache.get(kluczCache);

  if (!wyniki && TRYB_OFFLINE.wlaczony) {
    // Bez sieci: czego nie ma w cache, tego nie ma w ogole.
    return { blad: 'brak w cache (tryb offline)' };
  }

  if (!wyniki) {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(fraza)}&entity=song&limit=5&country=${kraj}`;
    const odp = await pobierzItunes(url);
    if (!odp.ok) return { blad: odp.blad };
    // Do cache'u trafia tylko to, czego skrypt naprawdę używa.
    wyniki = ((odp.dane && odp.dane.results) || []).map((w) => ({
      artistName: w.artistName,
      trackName: w.trackName,
      previewUrl: w.previewUrl,
      trackId: w.trackId,
    }));
    cache.set(kluczCache, wyniki);
    cacheDoZapisu++;
    await zapiszCache();
  }

  let najlepszy = null;
  let najlepszaOcena = 0;
  for (const w of wyniki) {
    if (!w.previewUrl) continue;           // bez fragmentu wpis jest bezużyteczny
    const ocena = ocenTrafienie(wpis, w);
    if (ocena > najlepszaOcena) {
      najlepszaOcena = ocena;
      najlepszy = w;
    }
  }
  return { najlepszy, ocena: najlepszaOcena, liczbaWynikow: wyniki.length };
}

/**
 * Szuka previewUrl dla jednego wpisu. Utwory polskie pyta najpierw w sklepie PL —
 * spora ich część nie istnieje w katalogu amerykańskim.
 */
async function znajdzPreview(wpis, pomijajCache = false) {
  const sklepy = wpis.tag === 'pl' ? ['PL', 'US'] : ['US', 'PL'];
  let najlepszy = null;
  let najlepszaOcena = 0;
  const bledy = [];
  let bylyWyniki = false;

  for (const kraj of sklepy) {
    const r = await szukajWSklepie(wpis, kraj, pomijajCache);
    if (r.blad) { bledy.push(`${kraj}: ${r.blad}`); continue; }
    if (r.liczbaWynikow > 0) bylyWyniki = true;
    if (r.ocena > najlepszaOcena) { najlepszaOcena = r.ocena; najlepszy = r.najlepszy; }
    if (najlepszaOcena >= 0.9) break;      // dopasowanie pewne, nie ma po co pytać dalej
  }

  if (najlepszy && najlepszaOcena >= PROG_DOPASOWANIA) {
    return {
      ok: true,
      previewUrl: najlepszy.previewUrl,
      itunesTrackId: najlepszy.trackId,
      ocena: Number(najlepszaOcena.toFixed(3)),
      dopasowanoDo: `${najlepszy.artistName} — ${najlepszy.trackName}`,
    };
  }
  if (bledy.length && !bylyWyniki) return { ok: false, powod: `błąd sieci (${bledy.join('; ')})` };
  if (!bylyWyniki) return { ok: false, powod: 'iTunes nie zwrócił żadnych wyników' };
  if (!najlepszy) return { ok: false, powod: 'żaden wynik nie ma previewUrl' };
  return {
    ok: false,
    powod: `najlepsze dopasowanie zbyt słabe (${najlepszaOcena.toFixed(2)} < ${PROG_DOPASOWANIA})`,
    dopasowanoDo: `${najlepszy.artistName} — ${najlepszy.trackName}`,
  };
}

// ---------------------------------------------------------------- MusicBrainz

/**
 * Sprawdza pierwszy rok wydania w MusicBrainz. Sekwencyjnie, 1 zapytanie na sekundę,
 * z nagłówkiem User-Agent zawierającym kontakt — bez niego serwis odpowiada 403.
 */
async function sprawdzRok(wpis) {
  const czysty = (s) => String(s).replace(/["\\]/g, '');
  const q = `recording:"${czysty(wpis.tytul)}" AND artist:"${czysty(wpis.wykonawca)}"`;
  const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(q)}&fmt=json&limit=5`;
  const odp = await pobierz(url, { 'User-Agent': UA_MUSICBRAINZ }, 3);
  if (!odp.ok) return { ok: false, powod: odp.blad };

  const nagrania = (odp.dane && odp.dane.recordings) || [];
  let najwczesniejszy = null;
  for (const n of nagrania) {
    if ((n.score || 0) < 85) continue;
    const artysta = (n['artist-credit'] || []).map((c) => c.name).join(' ');
    if (ocenTrafienie(wpis, { artistName: artysta, trackName: n.title }) < PROG_DOPASOWANIA) continue;
    const rok = Number(String(n['first-release-date'] || '').slice(0, 4));
    if (!rok) continue;
    if (najwczesniejszy === null || rok < najwczesniejszy) najwczesniejszy = rok;
  }
  if (najwczesniejszy === null) return { ok: false, powod: 'brak wiarygodnego dopasowania w MusicBrainz' };
  return { ok: true, rok: najwczesniejszy };
}

// ---------------------------------------------------------------- wczytywanie

async function wczytajKandydatow() {
  if (!existsSync(DIR_CANDIDATES)) {
    throw new Error(`Brak katalogu ${DIR_CANDIDATES} — nie ma czego scalać.`);
  }
  const pliki = (await readdir(DIR_CANDIDATES)).filter((f) => f.endsWith('.json')).sort();
  if (!pliki.length) throw new Error(`Katalog ${DIR_CANDIDATES} nie zawiera plików .json.`);

  const wszystkie = [];
  const widziane = new Map();
  const duplikaty = [];
  const niepoprawne = [];

  for (const plik of pliki) {
    const tresc = JSON.parse(await readFile(path.join(DIR_CANDIDATES, plik), 'utf8'));
    if (!Array.isArray(tresc)) throw new Error(`${plik}: oczekiwano tablicy obiektów.`);
    for (const [i, wpis] of tresc.entries()) {
      const gdzie = `${plik}[${i}]`;
      if (!wpis || typeof wpis !== 'object') { niepoprawne.push({ gdzie, powod: 'nie jest obiektem' }); continue; }
      const { rok, tytul, wykonawca, tag } = wpis;
      if (!Number.isInteger(rok) || rok < 1900 || rok > 2100) { niepoprawne.push({ gdzie, powod: `zły rok: ${rok}` }); continue; }
      if (!tytul || !wykonawca) { niepoprawne.push({ gdzie, powod: 'brak tytułu lub wykonawcy' }); continue; }
      if (tag !== 'pl' && tag !== 'swiat') { niepoprawne.push({ gdzie, powod: `zły tag: ${tag}` }); continue; }

      // Klucz deduplikacji wg D8: wykonawca + tytuł, bez znaczenia dla wielkości liter,
      // ogonków i dopisków typu "(Remastered)".
      const klucz = `${normalizuj(wykonawca)}|${rdzenTytulu(tytul)}`;
      if (widziane.has(klucz)) {
        duplikaty.push({ gdzie, tytul, wykonawca, pierwszy: widziane.get(klucz) });
        continue;
      }
      widziane.set(klucz, gdzie);
      wszystkie.push({ rok, tytul: String(tytul).trim(), wykonawca: String(wykonawca).trim(), tag, zrodlo: gdzie });
    }
  }
  return { wszystkie, duplikaty, niepoprawne, pliki };
}

// ---------------------------------------------------------------- kolejka

/** Uruchamia zadania z ograniczoną równoległością, zachowując kolejność wyników. */
async function zKolejka(elementy, rownolegle, zadanie, naPostep) {
  const wyniki = new Array(elementy.length);
  let nastepny = 0;
  let gotowe = 0;
  const robotnik = async () => {
    for (;;) {
      const i = nastepny++;
      if (i >= elementy.length) return;
      wyniki[i] = await zadanie(elementy[i], i);
      gotowe++;
      if (naPostep) naPostep(gotowe, elementy.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(rownolegle, elementy.length) }, robotnik));
  return wyniki;
}

// ---------------------------------------------------------------- statystyka

/** Skleja ciąg lat w czytelne przedziały: [1975,1976,1977,2020] -> "1975–1977, 2020". */
function zwinLata(arr) {
  if (!arr.length) return '—';
  const grupy = [];
  let start = arr[0];
  let poprz = arr[0];
  for (const r of arr.slice(1)) {
    if (r === poprz + 1) { poprz = r; continue; }
    grupy.push(start === poprz ? `${start}` : `${start}–${poprz}`);
    start = poprz = r;
  }
  grupy.push(start === poprz ? `${start}` : `${start}–${poprz}`);
  return grupy.join(', ');
}

function wypiszStatystyke(utwory) {
  const wg = new Map();
  for (const u of utwory) {
    if (!wg.has(u.rok)) wg.set(u.rok, { swiat: 0, pl: 0 });
    wg.get(u.rok)[u.tag]++;
  }
  const lata = [...wg.keys()].sort((a, b) => a - b);

  console.log('\n── Utwory na rocznik ' + '─'.repeat(38));
  console.log('   rok   świat     pl   razem');
  for (const rok of lata) {
    const { swiat, pl } = wg.get(rok);
    console.log(`  ${rok}  ${String(swiat).padStart(5)}  ${String(pl).padStart(5)}  ${String(swiat + pl).padStart(6)}`);
  }
  const sumaSwiat = utwory.filter((u) => u.tag === 'swiat').length;
  const sumaPl = utwory.filter((u) => u.tag === 'pl').length;
  console.log(`  RAZEM ${String(sumaSwiat).padStart(5)}  ${String(sumaPl).padStart(5)}  ${String(utwory.length).padStart(6)}`);

  // Puste roczniki ograniczają walidację z sekcji 4.1 — host nie może wybrać
  // więcej utworów niż jest roczników z co najmniej jednym kandydatem.
  const puste = [];
  const bezPl = [];
  const bezSwiat = [];
  for (let r = ZAKRES_OD; r <= ZAKRES_DO; r++) {
    const w = wg.get(r);
    if (!w) { puste.push(r); continue; }
    if (!w.pl) bezPl.push(r);
    if (!w.swiat) bezSwiat.push(r);
  }

  const wZakresie = lata.filter((r) => r >= ZAKRES_OD && r <= ZAKRES_DO);
  console.log('\n── Roczniki w zakresie ' + ZAKRES_OD + '–' + ZAKRES_DO + ' ' + '─'.repeat(24));
  console.log(`  dostępne (dowolny repertuar): ${wZakresie.length}`);
  console.log(`  PUSTE (zero utworów):         ${zwinLata(puste)}`);
  console.log(`  bez utworu polskiego:         ${zwinLata(bezPl)}`);
  console.log(`  bez utworu światowego:        ${zwinLata(bezSwiat)}`);
  console.log('\n  Maksymalna liczba utworów w grze (= liczba niepustych roczników):');
  console.log(`    Mix ${wZakresie.length}   |   Polska ${wZakresie.filter((r) => wg.get(r).pl > 0).length}   |   Świat ${wZakresie.filter((r) => wg.get(r).swiat > 0).length}`);
}

// ---------------------------------------------------------------- postęp

let ostatniPostep = 0;
function postep(gotowe, razem) {
  const teraz = Date.now();
  if (gotowe !== razem && teraz - ostatniPostep < 500) return;
  ostatniPostep = teraz;
  const pct = Math.round((gotowe / razem) * 100);
  process.stdout.write(`\r  ${String(gotowe).padStart(4)}/${razem}  ${String(pct).padStart(3)}%   `.padEnd(24));
}

/** Wariant paska postępu dla iTunes — dokłada stan regulatora tempa. */
function postepItunes(gotowe, razem) {
  const teraz = Date.now();
  if (gotowe !== razem && teraz - ostatniPostep < 500) return;
  ostatniPostep = teraz;
  const pct = Math.round((gotowe / razem) * 100);
  const pauza = tempo.pauzaDo > teraz ? `  PAUZA ${Math.ceil((tempo.pauzaDo - teraz) / 1000)} s` : '';
  const linia = `  ${String(gotowe).padStart(4)}/${razem}  ${String(pct).padStart(3)}%   odstęp ${tempo.odstepMs} ms, odbić ${tempo.odbicia}${pauza}`;
  process.stdout.write('\r' + linia.padEnd(78));
}

// ---------------------------------------------------------------- tryby

async function trybRefresh(args) {
  if (!existsSync(FILE_SONGS)) throw new Error(`--refresh wymaga istniejącego ${FILE_SONGS}`);
  const baza = JSON.parse(await readFile(FILE_SONGS, 'utf8'));
  const utwory = baza.songs || [];
  const doOdswiezenia = args.limit ? utwory.slice(0, args.limit) : utwory;
  console.log(`Odświeżam previewUrl dla ${doOdswiezenia.length} utworów…`);

  const wyniki = await zKolejka(doOdswiezenia, args.concurrency, (u) => znajdzPreview(u, true), postepItunes);
  process.stdout.write('\n');

  let zmienione = 0;
  let utracone = 0;
  for (const [i, r] of wyniki.entries()) {
    const u = doOdswiezenia[i];
    if (r.ok) {
      if (u.previewUrl !== r.previewUrl) zmienione++;
      u.previewUrl = r.previewUrl;
      u.itunesTrackId = r.itunesTrackId;
    } else {
      utracone++;
      console.warn(`  ! ${u.wykonawca} — ${u.tytul}: ${r.powod}`);
    }
  }
  baza.generatedAt = new Date().toISOString().slice(0, 10);
  await writeFile(FILE_SONGS, JSON.stringify(baza, null, 2) + '\n', 'utf8');
  console.log(`\nOdświeżono. Zmienionych URL-i: ${zmienione}. Bez trafienia: ${utracone}.`);
  wypiszStatystyke(baza.songs);
}

async function weryfikujRoczniki(utwory) {
  const minuty = Math.ceil((utwory.length * MB_ODSTEP_MS) / 60000);
  console.log(`\nWeryfikuję roczniki w MusicBrainz (${utwory.length} zapytań, 1/s — potrwa ok. ${minuty} min)…`);
  const konflikty = [];
  let sprawdzone = 0;
  let bezDanych = 0;

  for (const [i, u] of utwory.entries()) {
    if (i > 0) await sleep(MB_ODSTEP_MS);         // twardy limit MusicBrainz
    const r = await sprawdzRok(u);
    postep(i + 1, utwory.length);
    if (!r.ok) { bezDanych++; continue; }
    sprawdzone++;
    if (Math.abs(r.rok - u.rok) > 1) {
      konflikty.push({
        id: u.id, tytul: u.tytul, wykonawca: u.wykonawca,
        rokWBazie: u.rok, rokMusicBrainz: r.rok, roznica: r.rok - u.rok,
      });
    }
  }
  process.stdout.write('\n');
  await writeFile(FILE_CONFLICTS, JSON.stringify(konflikty, null, 2) + '\n', 'utf8');
  console.log(`Zweryfikowano ${sprawdzone}, bez danych w MusicBrainz ${bezDanych}.`);
  console.log(`Rozjazdów > 1 roku: ${konflikty.length} → data/year-conflicts.json (skrypt niczego nie poprawia, przejrzyj ręcznie).`);
  for (const k of konflikty.slice(0, 15)) {
    console.log(`  ? ${k.wykonawca} — ${k.tytul}: baza ${k.rokWBazie}, MB ${k.rokMusicBrainz}`);
  }
}

async function trybPelny(args) {
  const { wszystkie, duplikaty, niepoprawne, pliki } = await wczytajKandydatow();
  console.log(`Scalono ${pliki.length} plików z data/candidates/: ${pliki.join(', ')}`);
  console.log(`  wpisów poprawnych:      ${wszystkie.length}`);
  console.log(`  duplikatów pominiętych: ${duplikaty.length}`);
  console.log(`  wpisów niepoprawnych:   ${niepoprawne.length}`);
  for (const n of niepoprawne.slice(0, 10)) console.log(`    ! ${n.gdzie}: ${n.powod}`);
  for (const d of duplikaty.slice(0, 10)) console.log(`    = ${d.gdzie} "${d.wykonawca} — ${d.tytul}" (już w ${d.pierwszy})`);

  const doPrzetworzenia = args.limit ? wszystkie.slice(0, args.limit) : wszystkie;
  console.log(`\nOdpytuję iTunes o previewUrl (${doPrzetworzenia.length} wpisów, równolegle ${args.concurrency})…`);

  const wyniki = await zKolejka(doPrzetworzenia, args.concurrency, (w) => znajdzPreview(w), postepItunes);
  process.stdout.write('\n');

  const utwory = [];
  const odrzucone = [];
  const uzyteId = new Set();

  for (const [i, r] of wyniki.entries()) {
    const w = doPrzetworzenia[i];
    if (!r.ok) {
      odrzucone.push({
        rok: w.rok, tytul: w.tytul, wykonawca: w.wykonawca, tag: w.tag,
        zrodlo: w.zrodlo, powod: r.powod,
        ...(r.dopasowanoDo ? { dopasowanoDo: r.dopasowanoDo } : {}),
      });
      continue;
    }
    let id = zbudujId(w.rok, w.wykonawca, w.tytul);
    if (uzyteId.has(id)) {
      let n = 2;
      while (uzyteId.has(`${id}-${n}`)) n++;
      id = `${id}-${n}`;
    }
    uzyteId.add(id);
    utwory.push({
      id, rok: w.rok, tytul: w.tytul, wykonawca: w.wykonawca, tag: w.tag,
      previewUrl: r.previewUrl, itunesTrackId: r.itunesTrackId,
    });
  }

  if (args.verifyYears) await weryfikujRoczniki(utwory);

  utwory.sort((a, b) => a.rok - b.rok || a.wykonawca.localeCompare(b.wykonawca, 'pl'));
  await mkdir(path.dirname(FILE_SONGS), { recursive: true });
  await writeFile(FILE_SONGS, JSON.stringify({
    version: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    songs: utwory,
  }, null, 2) + '\n', 'utf8');
  await writeFile(FILE_REJECTED, JSON.stringify(odrzucone, null, 2) + '\n', 'utf8');

  console.log(`\nZapisano data/songs.json     — ${utwory.length} utworów.`);
  console.log(`Zapisano data/rejected.json  — ${odrzucone.length} odrzuconych.`);
  if (odrzucone.length) {
    const powody = new Map();
    for (const o of odrzucone) {
      const k = o.powod.replace(/\([^)]*\)/, '(…)');
      powody.set(k, (powody.get(k) || 0) + 1);
    }
    console.log('\n── Powody odrzucenia ' + '─'.repeat(38));
    for (const [p, n] of [...powody].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)} × ${p}`);
  }
  wypiszStatystyke(utwory);
}

// ---------------------------------------------------------------- main

const args = parseArgs(process.argv.slice(2));
try {
  await wczytajCache();
  TRYB_OFFLINE.wlaczony = args.offline;
  if (args.offline) console.log(`Tryb offline: buduję bazę z ${cache.size} zapamiętanych odpowiedzi, bez odpytywania iTunes.
`);
  if (args.refresh) await trybRefresh(args);
  else await trybPelny(args);
  await zapiszCache(true);
} catch (e) {
  await zapiszCache(true).catch(() => {});
  console.error(`\nBŁĄD: ${e.message}`);
  process.exit(1);
}
