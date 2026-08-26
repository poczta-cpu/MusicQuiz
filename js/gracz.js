/**
 * gracz.js — ekran gracza (M3).
 *
 * Cała rozgrywka po stronie gracza to jedna kolumna roczników. Rok raz
 * zatwierdzony zostaje w kolumnie wyszarzony — gracz przez całą grę widzi
 * pełny obraz swojej układanki (7.2).
 *
 * Gracz nie widzi tytułów ani wykonawców aż do ekranu wyniku. Ten plik nie ma
 * dostępu do bazy utworów w trakcie gry — wczytuje ją dopiero przy liczeniu wyniku.
 */

import { joinRoom, fetchKey, uruchomSkaner, obslugujeSkanowanie } from './transport.js';
import { Arkusz } from './arkusz.js';
import { policzWynik, godzinaTeraz, wgRoku } from './punktacja.js';
import { wczytajBaze } from './dane.js';
import {
  pustyStanGracza, wczytajStanGracza, zapiszStanGracza, magazynDostepny,
} from './magazyn.js';

const $ = (id) => document.getElementById(id);

const ekrany = {
  dolaczanie: $('ekran-dolaczanie'),
  gra: $('ekran-gra'),
  klucz: $('ekran-klucz'),
  wynik: $('ekran-wynik'),
};

let pokoj = null;          // { lata, liczbaUtworow, kod }
let stan = null;           // arkusz gracza z localStorage
let arkusz = null;         // reguly ukladanki (js/arkusz.js) - cala logika wyboru
let ostatniWynik = null;   // zapamiętany, żeby przełącznik sortowania nie liczył go od nowa
let sortowanieWyniku = 'rok';
let zatrzymajSkaner = null;

// ---------------------------------------------------------------- narzędzia UI

function pokazEkran(nazwa) {
  for (const [klucz, el] of Object.entries(ekrany)) el.classList.toggle('ukryte', klucz !== nazwa);
  $('pasek-dolny').classList.toggle('ukryte', nazwa !== 'gra');
  window.scrollTo(0, 0);
}

function pokazBlad(el, tekst) {
  if (!tekst) {
    el.classList.add('ukryte');
    el.textContent = '';
    return;
  }
  el.textContent = tekst;
  el.classList.remove('ukryte');
}

// ---------------------------------------------------------------- dołączanie

// Kod pokoju przychodzi w adresie po zeskanowaniu QR — wtedy gracz wpisuje samo imię.
function wypelnijZAdresu() {
  const zHasha = window.location.hash.replace(/^#/, '').trim();
  if (zHasha) $('kod-pokoju').value = zHasha.toUpperCase();
}

$('form-dolaczanie').addEventListener('submit', (e) => {
  e.preventDefault();
  const imie = $('imie').value.trim();
  const wpisany = $('kod-pokoju').value.trim();

  if (!imie) {
    pokazBlad($('blad-dolaczanie'), 'Podaj imię.');
    return;
  }

  let dane;
  try {
    dane = joinRoom(wpisany);
  } catch (err) {
    pokazBlad($('blad-dolaczanie'), err.message);
    return;
  }

  pokoj = dane;
  // Odpowiedzi przetrwają przeładowanie strony, bo są kluczowane kodem pokoju (D2).
  stan = wczytajStanGracza(pokoj.kod, pokoj.liczbaUtworow) || pustyStanGracza(pokoj.kod, pokoj.liczbaUtworow);
  stan.imie = imie;
  zapiszStanGracza(stan);

  pokazBlad($('blad-dolaczanie'), '');
  wejdzDoGry();
});

// ---------------------------------------------------------------- rozgrywka

function wejdzDoGry() {
  if (stan.zakonczonoO) {
    // Arkusz byl juz oddany - wracamy tam, gdzie gracz skonczyl.
    pokazEkranKlucza();
    return;
  }
  // Tryb przyjechał w kodzie pokoju, więc telefon nie ma go skąd pomylić.
  arkusz = new Arkusz(stan, pokoj.lata, pokoj.tryb);
  pokazEkran('gra');
  odswiezGre();
}

function odswiezGre() {
  $('numer-utworu').textContent = arkusz.numerUtworu;
  $('wszystkich-utworow').textContent = arkusz.liczbaUtworow;

  arkusz.podpowiedzOstatniego();

  if (arkusz.swobodny) odswiezSwobodny();
  else odswiezRundowy();

  rysujKolumne();
}

function odswiezRundowy() {
  $('nieprzypisane-blok').classList.add('ukryte');

  $('podtytul-gry').textContent = arkusz.wybor === null
    ? `Wolnych roczników: ${arkusz.wolneIndeksy().length}`
    : `Wybrany rok: ${pokoj.lata[arkusz.wybor]}`;
  $('podpowiedz-gry').textContent = 'Zatwierdzony rocznik jest zablokowany na stałe.';

  $('btn-zatwierdz').textContent = arkusz.wybor === null
    ? 'Zatwierdź bez odpowiedzi'
    : `Zatwierdź rok ${pokoj.lata[arkusz.wybor]}`;
}

function odswiezSwobodny() {
  rysujNieprzypisane();

  const wRece = arkusz.podniesiony;
  $('podtytul-gry').textContent = wRece === null
    ? `Bez rocznika: ${arkusz.nieprzypisane().length}`
    : `W ręce Utwór ${wRece + 1} — wskaż rocznik`;
  $('podpowiedz-gry').textContent = 'Przypisania możesz przestawiać aż do zamrożenia listy.';

  // Jeden przycisk na dole: przez całą grę przesuwa dalej, przy ostatnim
  // utworze zamyka listę. Zamrożenie jest jedyną drogą do klucza odpowiedzi.
  $('btn-zatwierdz').textContent = arkusz.ostatniUtwor ? 'Zamroź listę' : 'Dalej';
}

/** Utwory czekające na rocznik. Tapnięcie bierze utwór do ręki albo go odkłada. */
function rysujNieprzypisane() {
  const blok = $('nieprzypisane-blok');
  const lista = $('nieprzypisane');
  const utwory = arkusz.nieprzypisane();

  blok.classList.toggle('ukryte', utwory.length === 0);
  lista.innerHTML = '';

  for (const utwor of utwory) {
    const przycisk = document.createElement('button');
    przycisk.type = 'button';
    przycisk.className = 'zeton'
      + (utwor === arkusz.podniesiony ? ' podniesiony' : '')
      + (utwor === arkusz.stan.biezacy ? ' biezacy' : '');
    przycisk.textContent = `Utwór ${utwor + 1}`;   // nigdy tytuł (7.2)
    przycisk.addEventListener('click', () => {
      arkusz.podnies(utwor);
      zapiszStanGracza(stan);
      odswiezGre();
    });
    lista.appendChild(przycisk);
  }
}

function rysujKolumne() {
  const lista = $('kolumna-lat');
  lista.innerHTML = '';

  for (const w of arkusz.wiersze()) {
    const li = document.createElement('li');
    const przycisk = document.createElement('button');
    przycisk.type = 'button';

    // Zamrożony wygrywa nad wszystkim — to jedyny stan, który blokuje tapnięcie.
    let stanWiersza;
    if (w.zamrozony) stanWiersza = 'zajety';
    else if (w.podniesiony) stanWiersza = 'podniesiony';
    else if (w.wybrany) stanWiersza = 'wybrany';
    else if (w.zajety) stanWiersza = 'obsadzony';
    else stanWiersza = 'wolny';

    przycisk.className = `rocznik ${stanWiersza}`;
    przycisk.disabled = w.zamrozony;
    if (w.zamrozony) przycisk.setAttribute('aria-disabled', 'true');

    const znacznik = document.createElement('span');
    znacznik.className = 'znacznik';
    znacznik.textContent = (w.wybrany || w.podniesiony) ? '◉' : (w.zajety ? '•' : '·');

    const etykietaRoku = document.createElement('span');
    etykietaRoku.className = 'rok';
    etykietaRoku.textContent = w.rok;

    const zawartosc = document.createElement('span');
    zawartosc.className = 'zawartosc';
    zawartosc.textContent = w.etykieta;   // nigdy tytuł - wyłącznie numer utworu (7.2)

    przycisk.append(znacznik, etykietaRoku, zawartosc);
    let opis;
    if (w.zamrozony) opis = `Rok ${w.rok}, zajęty przez ${w.etykieta.toLowerCase()}`;
    else if (w.zajety) opis = `Rok ${w.rok}, stoi tu ${w.etykieta.toLowerCase()}`;
    else opis = `Rok ${w.rok}, wolny`;
    przycisk.setAttribute('aria-label', opis);

    if (!w.zamrozony) {
      // Zmiana zdania kosztuje jedno tapniecie, dopoki nie ma zamrozenia.
      przycisk.addEventListener('click', () => {
        arkusz.tapnij(w.indeks);
        zapiszStanGracza(stan);
        odswiezGre();
      });
    }

    li.appendChild(przycisk);
    lista.appendChild(li);
  }
}

$('btn-zatwierdz').addEventListener('click', () => {
  if (arkusz.swobodny) {
    zamknijSwobodny();
    return;
  }

  if (arkusz.czyPominiecie()) {
    // Pominiecie to swiadoma decyzja strategiczna, nie blad - ale pytamy (4.4).
    const zgoda = confirm(
      `Zostawiasz Utwór ${arkusz.numerUtworu} bez odpowiedzi. Na pewno?\n\n`
      + 'Tracisz punkt, rocznik zostaje wolny.'
    );
    if (!zgoda) return;
  }

  // Godzina oddania calego arkusza rozstrzyga remisy (4.5 pkt 2).
  const { koniec } = arkusz.zatwierdz(godzinaTeraz());
  zapiszStanGracza(stan);

  if (koniec) pokazEkranKlucza();
  else odswiezGre();
});

/**
 * Tryb swobodny: dolny przycisk przesuwa arkusz dalej, a przy ostatnim utworze
 * mrozi listę. Utwory bez rocznika zostają pominięte — pytamy o to wprost,
 * bo po zamrożeniu nie da się już nic poprawić.
 */
function zamknijSwobodny() {
  if (!arkusz.ostatniUtwor) {
    arkusz.przejdzDalej();
    zapiszStanGracza(stan);
    odswiezGre();
    return;
  }

  const bezRocznika = arkusz.nieprzypisane().length;
  const pytanie = bezRocznika > 0
    ? `Utworów bez rocznika: ${bezRocznika}. Tracisz za nie punkty, a po zamrożeniu nic już nie zmienisz.

Zamrozić listę?`
    : `Po zamrożeniu nic już nie zmienisz.

Zamrozić listę?`;
  if (!confirm(pytanie)) return;

  // Godzina oddania calego arkusza rozstrzyga remisy (4.5 pkt 2).
  arkusz.zamroz(godzinaTeraz());
  zapiszStanGracza(stan);
  pokazEkranKlucza();
}

// ---------------------------------------------------------------- odbiór klucza

function pokazEkranKlucza() {
  $('godzina-zakonczenia').textContent = stan.zakonczonoO || '—';
  $('btn-skanuj').classList.toggle('ukryte', !obslugujeSkanowanie());
  pokazEkran('klucz');

  // Jeśli klucz był już raz wczytany, od razu pokazujemy wynik. Błąd musi być
  // widoczny — po przeładowaniu strony gracz nie ma jak zgadnąć, co poszło nie tak.
  if (stan.kodKlucza) {
    policzIPokaz(stan.kodKlucza).catch((e) => pokazBlad($('blad-klucz'), e.message));
  }
}

$('btn-skanuj').addEventListener('click', async () => {
  const video = $('podglad-kamery');
  pokazBlad($('blad-klucz'), '');

  if (zatrzymajSkaner) {
    zatrzymajSkaner();
    zatrzymajSkaner = null;
    video.classList.add('ukryte');
    $('btn-skanuj').textContent = 'Zeskanuj aparatem';
    return;
  }

  try {
    video.classList.remove('ukryte');
    $('btn-skanuj').textContent = 'Przerwij skanowanie';
    zatrzymajSkaner = await uruchomSkaner(video, (tekst) => {
      zatrzymajSkaner = null;
      video.classList.add('ukryte');
      $('btn-skanuj').textContent = 'Zeskanuj aparatem';
      policzIPokaz(tekst).catch((e) => pokazBlad($('blad-klucz'), e.message));
    });
  } catch (e) {
    // Fallback tekstowy jest zawsze na ekranie, więc odmowa kamery nic nie blokuje (7.3).
    video.classList.add('ukryte');
    $('btn-skanuj').textContent = 'Zeskanuj aparatem';
    zatrzymajSkaner = null;
    pokazBlad($('blad-klucz'), e.message);
  }
});

$('btn-wczytaj-klucz').addEventListener('click', () => {
  const tekst = $('kod-klucza').value.trim();
  if (!tekst) {
    pokazBlad($('blad-klucz'), 'Wklej kod klucza albo zeskanuj go aparatem.');
    return;
  }
  policzIPokaz(tekst).catch((e) => pokazBlad($('blad-klucz'), e.message));
});

async function policzIPokaz(kodKlucza) {
  const klucz = fetchKey(kodKlucza);

  if (klucz.przypisania.length !== pokoj.liczbaUtworow) {
    throw new Error(
      `Klucz jest na ${klucz.przypisania.length} utworów, a twój arkusz na ${pokoj.liczbaUtworow}. `
      + 'To klucz z innej rozgrywki.'
    );
  }

  // Bazę wczytujemy dopiero teraz — w trakcie gry telefon nie ma po co znać tytułów.
  let baza = null;
  try {
    baza = await wczytajBaze();
  } catch { /* wynik policzymy bez tytułów */ }

  const wynik = policzWynik(stan.odpowiedzi, klucz, baza, pokoj.lata);
  stan.kodKlucza = kodKlucza;
  zapiszStanGracza(stan);
  pokazWynik(wynik);
}

// ---------------------------------------------------------------- wynik

function pokazWynik(wynik) {
  ostatniWynik = wynik;
  $('wynik-imie').textContent = stan.imie;
  $('wynik-liczba').textContent = `${wynik.trafienia} / ${wynik.liczbaUtworow}`;
  $('wynik-godzina').textContent = stan.zakonczonoO || '—';

  const ostrzezenie = $('wynik-ostrzezenie');
  if (!wynik.zBazy) {
    ostrzezenie.textContent =
      'Inna wersja bazy utworów niż u prowadzącego — tytuły ukryte. Punktacja jest poprawna.';
    ostrzezenie.classList.remove('ukryte');
  } else {
    ostrzezenie.classList.add('ukryte');
  }

  rysujSzczegoly();
  pokazEkran('wynik');
}

/** Odrysowuje listę szczegółów w wybranym porządku. */
function rysujSzczegoly() {
  const wynik = ostatniWynik;
  if (!wynik) return;

  for (const przycisk of $('sort-gracz').querySelectorAll('button')) {
    przycisk.classList.toggle('aktywny', przycisk.dataset.sort === sortowanieWyniku);
  }

  const kontener = $('tabela-wyniku');
  kontener.innerHTML = '';

  const wiersze = sortowanieWyniku === 'rok' ? wgRoku(wynik.wiersze) : wynik.wiersze;
  for (const w of wiersze) {
    const wiersz = document.createElement('div');
    wiersz.className = `wiersz-wyniku ${w.trafione ? 'trafiony' : w.pominiety ? '' : 'pudlo'}`;

    const numer = document.createElement('div');
    numer.className = 'numer';
    numer.textContent = `${w.numer}.`;

    const srodek = document.createElement('div');
    if (w.tytul) {
      const tytul = document.createElement('div');
      tytul.className = 'tytul';
      tytul.textContent = w.tytul;
      const wykonawca = document.createElement('div');
      wykonawca.className = 'wykonawca';
      wykonawca.textContent = w.wykonawca;
      srodek.append(tytul, wykonawca);
    } else {
      const tytul = document.createElement('div');
      tytul.className = 'tytul';
      tytul.textContent = `Utwór ${w.numer}`;
      srodek.appendChild(tytul);
    }

    const lata = document.createElement('div');
    lata.className = 'lata';
    if (w.pominiety) {
      lata.innerHTML = `<span class="brak">pominięty</span><br><span class="poprawny">${w.rokPoprawny}</span>`;
    } else if (w.trafione) {
      lata.innerHTML = `<span class="poprawny">${w.rokPoprawny}</span>`;
    } else {
      lata.innerHTML = `<span class="bledny">${w.rokGracza}</span><br><span class="poprawny">${w.rokPoprawny}</span>`;
    }

    wiersz.append(numer, srodek, lata);
    kontener.appendChild(wiersz);
  }
}

for (const przycisk of $('sort-gracz').querySelectorAll('button')) {
  przycisk.addEventListener('click', () => {
    sortowanieWyniku = przycisk.dataset.sort;
    rysujSzczegoly();
  });
}

$('btn-nowa-gra').addEventListener('click', () => {
  window.location.hash = '';
  window.location.reload();
});

// ---------------------------------------------------------------- start

function start() {
  wypelnijZAdresu();

  if (!magazynDostepny) {
    pokazBlad($('blad-dolaczanie'),
      'Przeglądarka blokuje zapis danych — po odświeżeniu strony odpowiedzi przepadną. '
      + 'Wyłącz tryb prywatny przed dołączeniem.');
  }

  // Powrót do trwającej rozgrywki po przeładowaniu strony (D2).
  const kod = $('kod-pokoju').value.trim();
  if (!kod) return;
  try {
    const dane = joinRoom(kod);
    const zapisany = wczytajStanGracza(dane.kod, dane.liczbaUtworow);
    if (zapisany && zapisany.imie) {
      pokoj = dane;
      stan = zapisany;
      $('imie').value = zapisany.imie;
      wejdzDoGry();
    }
  } catch {
    // Zły kod w adresie — zostajemy na ekranie dołączania z pustym komunikatem.
  }
}

start();
