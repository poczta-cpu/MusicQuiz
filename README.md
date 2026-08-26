# Kalendarz muzyczny

Impreza w jednym pokoju. Prowadzący puszcza z głośnika 30-sekundowe fragmenty utworów,
gracze na swoich telefonach przypisują każdy utwór do roku wydania.

**Każdy rok może być użyty dokładnie raz.** To zamienia grę w łamigłówkę logiczną,
a nie serię niezależnych zgadywanek — pomyłka przy jednym utworze zabiera rocznik,
który mógł się przydać przy następnym.

**Adres gry:** https://poczta-cpu.github.io/MusicQuiz/

---

## Jak zagrać

**Prowadzący** otwiera stronę na laptopie podpiętym do głośnika, wybiera *Prowadzę grę*
i loguje się (dane niżej). Ustawia liczbę utworów, zakres lat, repertuar i **tryb
rozgrywki**, po czym gra losuje utwory i pokazuje kod QR z kodem pokoju.

**Gracze** skanują kod telefonami albo wpisują adres ręcznie i przepisują kod pokoju.
Podają imię i dostają kolumnę roczników.

Potem, dla każdego utworu:

1. Prowadzący klika **Odtwórz** — leci fragment. Można go powtórzyć **najwyżej raz**.
   Fragmentu nie trzeba dosłuchać do końca.
2. Każdy przypisuje utwór do rocznika na swoim telefonie.
3. Prowadzący mówi na głos „dalej" i klika **Następny utwór**.

`Następny utwór` jest **zablokowany, dopóki fragment nie poleci choć raz** — inaczej
jedno przypadkowe kliknięcie przewija utwór, którego nikt nie usłyszał, a gracze i tak
muszą przypisać mu rocznik. Gdyby odtworzenie się nie udało (wygasły adres fragmentu,
odmowa przeglądarki), przejście się odblokowuje — nie ma jak utknąć na uszkodzonym
utworze. `Zakończ grę` działa zawsze.

To, co dzieje się w punkcie 2, zależy od trybu — patrz niżej.

Po ostatnim utworze prowadzący pokazuje kod QR z kluczem odpowiedzi. Telefony liczą
wyniki same i pokazują je razem z tytułami. **Wyniki odczytujecie na głos.**

Listy na końcu — i u gracza, i u prowadzącego — mają przełącznik porządku:
**po roku** albo **po kolejności odtwarzania**. Numer utworu zostaje przy wierszu
niezależnie od wyboru.

**Prowadzący gra na równi z resztą.** Jego ekran nie pokazuje roku — odpala fragment
z laptopa i odpowiada na własnym telefonie jak każdy.

### Dwa tryby rozgrywki

Tryb wybiera prowadzący przed startem i **jedzie w kodzie pokoju**, więc telefony
ustawiają się same. Nie da się grać w jednym pokoju w dwóch różnych trybach — tryb
swobodny daje wyraźnie wyższe wyniki i punktacja przestałaby być porównywalna.

**Rundowy** (domyślny). Wybór rocznika można zmieniać dowolnie długo, ale kliknięcie
**Zatwierdź** blokuje go **nieodwracalnie** i przesuwa telefon na kolejny utwór.
Zatwierdzony rok zostaje w kolumnie wyszarzony — widać, co jeszcze zostało.

**Swobodny.** Przypisania żyją przez całą grę i układa się je **dwoma tapnięciami**:

- Bieżący utwór czeka „w ręce" sam z siebie — jedno tapnięcie rocznika kładzie go
  na miejsce i przesuwa arkusz dalej.
- Tapnięcie obsadzonego rocznika **pustą ręką** bierze stamtąd utwór; drugie tapnięcie
  kładzie go gdzie indziej. Położenie na zajętym roczniku **zamienia oba utwory
  miejscami**.
- Utwory bez rocznika czekają na liście u góry ekranu. Tapnięcie żetonu bierze utwór
  do ręki albo go odkłada.
- **Dalej** przechodzi do kolejnego utworu bez przypisywania czegokolwiek.
- Przy ostatnim utworze przycisk zmienia się w **Zamroź listę**. Dopiero to zamyka
  arkusz, wystawia godzinę i otwiera ekran klucza odpowiedzi. Utwory bez rocznika
  zostają pominięte — gra pyta o to wprost.

### Przy remisie

Telefon zapisuje godzinę zegarową w momencie zamknięcia arkusza — w trybie rundowym
przy zatwierdzeniu ostatniego utworu, w swobodnym przy zamrożeniu listy.
Przy tej samej liczbie punktów wygrywa wcześniejsza godzina. Zegary telefonów są
synchronizowane przez sieć, więc porównanie co do sekundy jest wiarygodne.

### Kody

Kod pokoju jest wyświetlany w grupach po cztery znaki i jego długość zależy od rozmiaru
gry — od ośmiu znaków przy dziesięciu utworach do dziesięciu w najgorszym przypadku.
Wielkość liter, spacje i myślniki nie mają znaczenia przy przepisywaniu; alfabet pomija
`I`, `L`, `O` i `U`, żeby nie myliły się z cyframi.

Krótszy kod nie jest możliwy. Kod pokoju musi unieść zbiór N roczników wybranych z 47,
a dla dziesięciu utworów to ponad 15 miliardów możliwości — czterocyfrowy kod ma ich
dziesięć tysięcy. Bez serwera nie ma gdzie wymienić krótkiego kodu na dane, więc musi
być samowystarczalny.

**Tryb rozgrywki nie wydłużył kodu ani o znak.** Lista długości gry ma pięć pozycji
(10–30 co 5), więc jej indeks mieści się w trzech bitach zamiast czterech — zwolniony
bit poszedł na tryb. Dopisanie szóstej długości ten zapas skasuje i wszystkie kody
urosną; patrz `DLUGOSCI_W_NAGLOWKU` w `js/kody.js`.

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
3. **Gracz może zwlekać z zamknięciem wyboru** i podjąć decyzję po usłyszeniu kolejnego
   utworu. Bez chmury nie da się tego wykryć. Tryb swobodny robi z tego regułę zamiast
   nadużycia — dlatego daje wyższe wyniki i dlatego cały pokój musi grać w tym samym trybie.
4. **Fragment to 30 sekund z iTunes**, zwykle refren. Ani długości, ani punktu startowego
   nie da się wybrać.
5. **Adresy fragmentów mogą z czasem wygasnąć.** Wtedy: `npm run enrich -- --refresh`.
6. **Hasło prowadzącego jest jawne** — patrz wyżej.
7. **Prowadzący ma klucz odpowiedzi w przeglądarce** od początku gry. Nie jest renderowany
   na ekranie, ale zdeterminowany prowadzący znajdzie go w konsoli. Klucz trafia też do
   `localStorage`, żeby odświeżenie strony na laptopie nie skasowało rozgrywki w połowie.
8. **Baza pokrywa lata 1980–2019** (391 utworów, 40 roczników, każdy rocznik pełny). Pola roku
   przyjmują 1980–2026; specyfikacja mówiła o 1975, ale przed 1980 nie ma i nie będzie utworów,
   więc dolna granica poszła w górę — to zawęziło zakres kodu pokoju z 52 roczników do 47.
   Powyżej 2019 nadal nic nie ma. Licznik „dostępne roczniki" pokazuje to na żywo,
   a walidacja odrzuci taki wybór z konkretnym komunikatem.
9. **Rozgrywka ma 10–30 utworów, co 5.** Testowe długości 3 i 5 oraz warianty 35 i 40 zniknęły
   z listy: pięć pozycji mieści się w trzech bitach nagłówka kodu pokoju, dzięki czemu tryb
   rozgrywki wszedł do kodu bez wydłużania go.

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

68 testów logiki: kodowanie kodów, walidacja konfiguracji, losowanie, reguły układanki
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
npm run enrich -- --offline      # zbuduj bazę z samego cache, bez ruchu sieciowego
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
js/arkusz.js        reguły układanki gracza, oba tryby (bez DOM)
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
