/**
 * punktacja.js — liczenie wyniku na telefonie gracza (D4, 4.5).
 *
 * Wszystko dzieje się lokalnie: gracz ma swoje odpowiedzi w localStorage,
 * klucz przyjmuje z QR hosta, a wynik odczytuje na głos. Nic nie wychodzi
 * poza urządzenie.
 */

import { odciskBazy } from './kody.js';

/**
 * @param {Array<number|null>} odpowiedzi  odpowiedzi gracza: indeks roku albo null (pominięte)
 * @param {object} klucz                   wynik odkodujKlucz()
 * @param {object} baza                    wczytane songs.json
 * @param {number[]|null} lata             kolumna roczników z kodu pokoju (do pokazania lat)
 */
export function policzWynik(odpowiedzi, klucz, baza, lata = null) {
  const przypisania = klucz.przypisania;
  const liczbaUtworow = przypisania.length;

  // Tytuły wolno pokazać dopiero teraz (7.2), i tylko jeśli telefon gracza ma
  // tę samą bazę co laptop hosta. Przy rozjeździe punktacja jest nadal poprawna —
  // opiera się wyłącznie na indeksach roczników.
  const zBazy = !!baza && odciskBazy(baza) === klucz.odciskBazy;

  let trafienia = 0;
  let pudla = 0;
  let pominiete = 0;

  const wiersze = przypisania.map((p, i) => {
    const rokGraczaIndeks = odpowiedzi[i] ?? null;
    const pominiety = rokGraczaIndeks === null || rokGraczaIndeks === undefined;
    const trafione = !pominiety && rokGraczaIndeks === p.indeksRoku;

    if (pominiety) pominiete++;
    else if (trafione) trafienia++;
    else pudla++;

    const utwor = zBazy && p.indeksWBazie !== null ? baza.songs[p.indeksWBazie] : null;

    return {
      numer: i + 1,
      trafione,
      pominiety,
      rokPoprawny: lata ? lata[p.indeksRoku] ?? null : null,
      rokGracza: lata && !pominiety ? lata[rokGraczaIndeks] ?? null : null,
      tytul: utwor ? utwor.tytul : null,
      wykonawca: utwor ? utwor.wykonawca : null,
    };
  });

  return { trafienia, pudla, pominiete, liczbaUtworow, zBazy, wiersze };
}

/** Godzina zegarowa HH:MM:SS — moment oddania arkusza, rozstrzyga remisy (4.5 pkt 5). */
export function godzinaTeraz(data = new Date()) {
  const dwie = (n) => String(n).padStart(2, '0');
  return `${dwie(data.getHours())}:${dwie(data.getMinutes())}:${dwie(data.getSeconds())}`;
}
