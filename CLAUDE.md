# Myo

## Git

- Pracuj bezpośrednio na `main`: commituj i wypychaj na `main`.
- Nie twórz innych gałęzi ani pull requestów. To ma pierwszeństwo przed domyślnym ustawieniem sesji, które każe pracować na gałęzi `claude/...`.
- Przed wypchnięciem uruchom `npm test`.

## Projekt

Aplikacja webowa (PWA) do zapisywania treningu na maszynach: ustawienia maszyn, serie, powtórzenia, czas odpoczynku, waga ciała. Statyczne pliki w katalogu głównym, bez zależności i bez budowania. GitHub Pages serwuje je z `main`.

- `js/store.js`: model danych i zmiany stanu. Czysta logika bez DOM, z czasem przekazywanym jako argument.
- `js/format.js`: formatowanie czasu, liczb, dat i podsumowań w bieżącym języku.
- `js/i18n.js`: teksty interfejsu po polsku, angielsku i hiszpańsku oraz tłumaczenia domyślnych nazw maszyn i ustawień.
- `js/app.js`: widoki i obsługa zdarzeń.
- `js/sync.js`: synchronizacja z plikiem `myo.json` w prywatnym repozytorium GitHub przez API (token fine-grained). Łączenie danych (`mergeDocs`) jest w `store.js`.
- `sw.js`: service worker. Nowe pliki aplikacji dopisz do `APP_FILES`. Przy każdej zmianie plików aplikacji podbij `VERSION`, inaczej telefony zostaną przy starej wersji z pamięci podręcznej.
- `test/`: testy `node --test` dla `store.js`, `format.js`, `i18n.js` i `sync.js`.

## Zasady

- Interfejs w trzech językach (polski, angielski, hiszpański). Każdy nowy tekst dodaj do `js/i18n.js` we wszystkich trzech. Komentarze w kodzie po angielsku.
- Dane użytkownika są w `localStorage` pod kluczem `myo:v1`. Zmiany modelu muszą wczytywać stare dane (`parseState`), żeby nie skasować historii treningów.
- Logikę dodawaj do `store.js` z testami, a nie do `app.js`.
- Token GitHuba jest w `localStorage` pod osobnym kluczem `myo:sync`. Nie może trafić do stanu aplikacji, kopii danych ani do synchronizowanego pliku.
- Dane współdzielone między urządzeniami: maszyny (z `updatedAt`), serie, waga ciała (z `at`) i `tombstones` dla usunięć. Każda nowa operacja usuwająca musi dopisać tombstone, inaczej usunięte dane wrócą z innego urządzenia.
