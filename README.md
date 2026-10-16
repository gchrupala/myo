# Myo

Dziennik treningu na maszynach na siłowni. Działa w przeglądarce telefonu i da się go zainstalować jak zwykłą aplikację (PWA). Działa też bez internetu.

## Co robi

- **Maszyny z ustawieniami.** Każda maszyna ma swoje ustawienia, na przykład ciężar i pozycję siedziska. Aplikacja pamięta ostatnie wartości. Ustawienia można dodawać, zmieniać i usuwać w edycji maszyny.
- **Stos ciężarków jak na maszynie.** Ciężar wybiera się tak jak na panelu maszyny: lista płytek z opisem w funtach (lb) i kilogramach, bolec w wybranej płytce i tarcza do małych dodatków. Aplikacja zapisuje płytkę, pozycję tarczy i przybliżoną sumę w kg. Liczbę płytek, ich opisy i tarczę ustawia się w edycji maszyny. Tarcza ma domyślnie pozycje 0, 5, 10, 15 lb. Stosy płytek różnią się między maszynami:

  | Maszyna | Płytki (kg) | Płytki (lb) | Ostatnie ustawienie (16.10) |
  | --- | --- | --- | --- |
  | Podciąganie, Pompki na poręczach | 4,5; 8,5; 12,5 … co 4 | 10; 18,5; 27 … co 8,5 | 16,5 kg; 8,5 kg |
  | Wyciskanie nad głowę, Wyciskanie na klatkę | 4,5; 13,5; 22,5 … co 9 | 10; 30; 50 … co 20 | 31,5 kg + 15 lb; 49,5 kg + 5 lb |
  | Brzuch, Wiosłowanie | 4; 13; 22 … co 9 (założenie, do sprawdzenia) | 10; 30; 50 … co 20 | 67 kg + 10 lb |

  Inny stos albo tarczę ustawisz w edycji maszyny.
- **Liczenie powtórzeń i serii.** Dotykasz dużego koła przy każdym powtórzeniu. „Zakończ serię” zapisuje serię z datą, liczbą powtórzeń i ustawieniami, z którymi była zrobiona.
- **Czas odpoczynku.** Po zakończeniu serii koło odmierza odpoczynek. Po upływie wybranego celu (0:45–3:00) koło zmienia kolor, telefon wibruje (Android) i, jeśli włączony, gra krótki sygnał. Pierwsze dotknięcie w kolejnej serii kończy odpoczynek i zapisuje jego długość przy tej serii.
- **Cardio.** Głównym ustawieniem taśmy jest energia w kcal; to ona jest na pierwszym miejscu w historii. Do tego prędkość, nachylenie i stoper zamiast licznika powtórzeń. Trening można zapisać z samą energią, bez włączania stopera.
- **Waga ciała.** Na ekranie głównym wpisujesz swoją wagę. Zapisuje się z dzisiejszą datą, jedna wartość na dzień.
- **Historia.** Dni od najnowszego, z wagą ciała, seriami, ustawieniami i odpoczynkami. Pomyłkę można usunąć.
- **Poprzedni trening.** Na ekranie maszyny widać, co było zrobione ostatnim razem.

Domyślne maszyny: Podciąganie, Pompki na poręczach, Brzuch, Wyciskanie nad głowę, Wiosłowanie, Wyciskanie na klatkę, Pośladki, Taśma.

Ekran nie gaśnie, dopóki otwarty jest ekran ćwiczenia (jeśli przeglądarka na to pozwala).

## Gdzie są dane

Wszystko jest zapisane tylko w przeglądarce na telefonie (`localStorage`). Nie ma serwera ani konta. W zakładce Historia są przyciski „Pobierz kopię” i „Wczytaj kopię” (plik JSON), żeby przenieść dane na inny telefon albo zabezpieczyć je przed wyczyszczeniem danych przeglądarki.

## Uruchomienie z tego repozytorium (GitHub Pages)

Aplikacja to statyczne pliki w katalogu głównym repozytorium, bez budowania. Jednorazowo:

1. Na GitHubie: **Settings → Pages**.
2. **Source:** „Deploy from a branch”.
3. **Branch:** gałąź z kodem (np. `main`) i katalog `/ (root)`. **Save**.

Po minucie aplikacja będzie pod adresem `https://gchrupala.github.io/myo/`. Każdy push na tę gałąź aktualizuje stronę.

## Instalacja na telefonie

- **Android (Chrome):** otwórz adres, menu ⋮ → „Zainstaluj aplikację” albo „Dodaj do ekranu głównego”.
- **iPhone (Safari):** otwórz adres, przycisk Udostępnij → „Do ekranu początkowego”.

Nowa wersja pojawia się przy drugim uruchomieniu po aktualizacji (pierwsze pobiera ją w tle).

## Praca nad kodem

```sh
npm start   # serwer lokalny na http://localhost:8080
npm test    # testy logiki (Node 18+)
```

Bez zależności i bez kroku budowania.

| Plik | Co zawiera |
| --- | --- |
| `index.html` | strona, manifest, ikony |
| `styles.css` | wygląd, jasny i ciemny motyw |
| `js/store.js` | model danych: maszyny, serie, odpoczynek, waga ciała, zapis i odczyt |
| `js/format.js` | formatowanie czasu, liczb, dat i polskich odmian |
| `js/app.js` | widoki i obsługa dotknięć |
| `sw.js` | praca bez internetu (service worker) |
| `test/` | testy `node --test` dla `store.js` i `format.js` |

## Ograniczenia

- Na iPhonie nie ma wibracji, a sygnał dźwiękowy może nie zagrać przy włączonym trybie cichym.
- Sygnał końca odpoczynku działa, gdy aplikacja jest na ekranie. Przy zablokowanym telefonie przeglądarka wstrzymuje liczniki; czas jest liczony poprawnie, ale sygnał nie zagra.
- Dane nie synchronizują się między urządzeniami.
