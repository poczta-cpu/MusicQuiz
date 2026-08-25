/**
 * Testy logiki gry. Uruchomienie: node tests/test.mjs
 *
 * Pokrywają te kryteria akceptacji z sekcji 11, które da się sprawdzić bez
 * przeglądarki. Reszta (dotyk, kamera, DOM) idzie ręcznie na telefonie.
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  zakodujKodPokoju, odkodujKodPokoju, zakodujKlucz, odkodujKlucz,
  odciskBazy, oczysc, formatujKod, dlugoscKoduPokoju, ROK_MIN, ROK_MAX,
} from '../js/kody.js';
import {
  ustawBaze, sprawdzKonfiguracje, dostepneRoczniki, filtruj, opisUtworu, odmienUtwory,
} from '../js/dane.js';
import { przygotujGre, wylosujRoczniki, liczbaDekad, potasuj } from '../js/losowanie.js';
import { policzWynik, wgRoku } from '../js/punktacja.js';
import { Arkusz } from '../js/arkusz.js';
import { pustyStanGracza } from '../js/magazyn.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let zaliczone = 0;
let oblane = 0;
const oblaneOpisy = [];

function test(opis, fn) {
  try {
    fn();
    zaliczone++;
    console.log(`  ✓ ${opis}`);
  } catch (e) {
    oblane++;
    oblaneOpisy.push(opis);
    console.log(`  ✗ ${opis}\n      ${e.message}`);
  }
}

function grupa(nazwa) {
  console.log(`\n${nazwa}`);
}

/** Deterministyczne źródło losowości — testy muszą dawać ten sam wynik za każdym razem. */
function rngZiarno(ziarno) {
  let s = ziarno >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Syntetyczna baza: pełne pokrycie 1975–2026, po kilka utworów na rocznik. */
function bazaSyntetyczna({ odRoku = ROK_MIN, doRoku = ROK_MAX, plCoIleLat = 1 } = {}) {
  const songs = [];
  for (let rok = odRoku; rok <= doRoku; rok++) {
    songs.push({ id: `${rok}-a`, rok, tytul: `Utwór ${rok} A`, wykonawca: 'Zespół A', tag: 'swiat', previewUrl: 'x' });
    songs.push({ id: `${rok}-b`, rok, tytul: `Utwór ${rok} B`, wykonawca: 'Zespół B', tag: 'swiat', previewUrl: 'x' });
    if ((rok - odRoku) % plCoIleLat === 0) {
      songs.push({ id: `${rok}-p`, rok, tytul: `Utwór ${rok} P`, wykonawca: 'Zespół P', tag: 'pl', previewUrl: 'x' });
    }
  }
  return ustawBaze({ version: 1, generatedAt: '2026-08-25', songs });
}

// ---------------------------------------------------------------- kody

grupa('Kod pokoju (sekcja 8)');

test('długość kodu pokoju zależy od rozmiaru gry', () => {
  // Krótka gra testowa mieści się w czterech znakach, dziesięć utworów w ośmiu.
  const trzy = zakodujKodPokoju([1980, 1995, 2010]);
  assert.equal(trzy.length, 4);

  const dziesiec = Array.from({ length: 10 }, (_, i) => 1980 + i * 4);
  assert.equal(zakodujKodPokoju(dziesiec).length, 8);

  // Najgorszy przypadek nadal nie przekracza dawnych 11 znaków.
  for (const n of [3, 5, 10, 15, 20, 25, 30, 35, 40]) {
    assert.ok(dlugoscKoduPokoju(n) <= 11, `N=${n} daje ${dlugoscKoduPokoju(n)} znaków`);
  }
});

test('zapowiadana długość zgadza się z faktyczną dla każdego rozmiaru gry', () => {
  for (const n of [3, 5, 10, 15, 20, 25, 30, 35, 40]) {
    const lata = Array.from({ length: n }, (_, i) => ROK_MIN + i);
    assert.equal(zakodujKodPokoju(lata).length, dlugoscKoduPokoju(n), `N=${n}`);
  }
});

test('kod pokoju wraca do tych samych roczników', () => {
  const lata = [1975, 1983, 1990, 1999, 2007, 2013, 2020, 2026];
  const wynik = odkodujKodPokoju(zakodujKodPokoju(lata));
  assert.deepEqual(wynik.lata, lata);
  assert.equal(wynik.liczbaUtworow, lata.length);
});

test('nietypowa liczba utworów też się koduje', () => {
  // Spoza listy w nagłówku — format dokłada drugi znak z jawnym N.
  for (const n of [1, 2, 4, 7, 13, 52]) {
    const lata = Array.from({ length: n }, (_, i) => ROK_MIN + i * Math.floor(52 / n));
    const wynik = odkodujKodPokoju(zakodujKodPokoju(lata));
    assert.equal(wynik.liczbaUtworow, n, `N=${n}`);
    assert.deepEqual(wynik.lata, lata);
  }
});

test('każdy zbiór roczników daje inny kod', () => {
  // C(14,3) = 364 różnych zbiorów musi dać 364 różne kody — żadnych kolizji.
  const kody = new Set();
  let zbiorow = 0;
  for (let a = 0; a < 14; a++) {
    for (let b = a + 1; b < 14; b++) {
      for (let c = b + 1; c < 14; c++) {
        zbiorow++;
        kody.add(zakodujKodPokoju([ROK_MIN + a, ROK_MIN + b, ROK_MIN + c]));
      }
    }
  }
  assert.equal(zbiorow, 364);
  assert.equal(kody.size, 364, 'kolizja kodów pokoju');
});

test('kod pokoju nie zawiera odpowiedzi — te same lata dają ten sam kod', () => {
  // Dwie różne rozgrywki na tych samych rocznikach są nieodróżnialne po kodzie.
  assert.equal(zakodujKodPokoju([1990, 2000, 2010]), zakodujKodPokoju([2010, 1990, 2000]));
});

test('kod pokoju toleruje spacje, myślniki i małe litery przy przepisywaniu', () => {
  const kod = zakodujKodPokoju([1981, 1995, 2011, 2020, 2024]);
  const zSzumem = formatujKod(kod).toLowerCase();
  assert.deepEqual(odkodujKodPokoju(zSzumem).lata, [1981, 1995, 2011, 2020, 2024]);
});

test('formatujKod grupuje po cztery znaki', () => {
  assert.equal(formatujKod('ABCDEFGH'), 'ABCD EFGH');
  assert.equal(formatujKod('ABCDEFGHJ'), 'ABCD EFGH J');
  assert.equal(formatujKod('ABC'), 'ABC');
  assert.equal(oczysc(formatujKod('ABCDEFGH')), 'ABCDEFGH', 'formatowanie musi dać się cofnąć');
});

test('kod pokoju odrzuca rocznik spoza zakresu', () => {
  assert.throws(() => zakodujKodPokoju([1974]), /poza zakresem/);
  assert.throws(() => zakodujKodPokoju([2027]), /poza zakresem/);
});

test('kod pokoju odrzuca powtórzony rocznik', () => {
  assert.throws(() => zakodujKodPokoju([1990, 1990]), /powtarza/);
});

test('kod złej długości daje czytelny komunikat', () => {
  const kod = zakodujKodPokoju([1980, 1995, 2010]);      // cztery znaki
  assert.throws(() => odkodujKodPokoju(kod + '0'), /3 utworów ma 4 znaków/);
  assert.throws(() => odkodujKodPokoju('A'), /za krótki/);
});

test('literowka w kodzie nie przechodzi po cichu', () => {
  // Ranga poza zakresem kombinacji musi zostać wyłapana.
  assert.throws(() => odkodujKodPokoju('ZZZZ'), /uszkodzony|wersji gry/);
});

grupa('Klucz odpowiedzi (sekcja 8)');

test('klucz wraca do tej samej permutacji', () => {
  const przypisania = [
    { indeksRoku: 3, indeksWBazie: 100 },
    { indeksRoku: 0, indeksWBazie: 7 },
    { indeksRoku: 2, indeksWBazie: 65535 - 1 },
    { indeksRoku: 1, indeksWBazie: 0 },
  ];
  const wynik = odkodujKlucz(zakodujKlucz(przypisania, 0xabcd));
  assert.equal(wynik.odciskBazy, 0xabcd);
  assert.deepEqual(wynik.przypisania, przypisania);
});

test('klucz dla 40 utworów mieści się w QR (poniżej 300 znaków)', () => {
  const przypisania = Array.from({ length: 40 }, (_, i) => ({ indeksRoku: i, indeksWBazie: i * 7 }));
  const kod = zakodujKlucz(przypisania, 1234);
  assert.ok(kod.length < 300, `klucz ma ${kod.length} znaków`);
});

test('klucz jest wyraźnie krótszy niż pakowanie po bajcie', () => {
  // Dawny format zajmował 4 + 3N bajtów, czyli 55 znaków dla dziesięciu utworów.
  const przypisania = Array.from({ length: 10 }, (_, i) => ({ indeksRoku: (i + 3) % 10, indeksWBazie: i * 37 }));
  const kod = zakodujKlucz(przypisania, 0x1234);
  assert.ok(kod.length <= 30, `klucz ma ${kod.length} znaków, oczekiwano najwyżej 30`);
  assert.deepEqual(odkodujKlucz(kod).przypisania, przypisania);
});

test('klucz odrzuca przypisania, które nie są permutacją', () => {
  // Dwa utwory na tym samym roczniku to niemożliwy stan gry.
  assert.throws(
    () => zakodujKlucz([{ indeksRoku: 0, indeksWBazie: 1 }, { indeksRoku: 0, indeksWBazie: 2 }], 0),
    /permutacją/
  );
});

test('klucz odrzuca indeks roku spoza zakresu', () => {
  assert.throws(() => zakodujKlucz([{ indeksRoku: 5, indeksWBazie: 0 }], 0), /poza zakresem/);
});

test('obcięty klucz daje komunikat o niekompletności, nie cichy zły wynik', () => {
  const przypisania = Array.from({ length: 10 }, (_, i) => ({ indeksRoku: i, indeksWBazie: i }));
  const kod = zakodujKlucz(przypisania, 1);
  assert.throws(() => odkodujKlucz(kod.slice(0, 12)), /niekompletny|uszkodzony/);
});

test('odcisk bazy zmienia się, gdy zmienia się baza', () => {
  const a = odciskBazy({ version: 1, generatedAt: '2026-08-25', songs: new Array(400) });
  const b = odciskBazy({ version: 1, generatedAt: '2026-08-26', songs: new Array(400) });
  const c = odciskBazy({ version: 1, generatedAt: '2026-08-25', songs: new Array(399) });
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

test('oczysc usuwa formatowanie kodu', () => {
  assert.equal(oczysc(' ab-cd ef '), 'ABCDEF');
});

// ---------------------------------------------------------------- walidacja

grupa('Walidacja konfiguracji (4.1, kryteria akceptacji)');

const bazaPelna = bazaSyntetyczna();

test('rok końcowy wcześniejszy niż początkowy jest odrzucany', () => {
  const w = sprawdzKonfiguracje(bazaPelna.songs, { od: 2010, doRoku: 1990, repertuar: 'mix', liczbaUtworow: 10 });
  assert.equal(w.ok, false);
  assert.match(w.komunikat, /wcześniejszy niż początkowy/);
});

test('zakres 2024–2026 przy 10 utworach jest odrzucany z czytelnym komunikatem', () => {
  const w = sprawdzKonfiguracje(bazaPelna.songs, { od: 2024, doRoku: 2026, repertuar: 'mix', liczbaUtworow: 10 });
  assert.equal(w.ok, false);
  assert.match(w.komunikat, /3 roczników/);
  // Komunikat ma podpowiadać wyjście: albo mniej utworów, albo szerszy zakres.
  assert.match(w.komunikat, /poszerz zakres lat/i);
  assert.match(w.komunikat, /maksymalnie 3 utwory/);
});

test('odmiana liczebnika w komunikatach jest poprawna', () => {
  assert.equal(odmienUtwory(3), '3 utwory');
  assert.equal(odmienUtwory(5), '5 utworów');
  assert.equal(odmienUtwory(10), '10 utworów');
  assert.equal(odmienUtwory(22), '22 utwory');
  assert.equal(odmienUtwory(40), '40 utworów');
});

test('krótka rozgrywka testowa przechodzi walidację przy ubogiej bazie', () => {
  // Dokładnie sytuacja z żywej bazy: trzy roczniki, 1980–1982.
  const uboga = bazaSyntetyczna({ odRoku: 1980, doRoku: 1982 });
  const w = sprawdzKonfiguracje(uboga.songs, { od: 1975, doRoku: 2026, repertuar: 'mix', liczbaUtworow: 3 });
  assert.equal(w.ok, true);
  assert.equal(w.roczniki.length, 3);
  const gra = przygotujGre(uboga, { od: 1975, doRoku: 2026, repertuar: 'mix', liczbaUtworow: 3 }, rngZiarno(1));
  assert.deepEqual(gra.lata, [1980, 1981, 1982]);
  assert.equal(gra.kolejnosc.length, 3);
});

test('walidacja liczy roczniki z utworami, a nie szerokość przedziału', () => {
  // Repertuar polski: utwór PL co 5 lat, więc 1980–2019 to 40 lat, ale tylko 8 roczników.
  const rzadkiePl = bazaSyntetyczna({ odRoku: 1980, doRoku: 2019, plCoIleLat: 5 });
  const roczniki = dostepneRoczniki(rzadkiePl.songs, { od: 1980, doRoku: 2019, repertuar: 'pl' });
  assert.equal(roczniki.length, 8);
  const w = sprawdzKonfiguracje(rzadkiePl.songs, { od: 1980, doRoku: 2019, repertuar: 'pl', liczbaUtworow: 10 });
  assert.equal(w.ok, false);
  assert.match(w.komunikat, /8 roczników/);
});

test('komunikat podpowiada największą osiągalną liczbę utworów', () => {
  const w = sprawdzKonfiguracje(bazaPelna.songs, { od: 2000, doRoku: 2016, repertuar: 'mix', liczbaUtworow: 25 });
  assert.equal(w.ok, false);
  assert.match(w.komunikat, /maksymalnie 15 utworów/);   // 17 roczników -> 15 z listy 10..40 co 5
});

test('poprawna konfiguracja przechodzi', () => {
  const w = sprawdzKonfiguracje(bazaPelna.songs, { od: ROK_MIN, doRoku: ROK_MAX, repertuar: 'mix', liczbaUtworow: 40 });
  assert.equal(w.ok, true);
  assert.equal(w.roczniki.length, 52);
});

test('filtr repertuaru faktycznie zawęża pulę', () => {
  const opcje = { od: 1990, doRoku: 1999, repertuar: 'pl' };
  assert.ok(filtruj(bazaPelna.songs, opcje).every((u) => u.tag === 'pl'));
  assert.ok(filtruj(bazaPelna.songs, { ...opcje, repertuar: 'swiat' }).every((u) => u.tag === 'swiat'));
});

// ---------------------------------------------------------------- losowanie

grupa('Losowanie (4.2)');

test('przy 10 utworach z 1975–2026 lata rozkładają się na całą epokę', () => {
  // Kryterium akceptacji: nie wolno wylosować 8 piosenek z jednej dekady.
  for (let ziarno = 1; ziarno <= 200; ziarno++) {
    const gra = przygotujGre(bazaPelna, { od: ROK_MIN, doRoku: ROK_MAX, repertuar: 'mix', liczbaUtworow: 10 }, rngZiarno(ziarno));
    assert.ok(liczbaDekad(gra.lata) >= 5, `ziarno ${ziarno}: tylko ${liczbaDekad(gra.lata)} dekad w ${gra.lata}`);
    const najliczniejszaDekada = Math.max(
      ...[...new Set(gra.lata.map((r) => Math.floor(r / 10)))]
        .map((d) => gra.lata.filter((r) => Math.floor(r / 10) === d).length)
    );
    assert.ok(najliczniejszaDekada <= 3, `ziarno ${ziarno}: ${najliczniejszaDekada} utworów z jednej dekady`);
  }
});

test('każdy rocznik jest użyty dokładnie raz', () => {
  for (let ziarno = 1; ziarno <= 50; ziarno++) {
    const gra = przygotujGre(bazaPelna, { od: ROK_MIN, doRoku: ROK_MAX, repertuar: 'mix', liczbaUtworow: 20 }, rngZiarno(ziarno));
    assert.equal(new Set(gra.lata).size, 20);
    assert.equal(gra.kolejnosc.length, 20);
    assert.equal(new Set(gra.kolejnosc.map((p) => p.indeksRoku)).size, 20);
  }
});

test('kolumna lat jest posortowana rosnąco', () => {
  const gra = przygotujGre(bazaPelna, { od: 1980, doRoku: 2019, repertuar: 'mix', liczbaUtworow: 15 }, rngZiarno(7));
  assert.deepEqual(gra.lata, [...gra.lata].sort((a, b) => a - b));
});

test('kolejność odtwarzania nie zdradza kolumny lat', () => {
  // Gdyby tasowanie nie działało, kolejnosc[i].indeksRoku === i dla każdego i.
  let identycznych = 0;
  for (let ziarno = 1; ziarno <= 50; ziarno++) {
    const gra = przygotujGre(bazaPelna, { od: ROK_MIN, doRoku: ROK_MAX, repertuar: 'mix', liczbaUtworow: 10 }, rngZiarno(ziarno));
    if (gra.kolejnosc.every((p, i) => p.indeksRoku === i)) identycznych++;
  }
  assert.equal(identycznych, 0);
});

test('wylosowany utwór zawsze pochodzi z przypisanego mu rocznika', () => {
  const gra = przygotujGre(bazaPelna, { od: ROK_MIN, doRoku: ROK_MAX, repertuar: 'mix', liczbaUtworow: 30 }, rngZiarno(11));
  for (const p of gra.kolejnosc) {
    assert.equal(p.utwor.rok, p.rok);
    assert.equal(p.rok, gra.lata[p.indeksRoku]);
  }
});

test('repertuar polski losuje wyłącznie utwory z tagiem pl', () => {
  const gra = przygotujGre(bazaPelna, { od: ROK_MIN, doRoku: ROK_MAX, repertuar: 'pl', liczbaUtworow: 20 }, rngZiarno(3));
  assert.ok(gra.kolejnosc.every((p) => p.utwor.tag === 'pl'));
});

test('losowanie odmawia, gdy roczników jest mniej niż utworów', () => {
  assert.throws(() => wylosujRoczniki([1990, 1991], 10), /Za mało roczników/);
});

test('potasuj zachowuje wszystkie elementy', () => {
  const wejscie = [1, 2, 3, 4, 5, 6, 7, 8];
  const wynik = potasuj(wejscie, rngZiarno(5));
  assert.deepEqual([...wynik].sort((a, b) => a - b), wejscie);
});

// ---------------------------------------------------------------- podglad u hosta

grupa('Podgląd tytułu i wykonawcy u prowadzącego (7.1)');

const UTWOR = { rok: 1985, tytul: 'Take On Me', wykonawca: 'a-ha', tag: 'swiat' };

test('domyślnie nie zwraca niczego — host nie może zobaczyć metadanych', () => {
  assert.equal(opisUtworu(UTWOR), null);
  assert.equal(opisUtworu(UTWOR, {}), null);
  assert.equal(opisUtworu(UTWOR, { pokazTytul: false, pokazWykonawce: false }), null);
});

test('sam tytuł', () => {
  assert.equal(opisUtworu(UTWOR, { pokazTytul: true }), 'Take On Me');
});

test('sam wykonawca', () => {
  assert.equal(opisUtworu(UTWOR, { pokazWykonawce: true }), 'a-ha');
});

test('oba przełączniki', () => {
  assert.equal(opisUtworu(UTWOR, { pokazTytul: true, pokazWykonawce: true }), 'Take On Me — a-ha');
});

test('rok nie pojawia się nigdy — to odpowiedź, nie podpowiedź', () => {
  for (const opcje of [{ pokazTytul: true }, { pokazWykonawce: true }, { pokazTytul: true, pokazWykonawce: true }]) {
    const opis = opisUtworu(UTWOR, opcje);
    assert.ok(!opis.includes('1985'), `rok wyciekł w opisie: ${opis}`);
  }
});

test('brak utworu nie wywraca funkcji', () => {
  assert.equal(opisUtworu(null, { pokazTytul: true }), null);
  assert.equal(opisUtworu(undefined, { pokazTytul: true, pokazWykonawce: true }), null);
});

test('utwór bez wykonawcy nie zostawia wiszącego myślnika', () => {
  const bezWykonawcy = { rok: 1990, tytul: 'Bez nazwiska', wykonawca: '', tag: 'pl' };
  assert.equal(opisUtworu(bezWykonawcy, { pokazTytul: true, pokazWykonawce: true }), 'Bez nazwiska');
});

test('podgląd nie wpływa na losowanie ani walidację', () => {
  const zPodgladem = { od: ROK_MIN, doRoku: ROK_MAX, repertuar: 'mix', liczbaUtworow: 10, pokazTytul: true, pokazWykonawce: true };
  const bez = { od: ROK_MIN, doRoku: ROK_MAX, repertuar: 'mix', liczbaUtworow: 10 };
  assert.equal(sprawdzKonfiguracje(bazaPelna.songs, zPodgladem).ok, true);
  const a = przygotujGre(bazaPelna, zPodgladem, rngZiarno(21));
  const b = przygotujGre(bazaPelna, bez, rngZiarno(21));
  assert.deepEqual(a.lata, b.lata, 'te same ziarna muszą dać tę samą grę');
});

// ---------------------------------------------------------------- arkusz gracza

grupa('Układanka gracza (4.4, 7.2, kryteria akceptacji)');

const LATA_TESTOWE = [1979, 1984, 1991, 1996, 2003, 2011];

function nowyArkusz(lata = LATA_TESTOWE) {
  return new Arkusz(pustyStanGracza('TESTOWYKOD1', lata.length), lata);
}

test('wybór można zmieniać dowolnie długo przed Zatwierdź', () => {
  const a = nowyArkusz();
  a.tapnij(2);
  assert.equal(a.wybor, 2);
  a.tapnij(4);
  assert.equal(a.wybor, 4);
  a.tapnij(0);
  assert.equal(a.wybor, 0);
  assert.equal(a.zajete().size, 0, 'nic nie zostało jeszcze zablokowane');
});

test('ponowne tapnięcie tego samego rocznika zdejmuje wybór', () => {
  const a = nowyArkusz();
  a.tapnij(3);
  a.tapnij(3);
  assert.equal(a.wybor, null);
  assert.equal(a.czyPominiecie(), true);
});

test('po Zatwierdź rocznika nie da się zwolnić ani podmienić', () => {
  const a = nowyArkusz();
  a.tapnij(2);
  a.zatwierdz('20:00:00');

  assert.equal(a.mozliwyDoWyboru(2), false);
  assert.equal(a.tapnij(2), false, 'tapnięcie zajętego rocznika nie może nic zmienić');
  assert.equal(a.stan.odpowiedzi[0], 2, 'zatwierdzona odpowiedź zostaje nietknięta');
  assert.equal(a.wybor, null, 'nowy utwór zaczyna bez wyboru');
});

test('zajęty rocznik zostaje w kolumnie, wyszarzony, z numerem utworu', () => {
  const a = nowyArkusz();
  a.tapnij(1);
  a.zatwierdz('20:00:00');

  const wiersze = a.wiersze();
  assert.equal(wiersze.length, LATA_TESTOWE.length, 'kolumna nie kurczy się po zajęciu roku');
  assert.equal(wiersze[1].zajety, true);
  assert.equal(wiersze[1].etykieta, 'Utwór 1');
  assert.equal(wiersze[1].rok, 1984);
});

test('kolumna nigdy nie pokazuje tytułów ani wykonawców', () => {
  const a = nowyArkusz();
  a.tapnij(0);
  a.zatwierdz('20:00:00');
  a.tapnij(3);
  for (const w of a.wiersze()) {
    assert.match(w.etykieta, /^(Utwór \d+|—)$/, `podejrzana etykieta: ${w.etykieta}`);
  }
});

test('Zatwierdź bez wyboru jest możliwe i nie blokuje żadnego rocznika', () => {
  const a = nowyArkusz();
  assert.equal(a.czyPominiecie(), true);
  a.zatwierdz('20:00:00');

  assert.equal(a.stan.odpowiedzi[0], null);
  assert.equal(a.stan.zatwierdzone[0], true, 'utwór jest zamknięty mimo braku odpowiedzi');
  assert.equal(a.zajete().size, 0, 'pominięcie nie zużywa rocznika');
  assert.equal(a.wolneIndeksy().length, LATA_TESTOWE.length);
});

test('przy ostatnim utworze ostatni wolny rocznik jest zaznaczany automatycznie', () => {
  const a = nowyArkusz();
  for (let i = 0; i < LATA_TESTOWE.length - 1; i++) {
    a.tapnij(a.wolneIndeksy()[0]);
    a.zatwierdz('20:00:00');
  }
  assert.equal(a.numerUtworu, LATA_TESTOWE.length);
  assert.equal(a.wybor, null, 'przed podpowiedzią nie ma jeszcze wyboru');

  a.podpowiedzOstatniego();
  assert.equal(a.wybor, LATA_TESTOWE.length - 1, 'został dokładnie jeden wolny rocznik');
  assert.equal(a.stan.zatwierdzone[LATA_TESTOWE.length - 1], false, 'nadal wymaga Zatwierdź');
});

test('ostatnie Zatwierdź zapisuje godzinę oddania arkusza', () => {
  const a = nowyArkusz();
  let wynik = null;
  for (let i = 0; i < LATA_TESTOWE.length; i++) {
    a.tapnij(a.wolneIndeksy()[0]);
    wynik = a.zatwierdz('21:14:32');
  }
  assert.equal(wynik.koniec, true);
  assert.equal(a.stan.zakonczonoO, '21:14:32');
  assert.equal(a.oddany, true);
});

test('ten sam utwór nie da się zatwierdzić dwa razy', () => {
  const a = nowyArkusz();
  a.tapnij(0);
  a.zatwierdz('20:00:00');
  a.stan.biezacy = 0;                       // próba cofnięcia się do zamkniętego utworu
  assert.throws(() => a.zatwierdz('20:00:01'), /już zatwierdzony/);
});

test('przerwany arkusz wraca z magazynu w tym samym miejscu', () => {
  const a = nowyArkusz();
  a.tapnij(2);
  a.zatwierdz('20:00:00');
  a.tapnij(4);

  // Symulacja przeładowania strony: stan idzie przez JSON, wybór niezatwierdzony przepada.
  const poPrzeladowaniu = new Arkusz(JSON.parse(JSON.stringify(a.stan)), LATA_TESTOWE);
  assert.equal(poPrzeladowaniu.numerUtworu, 2);
  assert.equal(poPrzeladowaniu.zajete().get(2), 1, 'zatwierdzona odpowiedź przetrwała');
  assert.equal(poPrzeladowaniu.mozliwyDoWyboru(2), false);
});

test('pełna rozgrywka zużywa każdy rocznik dokładnie raz', () => {
  const a = nowyArkusz();
  while (!a.oddany) {
    a.tapnij(a.wolneIndeksy()[0]);
    a.zatwierdz('20:00:00');
  }
  assert.equal(new Set(a.stan.odpowiedzi).size, LATA_TESTOWE.length);
  assert.equal(a.wolneIndeksy().length, 0);
});

// ---------------------------------------------------------------- pełny obieg

grupa('Pełny obieg host -> gracz (4.3, 4.5)');

test('kod pokoju z rozgrywki daje graczowi tę samą kolumnę lat', () => {
  const gra = przygotujGre(bazaPelna, { od: ROK_MIN, doRoku: ROK_MAX, repertuar: 'mix', liczbaUtworow: 15 }, rngZiarno(42));
  const uGracza = odkodujKodPokoju(zakodujKodPokoju(gra.lata));
  assert.deepEqual(uGracza.lata, gra.lata);
  assert.equal(uGracza.liczbaUtworow, 15);
});

test('klucz odpowiedzi wczytany z QR daje poprawny wynik', () => {
  const gra = przygotujGre(bazaPelna, { od: ROK_MIN, doRoku: ROK_MAX, repertuar: 'mix', liczbaUtworow: 10 }, rngZiarno(99));
  const kodKlucza = zakodujKlucz(gra.kolejnosc, odciskBazy(bazaPelna));

  // Gracz trafia utwory 0, 2 i 4; utwór 1 pudłuje; utwór 3 pomija.
  const odpowiedzi = gra.kolejnosc.map((p, i) => {
    if (i === 1) return (p.indeksRoku + 1) % 10;
    if (i === 3) return null;
    if (i >= 5) return null;
    return p.indeksRoku;
  });

  const klucz = odkodujKlucz(kodKlucza);
  const wynik = policzWynik(odpowiedzi, klucz, bazaPelna);
  assert.equal(wynik.trafienia, 3);
  assert.equal(wynik.pudla, 1);
  assert.equal(wynik.pominiete, 6);
  assert.equal(wynik.zBazy, true);
  assert.equal(wynik.wiersze[0].trafione, true);
  assert.equal(wynik.wiersze[1].trafione, false);
  assert.equal(wynik.wiersze[3].pominiety, true);
  assert.ok(wynik.wiersze[0].tytul, 'ekran wyniku musi umieć pokazać tytuł');
});

test('zła baza po stronie gracza nie psuje punktacji, tylko ukrywa tytuły', () => {
  const gra = przygotujGre(bazaPelna, { od: ROK_MIN, doRoku: ROK_MAX, repertuar: 'mix', liczbaUtworow: 10 }, rngZiarno(4));
  const klucz = odkodujKlucz(zakodujKlucz(gra.kolejnosc, 0x1111));   // odcisk innej bazy
  const odpowiedzi = gra.kolejnosc.map((p) => p.indeksRoku);
  const wynik = policzWynik(odpowiedzi, klucz, bazaPelna);
  assert.equal(wynik.trafienia, 10);
  assert.equal(wynik.zBazy, false);
  assert.equal(wynik.wiersze[0].tytul, null);
});

test('pominięcie utworu kosztuje punkt, ale nie blokuje rocznika', () => {
  const gra = przygotujGre(bazaPelna, { od: ROK_MIN, doRoku: ROK_MAX, repertuar: 'mix', liczbaUtworow: 10 }, rngZiarno(8));
  const klucz = odkodujKlucz(zakodujKlucz(gra.kolejnosc, odciskBazy(bazaPelna)));
  const odpowiedzi = gra.kolejnosc.map(() => null);
  const wynik = policzWynik(odpowiedzi, klucz, bazaPelna);
  assert.equal(wynik.trafienia, 0);
  assert.equal(wynik.pominiete, 10);
  assert.equal(wynik.pudla, 0);
});

grupa('Kolejność na ekranie wyniku (4.5)');

test('wiersze ustawiają się rosnąco po poprawnym roku', () => {
  const wiersze = [
    { numer: 1, rokPoprawny: 2013 },
    { numer: 2, rokPoprawny: 1985 },
    { numer: 3, rokPoprawny: 1996 },
    { numer: 4, rokPoprawny: 1979 },
  ];
  assert.deepEqual(wgRoku(wiersze).map((w) => w.rokPoprawny), [1979, 1985, 1996, 2013]);
});

test('numer utworu wędruje razem z wierszem', () => {
  const wiersze = [
    { numer: 1, rokPoprawny: 2013 },
    { numer: 2, rokPoprawny: 1985 },
    { numer: 3, rokPoprawny: 1996 },
  ];
  assert.deepEqual(wgRoku(wiersze).map((w) => w.numer), [2, 3, 1]);
});

test('sortowanie nie rusza tablicy wejściowej', () => {
  const wiersze = [{ numer: 1, rokPoprawny: 2000 }, { numer: 2, rokPoprawny: 1980 }];
  wgRoku(wiersze);
  assert.deepEqual(wiersze.map((w) => w.numer), [1, 2]);
});

test('bez kolumny lat zostaje kolejność odtwarzania', () => {
  // rokPoprawny bywa null, gdy klucz wczytano bez kodu pokoju.
  const wiersze = [
    { numer: 3, rokPoprawny: null },
    { numer: 1, rokPoprawny: null },
    { numer: 2, rokPoprawny: null },
  ];
  assert.deepEqual(wgRoku(wiersze).map((w) => w.numer), [1, 2, 3]);
});

test('pełny wynik z prawdziwej rozgrywki wychodzi chronologicznie', () => {
  const gra = przygotujGre(bazaPelna, { od: ROK_MIN, doRoku: ROK_MAX, repertuar: 'mix', liczbaUtworow: 10 }, rngZiarno(77));
  const klucz = odkodujKlucz(zakodujKlucz(gra.kolejnosc, odciskBazy(bazaPelna)));
  const odpowiedzi = gra.kolejnosc.map((p, i) => (i % 3 === 0 ? null : p.indeksRoku));
  const wynik = policzWynik(odpowiedzi, klucz, bazaPelna, gra.lata);

  const lata = wgRoku(wynik.wiersze).map((w) => w.rokPoprawny);
  assert.deepEqual(lata, [...lata].sort((a, b) => a - b));
  assert.deepEqual(lata, gra.lata, 'każdy rocznik pojawia się dokładnie raz, po kolei');
});

// ---------------------------------------------------------------- prawdziwa baza

grupa('Prawdziwa baza data/songs.json');

const sciezkaBazy = path.join(ROOT, 'data', 'songs.json');
if (!existsSync(sciezkaBazy)) {
  console.log('  — pominięto: brak data/songs.json (uruchom npm run enrich)');
} else {
  const prawdziwa = JSON.parse(readFileSync(sciezkaBazy, 'utf8'));

  test('baza ma poprawną strukturę z sekcji 5.2', () => {
    assert.equal(prawdziwa.version, 1);
    assert.match(prawdziwa.generatedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Array.isArray(prawdziwa.songs) && prawdziwa.songs.length > 0);
  });

  test('każdy utwór ma komplet pól i działający previewUrl', () => {
    for (const u of prawdziwa.songs) {
      assert.ok(u.id, `brak id: ${JSON.stringify(u)}`);
      assert.ok(Number.isInteger(u.rok), `zły rok w ${u.id}`);
      assert.ok(u.tytul && u.wykonawca, `brak tytułu/wykonawcy w ${u.id}`);
      assert.ok(u.tag === 'pl' || u.tag === 'swiat', `zły tag w ${u.id}`);
      assert.match(u.previewUrl, /^https:\/\//, `zły previewUrl w ${u.id}`);
    }
  });

  test('identyfikatory utworów są unikalne', () => {
    assert.equal(new Set(prawdziwa.songs.map((u) => u.id)).size, prawdziwa.songs.length);
  });

  test('wszystkie roczniki mieszczą się w zakresie kodu pokoju', () => {
    for (const u of prawdziwa.songs) {
      assert.ok(u.rok >= ROK_MIN && u.rok <= ROK_MAX, `${u.id} ma rok poza ${ROK_MIN}–${ROK_MAX}`);
    }
  });
}

// ---------------------------------------------------------------- podsumowanie

console.log(`\n${'─'.repeat(52)}`);
console.log(`Zaliczone: ${zaliczone}   Oblane: ${oblane}`);
if (oblane) {
  console.log('\nOblane testy:');
  for (const o of oblaneOpisy) console.log(`  - ${o}`);
  process.exit(1);
}
