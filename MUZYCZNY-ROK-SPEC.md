# Muzyczny Rok — specyfikacja projektu

> Dokument sterujący dla Claude Code. Zawiera wszystkie ustalenia projektowe.
> **Nie odstępuj od decyzji z sekcji 3 bez pytania użytkownika.**

---

## 1. Czym jest ta gra

Impreza w jednym pokoju. Prowadzący puszcza z głośnika 30-sekundowe fragmenty utworów.
Gracze na swoich telefonach przypisują każdy utwór do roku wydania. Każdy rok może być
użyty **dokładnie raz** — to zamienia grę w łamigłówkę logiczną, a nie serię niezależnych
zgadywanek. Wygrywa ten, kto trafi najwięcej przypisań.

**Role:**

| Rola | Urządzenie | Co widzi |
|---|---|---|
| Prowadzący (host) | laptop + głośnik | wyłącznie sterowanie odtwarzaczem: `Utwór 3/10`, `Odtwórz`, `Dalej` |
| Gracz | własny telefon | „Utwór 3/10" + kolumnę lat |

**Prowadzący gra na równi z innymi.** Ekran sterujący nie pokazuje tytułu, wykonawcy
ani roku — host odpala fragment z laptopa i odpowiada na własnym telefonie jak każdy.
Klucz odpowiedzi jest w pamięci hosta od początku gry, ale zostaje ukryty aż do końca.

---

## 2. FAZA 0 — weryfikacja środowiska (wykonaj jako pierwszą)

Zanim napiszesz jakikolwiek kod, sprawdź środowisko i **zdaj raport użytkownikowi**.
Jeśli czegoś brakuje, zatrzymaj się i zapytaj, zamiast improwizować.

Sprawdź:

1. `node --version` — wymagane ≥ 20 (tylko do skryptu wzbogacającego bazę)
2. `npm --version`
3. `git --version` oraz czy `git remote -v` wskazuje na repo GitHub
4. `gh --version` — opcjonalne, ułatwia włączenie GitHub Pages
5. Dostęp sieciowy — wykonaj po jednym zapytaniu testowym:
   - `https://itunes.apple.com/search?term=abba&entity=song&limit=1`
   - `https://musicbrainz.org/ws/2/recording?query=abba&fmt=json&limit=1`
6. Czy w `data/` leżą już wygenerowane pliki JSON z utworami

Raport w formie tabeli: narzędzie / wersja / OK-brak / czy blokuje.

---

## 3. Decyzje architektoniczne (ustalone, nie zmieniaj)

| # | Decyzja | Uzasadnienie |
|---|---|---|
| D1 | **Zero backendu, zero kont, zero chmury.** Czysty HTML/CSS/JS, bez bundlera. Deploy = `git push`. | GitHub Pages jest statyczny. Gra ma działać za rok bez wygasłych kluczy i limitów. |
| D2 | Stan gracza w `localStorage`, kluczowany kodem pokoju. | Przeładowanie strony nie kasuje odpowiedzi. |
| D3 | Transfer host → telefony przez **kod QR + zapasowy kod tekstowy**. Brak transferu w drugą stronę. | Ciasteczka i localStorage są izolowane per urządzenie — telefon nie ma dostępu do stanu hosta. |
| D4 | Punktacja **lokalna na telefonie** po zeskanowaniu klucza odpowiedzi. Wyniki odczytywane na głos. | Wszyscy siedzą w jednym pokoju. |
| D5 | Baza utworów to **statyczny JSON w repo**, dostarczony z zewnątrz (patrz sekcja 6). | `releaseDate` z iTunes to data pozycji w sklepie — „Take On Me" wraca z rokiem 2010 z remasteru. Rok jest odpowiedzią, więc nie może pochodzić z niepewnego źródła. |
| D6 | iTunes służy **wyłącznie** do pobrania `previewUrl`. Gra nigdy nie odpytuje API w trakcie rozgrywki. | j.w. |
| D7 | Logowanie hosta (`gra` / hasło) jest **dekoracyjne**. | Hasło jest widoczne w kodzie źródłowym. Napisz o tym w README. |
| D8 | **Priorytet Twojej pracy to logika aplikacji, nie kuracja bazy.** JSON-y z utworami dostajesz gotowe. | Poprawiaj je tylko wtedy, gdy skrypt wzbogacający zgłosi błąd. |
| D9 | **Cała komunikacja host ↔ gracz przechodzi przez jeden moduł `transport.js`** z interfejsem `publishRoom()`, `joinRoom()`, `publishKey()`, `fetchKey()`. Reszta kodu nie wie, że pod spodem jest QR. | W planach jest wersja z chmurą. Jeśli logika gry będzie wołać QR bezpośrednio, migracja oznacza przepisanie obu ekranów. Przy `transport.js` to podmiana jednego pliku. |

---

## 4. Przebieg rozgrywki

### 4.1 Konfiguracja (ekran hosta)

Prowadzący loguje się i ustawia:

- **Liczba utworów:** 10–40, krok 5
- **Rok początkowy** i **rok końcowy** — dwa niezależne pola, zakres 1975–2026
- **Repertuar:** `Świat` / `Mix` / `Polska`

**Walidacja — krytyczna.** Sprawdź w tej kolejności:

1. `rokKońcowy ≥ rokPoczątkowy`
2. Policz roczniki w przedziale `[rokPoczątkowy, rokKońcowy]`, które mają **co najmniej
   jeden utwór w puli po filtrze repertuaru**. Ta liczba musi być ≥ liczby utworów.

Nie licz `rokKońcowy − rokPoczątkowy + 1` — przy repertuarze polskim łatwo trafić na
roczniki bez ani jednego kandydata.

Komunikat błędu ma być konkretny i podpowiadać wyjście:
*„Dla repertuaru polskiego w latach 2015–2026 mam utwory z 7 roczników. Wybierz
maksymalnie 5 utworów albo poszerz zakres lat."*

Pokazuj na żywo licznik: *„dostępne roczniki: 34"*, żeby host widział, co robi.

### 4.2 Losowanie

1. Zbuduj listę dostępnych roczników w zakresie, po filtrze repertuaru.
2. Podziel ją na N równych koszyków i wylosuj po jednym roczniku z każdego.
   **Nie losuj lat czysto losowo** — przy 10 utworach z zakresu 1975–2026 potrafi
   wyjść 8 piosenek z jednej dekady i gra robi się nudna.
3. Z każdego wylosowanego rocznika wylosuj jeden utwór.
4. Potasuj kolejność odtwarzania — kolumna lat jest posortowana rosnąco, więc kolejność
   odtwarzania nie może jej zdradzać.

### 4.3 Dołączanie graczy

Host wyświetla na dużym ekranie kod QR z URL-em gry + kodem pokoju oraz sam kod tekstowy.
Gracz skanuje albo wpisuje adres ręcznie, podaje imię, dostaje tabelę.

**Kod pokoju nie może zawierać odpowiedzi.** Koduje wyłącznie: wersję formatu,
liczbę utworów i posortowaną listę lat. Zakoduj lata jako bitmaskę nad zakresem
1975–2026 (52 bity) w base32 — wychodzi ~11 znaków, wygodnych do przepisania.

### 4.4 Runda

1. Host klika **Odtwórz** — leci 30-sekundowy fragment.
2. **Limit 2 odtworzeń na utwór.** Licznik widoczny, po drugim razie przycisk gaśnie.
3. Ekran hosta **nie ujawnia niczego** poza numerem utworu i licznikiem odtworzeń.
4. Gracz wybiera rocznik. Może go zmieniać dowolnie długo, dopóki nie kliknie
   **Zatwierdź**.
5. `Zatwierdź` **blokuje wybór nieodwracalnie** i przesuwa telefon gracza na kolejny
   utwór. Zatwierdzonego roku nie można już zmienić ani zwolnić.
6. Host mówi na głos „dalej" i klika **Następny utwór**.

### Dlaczego zatwierdza gracz, a nie host

Kliknięcie hosta nie może zablokować wyborów na telefonach — przy architekturze bez
chmury (D1, D3) nie ma kanału host → telefon w trakcie gry. Blokadę wyzwala więc sam
gracz, a synchronizację trzyma licznik `Utwór 3/10` widoczny na obu ekranach plus
komenda głosowa hosta. Efekt dla gracza jest ten sam: raz zatwierdzony rok przepada.

**Pominięcie utworu.** Gracz może kliknąć `Zatwierdź` bez wyboru roku — traci punkt,
ale zachowuje rocznik na później. To świadoma decyzja strategiczna, nie błąd.
Pokaż potwierdzenie: *„Zostawiasz Utwór 3 bez odpowiedzi. Na pewno?"*

Host nie wie, czy wszyscy zdążyli — musi zapytać na głos. To świadomy koszt D1.

### 4.5 Zakończenie i punktacja

1. Po ostatnim utworze host ogłasza koniec.
2. Po zatwierdzeniu ostatniego utworu telefon automatycznie zapisuje godzinę zegarową
   (`HH:MM:SS`) — to moment oddania całego arkusza.
3. Host wyświetla kod QR z **kluczem odpowiedzi** (permutacja utwór → rok).
4. Telefon gracza przyjmuje klucz, liczy wynik i pokazuje:
   `Wynik: 7/10` + `Zakończono: 21:14:32` + tabelę z trafieniami, pudłami i poprawnymi
   odpowiedziami (teraz można już pokazać tytuły — dopiero na tym ekranie).
5. Gracze odczytują wyniki na głos. **Przy remisie wygrywa wcześniejsza godzina.**

Zegary telefonów są synchronizowane automatycznie przez sieć, więc porównanie
co do sekundy jest wiarygodne.

---

## 5. Model danych

### 5.1 Plik wejściowy — `data/candidates/*.json`

Generowany poza projektem (patrz sekcja 6). Tablica obiektów:

```json
[
  { "rok": 1985, "tytul": "Take On Me", "wykonawca": "a-ha", "tag": "swiat" },
  { "rok": 1985, "tytul": "Kocham cię, kochanie moje", "wykonawca": "Maanam", "tag": "pl" }
]
```

Plików może być wiele (np. po dekadzie) — skrypt scala wszystkie z katalogu.

### 5.2 Plik wynikowy — `data/songs.json`

To, co czyta gra. Powstaje ze scalenia kandydatów + wzbogacenia o `previewUrl`:

```json
{
  "version": 1,
  "generatedAt": "2026-08-24",
  "songs": [
    {
      "id": "1985-aha-take-on-me",
      "rok": 1985,
      "tytul": "Take On Me",
      "wykonawca": "a-ha",
      "tag": "swiat",
      "previewUrl": "https://audio-ssl.itunes.apple.com/....m4a",
      "itunesTrackId": 1445927579
    }
  ]
}
```

---

## 6. Skrypt `scripts/enrich.mjs`

Baza utworów **przychodzi gotowa** z zewnątrz. Twoim zadaniem nie jest jej wymyślanie,
tylko doprowadzenie do stanu używalnego przez grę.

**Co robi skrypt:**

1. Scala wszystkie pliki z `data/candidates/`, usuwa duplikaty (klucz: `wykonawca` + `tytul`).
2. Dla każdego wpisu odpytuje iTunes Search API:
   `https://itunes.apple.com/search?term=<wykonawca tytul>&entity=song&limit=5`
   — bez klucza i bez logowania. Wybiera najlepiej pasujący wynik i bierze `previewUrl`.
   **Ignoruje `releaseDate`.**
3. Wpisy bez `previewUrl` trafiają do `data/rejected.json` z powodem odrzucenia.
4. Opcjonalna flaga `--verify-years`: sprawdza rok w MusicBrainz
   (`recording` → `first-release-date`). Wymaga nagłówka `User-Agent` z kontaktem,
   inaczej 403, i **maks. 1 zapytania na sekundę** — sekwencyjnie, bez równoległości.
   Rozjazd > 1 roku loguj do `data/year-conflicts.json` — użytkownik przejrzy ręcznie.
5. Flaga `--refresh`: odświeża same `previewUrl` w istniejącym `songs.json`.
6. Na koniec wypisz statystykę: liczba utworów na rocznik w rozbiciu na `tag`
   oraz **listę pustych roczników** — to one ograniczają walidację z 4.1.

---

## 7. Interfejs

### 7.1 Host (desktop, duży ekran)
- Ciemne tło, duża typografia — ma być czytelne z drugiego końca pokoju.
- Widoczne **tylko**: `Utwór 3 / 10` i licznik odtworzeń `1/2`.
- Przyciski: `Odtwórz`, `Następny utwór`, `Zakończ grę`.
- **Żadnych metadanych.** Tytuł, wykonawca i rok nie mogą pojawić się w DOM przed
  końcem gry — host też gra. Trzymaj klucz w pamięci JS, nie renderuj go.
- Ekran końcowy: duży kod QR z kluczem odpowiedzi + pełna lista utworów z latami.

### 7.2 Gracz (mobile-first) — tabela zorientowana na lata

Ekran gracza to **kolumna roczników rosnąco**, po jednym wierszu na rok. Obok każdego
rocznika stoi zatwierdzony utwór albo pusty slot. U góry duży nagłówek `Utwór 3 / 10`.

```
1979   ·  —
1984   ·  Utwór 1          ← zatwierdzone, wyszarzone, nieodwracalne
1991   ·  ◉ Utwór 3        ← bieżący wybór, jeszcze zmienialny
1996   ·  —
```

Zasady:

- **Rok raz użyty nie znika z kolumny** — zostaje wyszarzony, z widocznym numerem
  utworu obok. Gracz przez całą grę widzi pełny obraz swojej układanki i to, co mu
  jeszcze zostało.
- Tapnięcie wolnego rocznika przenosi tam bieżący wybór. Zmiana zdania kosztuje jedno
  tapnięcie, dopóki wybór nie jest zatwierdzony.
- Zatwierdzonego rocznika nie da się tapnąć, zwolnić ani podmienić. Brak przycisku `✕`.
- Duży przycisk `Zatwierdź` na dole, sticky. Po kliknięciu: blokada + przejście do
  kolejnego utworu.
- Gracz **nie widzi tytułów ani wykonawców** aż do ekranu wyniku.
- Przy ostatnim utworze zostaje jeden wolny rocznik — zaznacz go automatycznie, ale
  i tak wymagaj `Zatwierdź`.
- Cele dotykowe min. 44 px, zero przewijania poziomego.

### 7.3 Biblioteki
Jedyne dopuszczalne zależności zewnętrzne, wendorowane do `vendor/` (bez CDN, bez npm
w runtime): generator QR i skaner QR (`getUserMedia` + dekoder). Skaner ma mieć
**zawsze dostępny fallback** — pole do wklejenia kodu tekstowego, na wypadek odmowy
dostępu do kamery.

---

## 8. Kodowanie kodów

| Co | Zawartość | Format |
|---|---|---|
| Kod pokoju | wersja, N, posortowane lata | bitmaska 52-bitowa → base32, ~11 znaków |
| Klucz odpowiedzi | permutacja: utwór *i* → indeks roku | ciąg N indeksów, base32; przy N=40 ~30 znaków → QR |

Kod pokoju musi być krótki, bo ludzie go przepisują. Klucz odpowiedzi może być długi,
bo idzie przez QR — ale zostaw pole do wklejenia.

---

## 9. Świadome kompromisy — wpisz je do README

1. **Zaufanie.** Gracz z konsolą deweloperską może podejrzeć swój stan. To gra dla
   znajomych w jednym pokoju, nie turniej.
2. **Host nie widzi postępu graczy** — musi pytać na głos i pilnować, żeby telefony
   pokazywały ten sam numer utworu co jego ekran.
3. **Gracz może zwlekać z `Zatwierdź`** i podjąć decyzję po usłyszeniu kolejnego
   utworu. Bez chmury nie da się tego wykryć — zaufanie, jeden pokój.
4. **Fragment to 30 s z iTunes**, zwykle refren, a nie „1/4 utworu" — długości i punktu
   startowego nie da się wybrać.
5. **`previewUrl` może z czasem wygasnąć** — stąd tryb `--refresh`.
6. **Hasło hosta jest jawne** w kodzie źródłowym.
7. **Host ma klucz odpowiedzi w pamięci przeglądarki** od początku gry. Nie jest
   renderowany, ale determinat z konsolą deweloperską go znajdzie.

---

## 10. Kolejność prac

- **M0** — raport środowiska (sekcja 2), potwierdzenie od użytkownika
- **M1** — `scripts/enrich.mjs` + przepuszczenie dostarczonych kandydatów;
  **pokaż statystykę i listę odrzuconych, zanim pójdziesz dalej**
- **M2** — ekran hosta: konfiguracja, walidacja, losowanie, odtwarzacz
- **M3** — ekran gracza: kolumna lat, wybór, `Zatwierdź`, blokada
- **M4** — kody QR w obie strony + fallback tekstowy
- **M5** — punktacja, ekran wyniku, godzina zakończenia
- **M6** — deploy na GitHub Pages, README po polsku, test na prawdziwym telefonie

Po M1 i po M3 **zatrzymaj się i pokaż efekt** — to punkty, w których łatwo pójść w złą stronę.

---

## 11. Kryteria akceptacji

- [ ] Strona działa z `https://<user>.github.io/<repo>/` bez żadnej konfiguracji
- [ ] Zakres 2024–2026 przy 10 utworach jest odrzucany z czytelnym komunikatem
- [ ] Rok końcowy wcześniejszy niż początkowy jest odrzucany
- [ ] Przy 10 utworach z 1975–2026 lata rozkładają się na całą epokę, nie na jedną dekadę
- [ ] Zajęty rocznik jest widoczny i wyszarzony, nie znika z listy
- [ ] Wybór można zmieniać przed `Zatwierdź` i nie można po
- [ ] `Zatwierdź` bez wyboru roku jest możliwe, po potwierdzeniu, i kosztuje punkt
- [ ] Ekran hosta nie zawiera tytułu, wykonawcy ani roku — także w DOM
- [ ] Przeładowanie strony na telefonie nie kasuje odpowiedzi
- [ ] Drugie odtworzenie działa, trzecie jest zablokowane
- [ ] Klucz odpowiedzi wczytany z QR daje poprawny wynik
- [ ] Żaden ekran gracza nie ujawnia tytułu ani wykonawcy przed ekranem wyniku
