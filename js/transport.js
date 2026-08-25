/**
 * transport.js — jedyny moduł, który wie, czym dane jadą z laptopa na telefony (D9).
 *
 * Reszta gry widzi tylko cztery funkcje:
 *   publishRoom(pokoj, cel)   host publikuje zaproszenie do pokoju
 *   joinRoom(wejscie)         gracz przyjmuje zaproszenie
 *   publishKey(klucz, cel)    host publikuje klucz odpowiedzi
 *   fetchKey(wejscie)         gracz przyjmuje klucz odpowiedzi
 *
 * Dziś pod spodem jest kod QR plus zapasowy kod tekstowy (D3). Gdyby kiedyś
 * doszła wersja z chmurą, podmienia się ten jeden plik — ekrany hosta i gracza
 * nie zawierają ani jednego odwołania do QR.
 *
 * Biblioteki QR są wendorowane do vendor/ i ładowane klasycznymi <script>,
 * więc żyją w globalnym zakresie (7.3: bez CDN, bez npm w runtime).
 */

import {
  zakodujKodPokoju, odkodujKodPokoju,
  zakodujKlucz, odkodujKlucz, oczysc,
} from './kody.js';

export const NAZWA_TRANSPORTU = 'kod QR + kod tekstowy';

/** Czy transport w ogóle potrafi czytać z kamery (chmura by nie potrzebowała). */
export function obslugujeSkanowanie() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.jsQR);
}

// ---------------------------------------------------------------- rysowanie QR

function generatorQr() {
  if (!window.qrcode) {
    throw new Error('Brak biblioteki QR — sprawdź, czy vendor/qrcode.js się wczytał.');
  }
  return window.qrcode;
}

/**
 * Rysuje kod QR jako SVG w podanym elemencie.
 * Poziom korekcji L przy długich danych (klucz odpowiedzi), M przy krótkich —
 * niższa korekcja to mniej modułów, czyli większe pola na ekranie.
 */
function narysujQr(cel, dane) {
  const qrcode = generatorQr();
  const korekcja = dane.length > 120 ? 'L' : 'M';
  const qr = qrcode(0, korekcja);
  qr.addData(dane);
  qr.make();

  const liczbaModulow = qr.getModuleCount();
  const margines = 2;
  const bok = liczbaModulow + margines * 2;

  let sciezka = '';
  for (let w = 0; w < liczbaModulow; w++) {
    for (let k = 0; k < liczbaModulow; k++) {
      if (qr.isDark(w, k)) sciezka += `M${k + margines} ${w + margines}h1v1h-1z`;
    }
  }

  // Kod QR musi zostać czarny na białym niezależnie od motywu strony —
  // ciemne tło hosta psułoby kontrast dla aparatu.
  cel.innerHTML = `
    <svg class="qr" viewBox="0 0 ${bok} ${bok}" role="img"
         aria-label="Kod QR" shape-rendering="crispEdges">
      <rect width="${bok}" height="${bok}" fill="#ffffff"/>
      <path d="${sciezka}" fill="#000000"/>
    </svg>`;
  return { liczbaModulow };
}

// ---------------------------------------------------------------- adresy

/** Adres, pod którym gracz otworzy swój ekran, z kodem pokoju w części #. */
function adresDlaGracza(kod) {
  const bazowy = new URL('gracz.html', window.location.href);
  bazowy.hash = kod;
  return bazowy.toString();
}

/**
 * Wyciąga kod z tego, co gracz wkleił albo zeskanował: samego kodu,
 * pełnego adresu z #kodem, albo adresu z ?kod=.
 */
function wyluskajKod(wejscie) {
  const tekst = String(wejscie || '').trim();
  if (!tekst) throw new Error('Nie podano kodu.');

  if (/^https?:\/\//i.test(tekst)) {
    let url;
    try {
      url = new URL(tekst);
    } catch {
      throw new Error('To nie wygląda na poprawny adres.');
    }
    const zHasha = url.hash.replace(/^#/, '');
    const zZapytania = url.searchParams.get('kod') || url.searchParams.get('k');
    const kod = zHasha || zZapytania;
    if (!kod) throw new Error('Adres nie zawiera kodu pokoju.');
    return oczysc(kod);
  }
  return oczysc(tekst);
}

// ---------------------------------------------------------------- API pokoju

/**
 * Host publikuje pokój. Zwraca kod tekstowy i adres — ekran hosta pokazuje
 * jedno i drugie, żeby dało się dołączyć bez aparatu.
 *
 * @param {{lata:number[]}} pokoj
 * @param {HTMLElement} cel  miejsce na wizualną formę zaproszenia
 */
export function publishRoom(pokoj, cel) {
  const kod = zakodujKodPokoju(pokoj.lata);
  const url = adresDlaGracza(kod);
  if (cel) narysujQr(cel, url);
  return { kod, url };
}

/**
 * Gracz przyjmuje zaproszenie. Przyjmuje kod tekstowy albo adres.
 * @returns {{lata:number[], liczbaUtworow:number, kod:string}}
 */
export function joinRoom(wejscie) {
  const kod = wyluskajKod(wejscie);
  const pokoj = odkodujKodPokoju(kod);
  return { ...pokoj, kod };
}

// ---------------------------------------------------------------- API klucza

/**
 * Host publikuje klucz odpowiedzi po ostatnim utworze.
 * @param {{przypisania:Array, odciskBazy:number}} klucz
 */
export function publishKey(klucz, cel) {
  const kod = zakodujKlucz(klucz.przypisania, klucz.odciskBazy);
  if (cel) narysujQr(cel, kod);
  return { kod };
}

/** Gracz przyjmuje klucz odpowiedzi — z aparatu albo z pola tekstowego. */
export function fetchKey(wejscie) {
  const tekst = String(wejscie || '').trim();
  if (!tekst) throw new Error('Nie podano klucza odpowiedzi.');
  // Klucz jedzie w QR jako czysty base32, ale ktoś może wkleić go z adresem dookoła.
  const kod = /^https?:\/\//i.test(tekst) ? wyluskajKod(tekst) : oczysc(tekst);
  return odkodujKlucz(kod);
}

// ---------------------------------------------------------------- kamera

/**
 * Uruchamia odczyt z kamery. Skaner jest zawsze opcjonalny — wywołujący ma
 * obowiązek wystawić pole do wklejenia kodu na wypadek odmowy dostępu (7.3).
 *
 * @param {HTMLVideoElement} video  element, w którym pokaże się podgląd
 * @param {(tekst:string)=>void} gdyKod  wołane raz, przy pierwszym odczycie
 * @returns {Promise<() => void>}  funkcja zatrzymująca skaner
 */
export async function uruchomSkaner(video, gdyKod) {
  if (!obslugujeSkanowanie()) {
    throw new Error('Ta przeglądarka nie pozwala czytać z aparatu. Przepisz kod ręcznie.');
  }

  let strumien;
  try {
    strumien = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
  } catch (e) {
    const powod = e && e.name === 'NotAllowedError'
      ? 'Odmówiono dostępu do aparatu.'
      : `Nie udało się włączyć aparatu (${e && e.name ? e.name : 'błąd'}).`;
    throw new Error(`${powod} Przepisz kod ręcznie.`);
  }

  video.srcObject = strumien;
  video.setAttribute('playsinline', '');
  await video.play();

  const plotno = document.createElement('canvas');
  const kontekst = plotno.getContext('2d', { willReadFrequently: true });
  let zatrzymany = false;
  let klatka = 0;

  const zatrzymaj = () => {
    if (zatrzymany) return;
    zatrzymany = true;
    cancelAnimationFrame(klatka);
    for (const sciezka of strumien.getTracks()) sciezka.stop();
    video.srcObject = null;
  };

  const szukaj = () => {
    if (zatrzymany) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      plotno.width = video.videoWidth;
      plotno.height = video.videoHeight;
      kontekst.drawImage(video, 0, 0, plotno.width, plotno.height);
      const obraz = kontekst.getImageData(0, 0, plotno.width, plotno.height);
      const znaleziony = window.jsQR(obraz.data, obraz.width, obraz.height, {
        inversionAttempts: 'dontInvert',
      });
      if (znaleziony && znaleziony.data) {
        zatrzymaj();
        gdyKod(znaleziony.data);
        return;
      }
    }
    klatka = requestAnimationFrame(szukaj);
  };
  klatka = requestAnimationFrame(szukaj);

  return zatrzymaj;
}
