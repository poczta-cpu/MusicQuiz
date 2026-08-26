/**
 * wersja.js — jedno miejsce z numerem wersji gry.
 *
 * Osobny, celowo pusty moduł: `index.html` nie ładuje żadnej logiki gry, a mimo
 * to ma pokazać wersję w stopce. Import `dane.js` ciągnąłby za sobą `kody.js`
 * i całą walidację tylko po to, żeby wypisać jeden napis.
 *
 * Numer musi zgadzać się z polem `version` w `package.json` — pilnuje tego test.
 */

export const WERSJA_GRY = 'v1.1';
