/**
 * host.js — ekran prowadzącego (M2).
 *
 * Prowadzący gra na równi z innymi (sekcja 1), więc domyślnie ten ekran nie
 * pokazuje ani tytułu, ani wykonawcy, ani roku aż do końca gry — metadane nie
 * trafiają nawet do DOM.
 *
 * Wyjątkiem są dwa przełączniki w konfiguracji, które ujawniają tytuł i/lub
 * wykonawcę po kliknięciu „Odtwórz". To ułatwienie dla całej sali — duży ekran
 * widzą wszyscy — więc nie psuje równych szans. Rok nie jest pokazywany nawet
 * wtedy: to odpowiedź, nie podpowiedź.
 *
 * Klucz odpowiedzi żyje w pamięci JS i w localStorage, ale nie trafia do DOM
 * przed ekranem końcowym niezależnie od ustawień podglądu.
 */

import {
  wczytajBaze, sprawdzKonfiguracje, dostepneRoczniki, opisUtworu, odmienUtwory,
  LICZBY_UTWOROW, REPERTUARY, OPISY_TRYBOW, TRYBY, TRYB_DOMYSLNY,
} from './dane.js';
import { przygotujGre } from './losowanie.js';
import { publishRoom, publishKey } from './transport.js';
import { Odtwarzacz, LIMIT_ODTWORZEN, wolnoIscDalej } from './odtwarzacz.js';
import { odciskBazy, formatujKod, ROK_MIN, ROK_MAX } from './kody.js';
import { wczytajStanHosta, zapiszStanHosta, skasujStanHosta, magazynDostepny } from './magazyn.js';

// Logowanie jest dekoracyjne (D7) — oba te napisy są jawne w kodzie strony.
const LOGIN = 'gra';
const HASLO = 'impreza';

const $ = (id) => document.getElementById(id);

const ekrany = {
  logowanie: $('ekran-logowanie'),
  konfiguracja: $('ekran-konfiguracja'),
  zaproszenie: $('ekran-zaproszenie'),
  gra: $('ekran-gra'),
  koniec: $('ekran-koniec'),
};

let baza = null;
let odtwarzacz = null;

/**
 * Czy odtworzenie bieżącego utworu skończyło się błędem. Nie trafia do stanu
 * trwałego — po przeładowaniu strony host po prostu klika „Odtwórz" jeszcze raz
 * i błąd wraca, jeśli utwór faktycznie jest uszkodzony.
 */
let bladBiezacego = false;

/**
 * Stan rozgrywki. `kolejnosc` trzyma wyłącznie indeksy — utwory doklejamy
 * z bazy dopiero przy odtwarzaniu i na ekranie końcowym.
 */
let stan = null;

/** Porządek listy na ekranie końcowym: kolejność odtwarzania albo rocznik. */
let sortowanieKoncowe = 'kolejnosc';

// ---------------------------------------------------------------- narzędzia UI

function pokazEkran(nazwa) {
  for (const [klucz, el] of Object.entries(ekrany)) el.classList.toggle('ukryte', klucz !== nazwa);
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

// ---------------------------------------------------------------- stan trwały

function zapiszStan() {
  if (!stan) return;
  zapiszStanHosta(stan);
}

function odtworzUtworZBazy(pozycja) {
  return baza.songs[pozycja.indeksWBazie];
}

// ---------------------------------------------------------------- logowanie

$('form-logowanie').addEventListener('submit', (e) => {
  e.preventDefault();
  const login = $('login').value.trim().toLowerCase();
  const haslo = $('haslo').value;
  if (login !== LOGIN || haslo !== HASLO) {
    pokazBlad($('blad-logowanie'), 'Zły login albo hasło.');
    return;
  }
  pokazBlad($('blad-logowanie'), '');
  wejdzDoKonfiguracji();
});

// ---------------------------------------------------------------- konfiguracja

function wejdzDoKonfiguracji() {
  pokazEkran('konfiguracja');
  odswiezLicznikRocznikow();

  const zapisany = wczytajStanHosta();
  const jestCoWznowic = zapisany && zapisany.faza && zapisany.faza !== 'koniec';
  $('wznow-info').classList.toggle('ukryte', !jestCoWznowic);
}

function czytajKonfiguracje() {
  return {
    liczbaUtworow: Number($('liczba-utworow').value),
    od: Number($('rok-od').value),
    doRoku: Number($('rok-do').value),
    repertuar: $('repertuar').value,
    tryb: $('tryb').value,
    pokazTytul: $('pokaz-tytul').checked,
    pokazWykonawce: $('pokaz-wykonawce').checked,
  };
}

/** Licznik „dostępne roczniki: 34" — host ma na żywo widzieć, co robi (4.1). */
function odswiezLicznikRocznikow() {
  if (!baza) return;
  const k = czytajKonfiguracje();
  const el = $('licznik-rocznikow');

  // Walidacja idzie zawsze i jako pierwsza — od niej zależy stan przycisku.
  // Wcześniejsze wyjście przy złym zakresie zostawiało przycisk aktywny.
  const kontrola = sprawdzKonfiguracje(baza.songs, k);
  $('btn-losuj').disabled = !kontrola.ok;
  pokazBlad($('blad-konfiguracja'), kontrola.ok ? '' : kontrola.komunikat);

  const zakresSensowny = Number.isInteger(k.od) && Number.isInteger(k.doRoku) && k.doRoku >= k.od;
  if (!zakresSensowny) {
    el.innerHTML = 'Dostępne roczniki: <strong>—</strong>';
    return;
  }

  const roczniki = dostepneRoczniki(baza.songs, k);
  const etykieta = REPERTUARY[k.repertuar].etykieta;
  el.innerHTML = `Dostępne roczniki: <strong>${roczniki.length}</strong> `
    + `<span style="color:var(--tekst-cichy)">(${etykieta}, ${k.od}–${k.doRoku}; wybrano ${odmienUtwory(k.liczbaUtworow)})</span>`;
}

/** Opis trybu pod listą — host wybiera zasady, nie nazwę. */
function odswiezOpisTrybu() {
  const opis = OPISY_TRYBOW[$('tryb').value] || OPISY_TRYBOW[TRYB_DOMYSLNY];
  $('opis-trybu').textContent = opis.opis;
}

$('tryb').addEventListener('change', odswiezOpisTrybu);

for (const id of ['liczba-utworow', 'rok-od', 'rok-do', 'repertuar']) {
  $(id).addEventListener('input', odswiezLicznikRocznikow);
  $(id).addEventListener('change', odswiezLicznikRocznikow);
}

$('form-konfiguracja').addEventListener('submit', (e) => {
  e.preventDefault();
  const konfiguracja = czytajKonfiguracje();
  const kontrola = sprawdzKonfiguracje(baza.songs, konfiguracja);
  if (!kontrola.ok) {
    pokazBlad($('blad-konfiguracja'), kontrola.komunikat);
    return;
  }

  const gra = przygotujGre(baza, konfiguracja);
  stan = {
    faza: 'zaproszenie',
    konfiguracja,
    lata: gra.lata,
    kolejnosc: gra.kolejnosc.map((p) => ({
      rok: p.rok,
      indeksRoku: p.indeksRoku,
      indeksWBazie: p.indeksWBazie,
    })),
    biezacy: 0,
    odtworzeniaBiezacego: 0,
    kodPokoju: null,
  };
  zapiszStan();
  pokazZaproszenie();
});

$('btn-wznow').addEventListener('click', () => {
  stan = wczytajStanHosta();
  if (!stan) return;
  if (stan.faza === 'zaproszenie') pokazZaproszenie();
  else if (stan.faza === 'gra') wejdzDoGry();
  else pokazKoniec();
});

$('btn-porzuc').addEventListener('click', () => {
  skasujStanHosta();
  stan = null;
  $('wznow-info').classList.add('ukryte');
});

// ---------------------------------------------------------------- zaproszenie

function pokazZaproszenie() {
  stan.faza = 'zaproszenie';
  // Transport sam decyduje, jak wygląda zaproszenie — ten ekran nie wie o QR (D9).
  const { kod, url } = publishRoom({ lata: stan.lata, tryb: stan.konfiguracja.tryb }, $('qr-pokoj'));
  stan.kodPokoju = kod;
  zapiszStan();

  // Grupy po cztery znaki - kod jest przepisywany recznie z drugiego konca pokoju.
  $('kod-pokoju').textContent = formatujKod(kod);
  $('adres-gry').textContent = url.split('#')[0];

  // Tryb jedzie w kodzie pokoju, więc telefony ustawią się same — ale gracze
  // muszą wiedzieć, w co grają, zanim zacznie się pierwszy utwór.
  const opis = OPISY_TRYBOW[stan.konfiguracja.tryb] || OPISY_TRYBOW[TRYB_DOMYSLNY];
  $('info-tryb').textContent = `Tryb ${opis.etykieta.toLowerCase()}. ${opis.opis}`;

  pokazEkran('zaproszenie');
}

$('btn-wroc-konfiguracja').addEventListener('click', () => {
  skasujStanHosta();
  stan = null;
  wejdzDoKonfiguracji();
});

$('btn-zacznij').addEventListener('click', () => {
  stan.faza = 'gra';
  stan.biezacy = 0;
  stan.odtworzeniaBiezacego = 0;
  zapiszStan();
  wejdzDoGry();
});

// ---------------------------------------------------------------- rozgrywka

function wejdzDoGry() {
  stan.faza = 'gra';
  pokazEkran('gra');
  zaladujBiezacy();
}

function zaladujBiezacy() {
  const pozycja = stan.kolejnosc[stan.biezacy];
  const utwor = odtworzUtworZBazy(pozycja);
  odtwarzacz.zaladuj(utwor.previewUrl);
  // Licznik odtworzeń przetrwał przeładowanie strony — odtwarzacz startuje od zera,
  // więc przywracamy go ze stanu.
  odtwarzacz.odtworzenia = stan.odtworzeniaBiezacego || 0;
  bladBiezacego = false;
  pokazBlad($('blad-gra'), '');
  odswiezUjawnienie();
  odswiezEkranGry();
}

/**
 * Wypełnia blok z tytułem/wykonawcą — ale wyłącznie po pierwszym odtworzeniu
 * i tylko przy włączonym podglądzie. Przy domyślnych ustawieniach opisUtworu()
 * zwraca null i ta funkcja nie dotyka treści elementu, więc do DOM-u nie trafia
 * ani tytuł, ani wykonawca (7.1).
 */
function odswiezUjawnienie() {
  const el = $('ujawnienie');
  const opcje = stan.konfiguracja || {};
  const juzGrano = (stan.odtworzeniaBiezacego || 0) > 0;

  if (!juzGrano) {
    el.textContent = '';
    el.classList.add('ukryte');
    return;
  }

  const opis = opisUtworu(odtworzUtworZBazy(stan.kolejnosc[stan.biezacy]), opcje);
  if (!opis) {
    el.textContent = '';
    el.classList.add('ukryte');
    return;
  }
  el.textContent = opis;
  el.classList.remove('ukryte');
}

function odswiezEkranGry() {
  const numer = stan.biezacy + 1;
  const wszystkich = stan.kolejnosc.length;

  $('numer-utworu').textContent = numer;
  $('wszystkich-utworow').textContent = wszystkich;
  $('licznik-odtworzen').textContent = `${odtwarzacz.odtworzenia} / ${LIMIT_ODTWORZEN}`;
  $('pasek').style.width = `${(numer / wszystkich) * 100}%`;

  $('btn-odtworz').disabled = !odtwarzacz.mozeGrac;
  $('btn-odtworz').textContent = odtwarzacz.gra
    ? 'Gra…'
    : (odtwarzacz.zostalo === 0 ? 'Limit wyczerpany' : 'Odtwórz');

  const ostatni = stan.biezacy >= wszystkich - 1;
  $('btn-nastepny').textContent = ostatni ? 'To był ostatni — pokaż klucz' : 'Następny utwór';
  $('btn-nastepny').classList.toggle('glowny', ostatni);

  // Nie da się przewinąć utworu, którego nikt nie usłyszał. „Zakończ grę"
  // zostaje czynne — to jedyne wyjście awaryjne i nie wolno go zablokować.
  const wolno = wolnoIscDalej({ odtworzenia: odtwarzacz.odtworzenia, blad: bladBiezacego });
  $('btn-nastepny').disabled = !wolno;
  $('podpowiedz-nastepny').classList.toggle('ukryte', wolno);
}

$('btn-odtworz').addEventListener('click', async () => {
  try {
    await odtwarzacz.odtworz();
    stan.odtworzeniaBiezacego = odtwarzacz.odtworzenia;
    zapiszStan();
    odswiezUjawnienie();       // tytuł/wykonawca dopiero teraz, nigdy przed kliknięciem
  } catch (e) {
    // Nieudane odtworzenie odblokowuje przejście dalej — inaczej uszkodzony
    // previewUrl zatrzymałby całą rozgrywkę na tym utworze.
    bladBiezacego = true;
    pokazBlad($('blad-gra'), e.message);
  }
  odswiezEkranGry();
});

$('btn-nastepny').addEventListener('click', () => {
  odtwarzacz.zatrzymaj();
  if (stan.biezacy >= stan.kolejnosc.length - 1) {
    zakonczGre();
    return;
  }
  stan.biezacy++;
  stan.odtworzeniaBiezacego = 0;
  zapiszStan();
  zaladujBiezacy();
});

$('btn-zakoncz').addEventListener('click', () => {
  const zostalo = stan.kolejnosc.length - stan.biezacy - 1;
  const pytanie = zostalo > 0
    ? `Zostało jeszcze ${zostalo} utworów. Na pewno zakończyć grę i pokazać klucz odpowiedzi?`
    : 'Zakończyć grę i pokazać klucz odpowiedzi?';
  if (confirm(pytanie)) zakonczGre();
});

// ---------------------------------------------------------------- koniec

function zakonczGre() {
  odtwarzacz.zatrzymaj();
  stan.faza = 'koniec';
  zapiszStan();
  pokazKoniec();
}

function pokazKoniec() {
  // Dopiero tutaj wolno pokazać cokolwiek o utworach.
  const { kod } = publishKey({
    przypisania: stan.kolejnosc.map((p) => ({ indeksRoku: p.indeksRoku, indeksWBazie: p.indeksWBazie })),
    odciskBazy: odciskBazy(baza),
  }, $('qr-klucz'));

  $('kod-klucza').value = formatujKod(kod);

  rysujTabeleKoncowa();
  pokazEkran('koniec');
}

/** Odrysowuje listę „Co leciało" w wybranym porządku. Numer utworu zostaje przy wierszu. */
function rysujTabeleKoncowa() {
  if (!stan) return;

  for (const przycisk of $('sort-host').querySelectorAll('button')) {
    przycisk.classList.toggle('aktywny', przycisk.dataset.sort === sortowanieKoncowe);
  }

  const wiersze = stan.kolejnosc.map((p, i) => ({ numer: i + 1, rok: p.rok, utwor: odtworzUtworZBazy(p) }));
  if (sortowanieKoncowe === 'rok') wiersze.sort((a, b) => a.rok - b.rok);

  const tbody = $('tabela-utworow');
  tbody.innerHTML = '';
  for (const w of wiersze) {
    const tr = document.createElement('tr');
    const komorki = [String(w.numer), String(w.rok), w.utwor.tytul, w.utwor.wykonawca];
    komorki.forEach((tekst, k) => {
      const td = document.createElement('td');
      if (k === 1) td.className = 'rok';
      td.textContent = tekst;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
}

for (const przycisk of $('sort-host').querySelectorAll('button')) {
  przycisk.addEventListener('click', () => {
    sortowanieKoncowe = przycisk.dataset.sort;
    rysujTabeleKoncowa();
  });
}

$('btn-kopiuj-klucz').addEventListener('click', async () => {
  const pole = $('kod-klucza');
  pole.select();
  try {
    await navigator.clipboard.writeText(pole.value);
    $('btn-kopiuj-klucz').textContent = 'Skopiowano';
    setTimeout(() => { $('btn-kopiuj-klucz').textContent = 'Skopiuj kod'; }, 1800);
  } catch {
    document.execCommand('copy');
  }
});

$('btn-nowa-gra').addEventListener('click', () => {
  skasujStanHosta();
  stan = null;
  wejdzDoKonfiguracji();
});

// ---------------------------------------------------------------- start

async function start() {
  // Lista długości gry i zakresy lat pochodzą z jednego miejsca (dane.js),
  // żeby nie rozjechały się z walidacją.
  const wybor = $('liczba-utworow');
  for (const n of LICZBY_UTWOROW) {
    const opt = document.createElement('option');
    opt.value = String(n);
    opt.textContent = odmienUtwory(n);
    wybor.appendChild(opt);
  }

  const wyborTrybu = $('tryb');
  for (const tryb of TRYBY) {
    const opt = document.createElement('option');
    opt.value = tryb;
    opt.textContent = OPISY_TRYBOW[tryb].etykieta;
    if (tryb === TRYB_DOMYSLNY) opt.selected = true;
    wyborTrybu.appendChild(opt);
  }
  odswiezOpisTrybu();

  $('rok-od').value = ROK_MIN;
  $('rok-do').value = ROK_MAX;

  try {
    baza = await wczytajBaze();
  } catch (e) {
    pokazBlad($('blad-logowanie'), e.message);
    return;
  }

  odtwarzacz = new Odtwarzacz();
  odtwarzacz.przyZmianie = () => {
    if (stan && stan.faza === 'gra') odswiezEkranGry();
  };

  if (!magazynDostepny) {
    pokazBlad($('blad-logowanie'),
      'Przeglądarka blokuje zapis danych — po odświeżeniu strony gra przepadnie. '
      + 'Wyłącz tryb prywatny albo nie odświeżaj strony w trakcie zabawy.');
  }

  odswiezLicznikRocznikow();
}

start();
