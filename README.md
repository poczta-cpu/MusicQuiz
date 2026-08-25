# Muzyczny Rok

Impreza w jednym pokoju. Prowadzący puszcza z głośnika 30-sekundowe fragmenty utworów,
gracze na swoich telefonach przypisują każdy utwór do roku wydania.

**Każdy rok może być użyty dokładnie raz.** To zamienia grę w łamigłówkę logiczną,
a nie serię niezależnych zgadywanek — pomyłka przy jednym utworze zabiera rocznik,
który mógł się przydać przy następnym.

**Adres gry:** https://poczta-cpu.github.io/MusicQuiz/

---

## Jak zagrać

**Prowadzący** otwiera stronę na laptopie podpiętym do głośnika, wybiera *Prowadzę grę*
i loguje się (dane niżej). Ustawia liczbę utworów, zakres lat i repertuar, po czym gra
losuje utwory i pokazuje kod QR z kodem pokoju.

**Gracze** skanują kod telefonami albo wpisują adres ręcznie i przepisują 11-znakowy
kod pokoju. Podają imię i dostają kolumnę roczników.

Potem, dla każdego utworu:

1. Prowadzący klika **Odtwórz** — leci fragment. Można go powtórzyć **najwyżej raz**.
2. Każdy wybiera rocznik na swoim telefonie. Wybór można zmieniać dowolnie długo.
3. Kliknięcie **Zatwierdź** blokuje rocznik **nieodwracalnie** i przesuwa telefon na
   kolejny utwór. Zatwierdzony rok zostaje w kolumnie, wyszarzony — widać, co jeszcze
   zostało.
4. Prowadzący mówi na głos „dalej" i klika **Następny utwór**.

Po ostatnim utworze prowadzący pokazuje kod QR z kluczem odpowiedzi. Telefony liczą
wyniki same i pokazują je razem z tytułami. **Wyniki odczytujecie na głos.**

**Prowadzący gra na równi z resztą.** Jego ekran nie pokazuje roku — odpala fragment
z laptopa i odpowiada na własnym telefonie jak każdy.

### Przy remisie

Telefon zapisuje godzinę zegarową w momencie zatwierdzenia ostatniego utworu.
Przy tej samej liczbie punktów wygrywa wcześniejsza godzina. Zegary telefonów są
synchronizowane przez sieć, więc porównanie co do sekundy jest wiarygodne.

### Krótka rozgrywka do testów

Na dole listy „Liczba utworów" jest grupa **Do testów — krótka rozgrywka** z opcjami
**3** i **5 utworów**. Służą do sprawdzenia gry od początku do końca w dwie minuty,
zamiast rozgrywać pełny kwadrans. Przydają się też, gdy baza pokrywa mało roczników —
właściwa gra wymaga co najmniej dziesięciu.

Do grania wybieraj wartości z góry listy: 10–40 co 5.

### Łatwiejszy wariant — tytuł i wykonawca na ekranie

W ustawieniach gry są dwa przełączniki: **Pokazuj tytuł utworu** i **Pokazuj wykonawcę**.
Domyślnie oba są wyłączone. Po włączeniu wybrane dane pojawiają się na dużym ekranie
**po kliknięciu `Odtwórz`** — nigdy wcześniej.

**Rok nie jest pokazywany nawet wtedy.** To odpowiedź, nie podpowiedź.

Duży ekran widzi cała sala, a prowadzący może też odczytać tytuł na głos — więc to
ułatwienie dla wszystkich po równo, nie przewaga prowadzącego. Zdejmuje z gry
rozpoznawanie utworu i zostawia samą zgadywankę rocznika. Dobre, gdy gracie
w mieszanym towarzystwie albo z repertuarem, którego nie wszyscy znają.

### Można pominąć utwór

Kliknięcie **Zatwierdź** bez wybranego rocznika jest dozwolone — kosztuje punkt,
ale zachowuje rocznik na później. To świadoma decyzja strategiczna, nie błąd.
Gra poprosi o potwierdzenie.

---

## Logowanie prowadzącego

```
login:  gra
hasło:  impreza
```

**To zabezpieczenie jest dekoracyjne.** Hasło stoi otwartym tekstem w `js/host.js`,
a ten plik przeglądarka pobiera przy każdym wejściu na stronę — każdy może je odczytać
w kilka sekund. Chroni przed przypadkowym kliknięciem w ekran prowadzącego, nie przed
kimkolwiek, kto chce zajrzeć. Prywatne repozytorium niczego by tu nie zmieniło.

---

## Świadome kompromisy

Gra nie ma serwera, kont ani chmury (patrz sekcja 3 specyfikacji). To pociąga za sobą
ograniczenia, które są **wybrane**, nie przeoczone:

1. **Zaufanie.** Gracz z konsolą deweloperską może podejrzeć swój stan. To gra dla
   znajomych w jednym pokoju, nie turniej.
2. **Prowadzący nie widzi postępu graczy.** Musi zapytać na głos, czy wszyscy zatwierdzili,
   i pilnować, żeby numer utworu na telefonach zgadzał się z numerem na jego ekranie.
3. **Gracz może zwlekać z `Zatwierdź`** i podjąć decyzję po usłyszeniu kolejnego utworu.
   Bez chmury nie da się tego wykryć.
4. **Fragment to 30 sekund z iTunes**, zwykle refren. Ani długości, ani punktu startowego
   nie da się wybrać.
5. **Adresy fragmentów mogą z czasem wygasnąć.** Wtedy: `npm run enrich -- --refresh`.
6. **Hasło prowadzącego jest jawne** — patrz wyżej.
7. **Prowadzący ma klucz odpowiedzi w przeglądarce** od początku gry. Nie jest renderowany
   na ekranie, ale zdeterminowany prowadzący znajdzie go w konsoli. Klucz trafia też do
   `localStorage`, żeby odświeżenie strony na laptopie nie skasowało rozgrywki w połowie.
8. **Baza pokrywa lata 1980–2019.** Pola roku przyjmują 1975–2026 zgodnie ze specyfikacją,
   ale poza tym zakresem nie ma utworów. Licznik „dostępne roczniki" pokazuje to na żywo,
   a walidacja odrzuci taki wybór z konkretnym komunikatem.

---

## Uruchomienie lokalnie

Gra to zwykłe pliki statyczne, ale używa modułów ES — te nie działają spod `file://`,
bo przeglądarka blokuje je regułami CORS. Potrzebny jest serwer:

```bash
node scripts/serwer.mjs
```

Wypisze adres dla laptopa (`http://localhost:8080/`) i adresy w sieci lokalnej,
pod które wejdziesz telefonem.

> **Uwaga:** aparat działa tylko po HTTPS albo na `localhost`. Testując z telefonu przez
> adres IP w sieci lokalnej, użyj pola „wklej kod ręcznie" zamiast skanera. Na GitHub Pages
> jest HTTPS, więc skaner działa normalnie.

### Testy

```bash
npm test
```

57 testów logiki: kodowanie kodów, walidacja konfiguracji, losowanie, reguły układanki
gracza, podgląd u prowadzącego, punktacja i pełny obieg prowadzący → gracz.
Nie obejmują DOM ani kamery — to idzie ręcznie.

---

## Baza utworów

Gra czyta `data/songs.json`. Plik powstaje ze scalenia list kandydatów z `data/candidates/`
i wzbogacenia ich o adresy fragmentów z iTunes:

```bash
npm run enrich                  # pełne przetworzenie
npm run enrich -- --refresh     # odśwież same adresy fragmentów
npm run enrich -- --verify-years # sprawdź roczniki w MusicBrainz
```

**Rok pochodzi z ręcznie skuratorowanych list kandydatów, nigdy z iTunes.** Pole
`releaseDate` z iTunes to data pozycji w sklepie — „Take On Me" wraca stamtąd z rokiem 2010,
bo taki jest remaster. Skrypt bierze z iTunes wyłącznie `previewUrl`.

Utwory bez trafienia lądują w `data/rejected.json` z powodem odrzucenia. Na koniec skrypt
wypisuje statystykę na rocznik i listę pustych roczników — to one ograniczają liczbę
utworów w grze.

### iTunes ogranicza liczbę zapytań

Apple dławi ruch z jednego adresu IP i sygnalizuje to kodem **403**, nie tylko 429.
Skrypt sam rozsuwa zapytania w czasie, gdy zacznie się odbijać, a odpowiedzi zapisuje
w `data/.itunes-cache.json` — ponowne uruchomienie ruszy od miejsca, w którym stanęło.
Po 20 odbiciach z rzędu przerywa z komunikatem, zamiast mielić godzinami.

Pełny przebieg 400 wpisów trwa od kilku minut do pół godziny, zależnie od humoru Apple.

---

## Wdrożenie na GitHub Pages

Repozytorium jest już na GitHubie. Zostało włączyć Pages — **raz**:

1. Wejdź na **Settings** → **Pages** w repozytorium.
2. W **Source** wybierz **Deploy from a branch**.
3. Branch: **main**, katalog: **/ (root)**. Kliknij **Save**.
4. Odczekaj minutę i odśwież stronę Settings → Pages — pojawi się adres:
   `https://poczta-cpu.github.io/MusicQuiz/`

Od tej pory **każdy `git push` na `main` publikuje zmiany.** Żadnej konfiguracji,
żadnych kluczy, żadnego builda.

Plik `.nojekyll` wyłącza przetwarzanie przez Jekyll — pliki idą na serwer takie, jakie są.

### Repozytorium musi być publiczne

Na darmowym koncie GitHub Pages działa wyłącznie z publicznych repozytoriów.
Nie ma to znaczenia dla bezpieczeństwa tej gry: opublikowana strona i tak musi być
dostępna bez logowania, bo goście otwierają ją na swoich telefonach. Wszystko, co
w repozytorium widać, przeglądarka i tak pobiera przy wejściu na stronę.

---

## Struktura

```
index.html          rozdroże: gracz albo prowadzący
host.html           ekran prowadzącego
gracz.html          ekran gracza
css/styl.css        wspólny arkusz stylów

js/kody.js          kod pokoju (52-bitowa maska lat w base32) i klucz odpowiedzi
js/transport.js     publishRoom / joinRoom / publishKey / fetchKey
js/dane.js          wczytanie bazy, filtry, walidacja konfiguracji
js/losowanie.js     dobór roczników i utworów
js/arkusz.js        reguły układanki gracza (bez DOM)
js/punktacja.js     liczenie wyniku na telefonie
js/magazyn.js       localStorage kluczowany kodem pokoju
js/odtwarzacz.js    odtwarzanie fragmentu i limit dwóch odtworzeń
js/host.js          ekran prowadzącego
js/gracz.js         ekran gracza

data/candidates/    listy kandydatów (wejście)
data/songs.json     baza używana przez grę (wyjście)
data/rejected.json  utwory bez trafienia w iTunes

scripts/enrich.mjs  budowanie bazy
scripts/serwer.mjs  serwer do testów lokalnych
tests/test.mjs      testy logiki
vendor/             wendorowane biblioteki QR
```

### Dlaczego `transport.js` jest osobno

Cała komunikacja prowadzący → telefony przechodzi przez jeden moduł z czterema funkcjami.
Reszta kodu nie wie, że pod spodem jest kod QR. Gdyby kiedyś doszła wersja z chmurą,
podmienia się ten jeden plik zamiast przepisywać oba ekrany.

---

## Biblioteki

Wendorowane do `vendor/`, bez CDN i bez zależności w czasie działania gry:

- [`qrcode.js`](https://github.com/kazuhikoarase/qrcode-generator) — generator kodów QR,
  Kazuhiko Arase, licencja MIT
- [`jsQR.js`](https://github.com/cozmo/jsQR) — dekoder kodów QR, licencja Apache-2.0

Skaner ma **zawsze** dostępne pole do wklejenia kodu tekstowego — na wypadek odmowy
dostępu do aparatu.
