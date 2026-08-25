/**
 * losowanie.js — dobór roczników i utworów do rozgrywki (4.2).
 *
 * Sedno: rocznikami nie losujemy równomiernie po całej liście, tylko dzielimy ją
 * na N koszyków i bierzemy po jednym z każdego. Czysto losowy wybór 10 lat
 * z przedziału 1975–2026 regularnie daje 8 piosenek z jednej dekady.
 */

import { pogrupujPoRocznikach, sprawdzKonfiguracje } from './dane.js';

/** Domyślne źródło losowości; testy podstawiają własne. */
const losujDomyslnie = () => Math.random();

function losowyElement(tablica, rng) {
  return tablica[Math.floor(rng() * tablica.length)];
}

/** Tasowanie Fishera–Yatesa. Zwraca nową tablicę. */
export function potasuj(tablica, rng = losujDomyslnie) {
  const kopia = [...tablica];
  for (let i = kopia.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [kopia[i], kopia[j]] = [kopia[j], kopia[i]];
  }
  return kopia;
}

/**
 * Dzieli listę roczników na N możliwie równych koszyków i losuje po jednym
 * roczniku z każdego. Koszyki liczone są na indeksach, nie na latach — dzięki
 * temu dziura w bazie (np. brak lat 1987–2002) nie robi pustego koszyka.
 */
export function wylosujRoczniki(dostepne, liczbaUtworow, rng = losujDomyslnie) {
  if (liczbaUtworow > dostepne.length) {
    throw new Error(`Za mało roczników: potrzeba ${liczbaUtworow}, dostępnych ${dostepne.length}.`);
  }
  const wybrane = [];
  for (let i = 0; i < liczbaUtworow; i++) {
    const poczatek = Math.floor((i * dostepne.length) / liczbaUtworow);
    const koniec = Math.floor(((i + 1) * dostepne.length) / liczbaUtworow);
    wybrane.push(losowyElement(dostepne.slice(poczatek, koniec), rng));
  }
  return wybrane;
}

/**
 * Buduje komplet danych rozgrywki.
 *
 * Zwraca:
 *   lata       — roczniki posortowane rosnąco; to jest kolumna widoczna u gracza
 *   kolejnosc  — utwory w kolejności odtwarzania, każdy z indeksem swojego roku
 *
 * Kolejność odtwarzania jest tasowana niezależnie od kolumny lat (4.2 pkt 4) —
 * inaczej pozycja utworu zdradzałaby rocznik.
 */
export function przygotujGre(baza, konfiguracja, rng = losujDomyslnie) {
  const kontrola = sprawdzKonfiguracje(baza.songs, konfiguracja);
  if (!kontrola.ok) throw new Error(kontrola.komunikat);

  const { liczbaUtworow } = konfiguracja;
  const wybraneLata = wylosujRoczniki(kontrola.roczniki, liczbaUtworow, rng);
  const wgRocznika = pogrupujPoRocznikach(baza.songs, konfiguracja);

  const lata = [...wybraneLata].sort((a, b) => a - b);
  const utwory = wybraneLata.map((rok) => ({
    rok,
    utwor: losowyElement(wgRocznika.get(rok), rng),
  }));

  const kolejnosc = potasuj(utwory, rng).map(({ rok, utwor }) => ({
    rok,
    indeksRoku: lata.indexOf(rok),
    indeksWBazie: utwor.indeksWBazie,
    utwor,
  }));

  return { lata, kolejnosc, liczbaUtworow, konfiguracja };
}

/**
 * Rozrzut wylosowanych lat po epoce — używane w teście akceptacyjnym
 * „przy 10 utworach z 1975–2026 lata nie skupiają się w jednej dekadzie".
 * Zwraca liczbę różnych dekad.
 */
export function liczbaDekad(lata) {
  return new Set(lata.map((r) => Math.floor(r / 10))).size;
}
