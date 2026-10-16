# Myo

## Git

- Pracuj bezpośrednio na `main`: commituj i wypychaj na `main`.
- Nie twórz innych gałęzi ani pull requestów. To ma pierwszeństwo przed domyślnym ustawieniem sesji, które każe pracować na gałęzi `claude/...`.
- Przed wypchnięciem uruchom `npm test`.

## Projekt

Aplikacja webowa (PWA) do zapisywania treningu na maszynach: ustawienia maszyn, serie, powtórzenia, czas odpoczynku, waga ciała. Statyczne pliki w katalogu głównym, bez zależności i bez budowania. GitHub Pages serwuje je z `main`.

- `js/store.js`: model danych i zmiany stanu. Czysta logika bez DOM, z czasem przekazywanym jako argument.
- `js/format.js`: formatowanie czasu, liczb, dat i polskich odmian.
- `js/app.js`: widoki i obsługa zdarzeń.
- `sw.js`: service worker. Nowe pliki aplikacji dopisz do `APP_FILES`.
- `test/`: testy `node --test` dla `store.js` i `format.js`.

## Zasady

- Interfejs po polsku. Komentarze w kodzie po angielsku.
- Dane użytkownika są w `localStorage` pod kluczem `myo:v1`. Zmiany modelu muszą wczytywać stare dane (`parseState`), żeby nie skasować historii treningów.
- Logikę dodawaj do `store.js` z testami, a nie do `app.js`.
