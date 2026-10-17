# Myo

Dziennik treningu na maszynach na siłowni. Działa w przeglądarce telefonu i da się go zainstalować jak zwykłą aplikację (PWA). Działa też bez internetu.

## Co robi

- **Maszyny z ustawieniami.** Każda maszyna ma swoje ustawienia, na przykład ciężar i pozycję siedziska. Aplikacja pamięta ostatnie wartości. Ustawienia można dodawać, zmieniać i usuwać w edycji maszyny.
- **Stos ciężarków jak na maszynie.** Ciężar wybiera się tak jak na panelu maszyny: lista płytek z opisem w funtach (lb) i kilogramach, bolec w wybranej płytce i tarcza do małych dodatków. Aplikacja zapisuje płytkę, pozycję tarczy i przybliżoną sumę w kg. Liczbę płytek, ich opisy i tarczę ustawia się w edycji maszyny. Tarcza ma domyślnie pozycje 0, 5, 10, 15 lb. Stosy płytek różnią się między maszynami:

  | Maszyna | Płytki (kg) | Płytki (lb) | Ostatnie ustawienie (16.10) |
  | --- | --- | --- | --- |
  | Podciąganie, Pompki na poręczach | 4,5; 8,5; 12,5 … co 4 | 10; 18,5; 27 … co 8,5 | 16,5 kg; 8,5 kg |
  | Wyciskanie nad głowę, Wyciskanie na klatkę | 4,5; 13,5; 22,5 … co 9 | 10; 30; 50 … co 20 | 31,5 kg + 15 lb; 49,5 kg + 5 lb |
  | Brzuch, Wiosłowanie | 4; 13; 22 … co 9 (założenie, do sprawdzenia) | 9; 29; 49 … co 20 (przeliczone z kg) | 67 kg + 10 lb |

  Podciąganie i pompki na poręczach to maszyny z asystą, więc ich panel ma też pozycję 0 kg (bez asysty). Inny stos, tarczę albo pozycję 0 kg ustawisz w edycji maszyny. Opisy płytek w kg i lb są tam powiązane: wpisanie jednego przelicza drugie (z zaokrągleniem do 0,5, jak na maszynach), a przy zapisie opisy niezgodne o więcej niż 0,5 kg są poprawiane.
- **Serie i powtórzenia.** Po serii ustawiasz liczbę powtórzeń (− i +, aplikacja pamięta ostatnią, na początek 8) i naciskasz „Zapisz serię”. Seria zapisuje się z datą, powtórzeniami i ustawieniami maszyny.
- **Czas odpoczynku.** Zapisanie serii uruchamia odpoczynek: koło odlicza od wybranego celu (0:45–3:00) do zera. Potem pokazuje nadmiar, np. „+0:12”, robi się żółte, telefon wibruje (Android) i, jeśli włączony, gra krótki sygnał. Kolejną serię zapisujesz tym samym przyciskiem.
- **Cardio.** Głównym ustawieniem taśmy jest energia w kcal; to ona jest na pierwszym miejscu w historii. Do tego prędkość, nachylenie i stoper zamiast licznika powtórzeń. Trening można zapisać z samą energią, bez włączania stopera.
- **Waga ciała.** Na ekranie głównym wpisujesz swoją wagę. Zapisuje się z dzisiejszą datą, jedna wartość na dzień.
- **Historia.** Dni od najnowszego, z wagą ciała, seriami, ustawieniami i odpoczynkami. Pomyłkę można usunąć.
- **Poprzedni trening.** Na ekranie maszyny widać, co było zrobione ostatnim razem.
- **Język.** Ikona koła zębatego otwiera ustawienia. Do wyboru: język systemu, polski, angielski, hiszpański. Domyślne nazwy maszyn i ustawień też zmieniają język, nazwy wpisane ręcznie zostają bez zmian.

Domyślne maszyny: Podciąganie, Pompki na poręczach, Brzuch, Wyciskanie nad głowę, Wiosłowanie, Wyciskanie na klatkę, Pośladki, Taśma.

Ekran nie gaśnie, dopóki otwarty jest ekran ćwiczenia (jeśli przeglądarka na to pozwala).

## Gdzie są dane

Dane są zapisane w przeglądarce na telefonie (`localStorage`). Nie ma serwera ani konta. W zakładce Historia są przyciski „Pobierz kopię” i „Wczytaj kopię” (plik JSON).

### Synchronizacja z GitHubem

W ustawieniach (koło zębate) można połączyć aplikację z prywatnym repozytorium na GitHubie. Dane trafiają wtedy do pliku `myo.json` w tym repozytorium i stamtąd na inne urządzenia połączone z tym samym repozytorium. Każda synchronizacja to commit, więc zostaje historia zmian.

1. Załóż prywatne repozytorium z plikiem README, np. `myo-data`: [github.com/new?name=myo-data&visibility=private](https://github.com/new?name=myo-data&visibility=private). Publicznego aplikacja nie przyjmie, bo dane zawierają m.in. wagę ciała.
2. Utwórz token: [ten link](https://github.com/settings/personal-access-tokens/new?name=Myo&description=Myo+sync&expires_in=366&contents=write) wypełnia nazwę, ważność na rok i uprawnienie „Contents: Read and write”. Sam wybierz w „Repository access” → „Only select repositories” to repozytorium. Po wygaśnięciu tokena aplikacja pokaże komunikat.
3. W aplikacji: Ustawienia → Synchronizacja z GitHubem → wpisz `właściciel/nazwa` repozytorium i token → „Połącz”.

Kiedy aplikacja synchronizuje: po otwarciu, po powrocie do niej, kilkanaście sekund po każdej zmianie, po odzyskaniu internetu i na żądanie („Synchronizuj teraz”). Bez internetu zmiany czekają.

Jak łączy dane z kilku urządzeń: serie z obu urządzeń zostają (usunięte serie zostają usunięte), przy maszynach wygrywa wersja zmieniona później, przy wadze ciała wygrywa nowszy wpis z danego dnia. Urządzenie łączone po raz pierwszy z repozytorium, w którym są już dane, przejmuje stamtąd maszyny zamiast swoich domyślnych. Język, dźwięk i trwające ćwiczenie zostają na każdym urządzeniu osobno.

Token jest zapisany tylko w przeglądarce tego urządzenia, osobno od danych: nie trafia do repozytorium ani do kopii danych. „Odłącz” go usuwa.

## Uruchomienie z tego repozytorium (GitHub Pages)

Aplikacja to statyczne pliki w katalogu głównym repozytorium, bez budowania. Jednorazowo:

1. Na GitHubie: **Settings → Pages**.
2. **Source:** „Deploy from a branch”.
3. **Branch:** gałąź z kodem (np. `main`) i katalog `/ (root)`. **Save**.

Po minucie aplikacja będzie pod adresem `https://gchrupala.github.io/myo/`. Każdy push na tę gałąź aktualizuje stronę.

## Instalacja na telefonie

- **Android (Chrome):** otwórz adres, menu ⋮ → „Zainstaluj aplikację” albo „Dodaj do ekranu głównego”.
- **iPhone (Safari):** otwórz adres, przycisk Udostępnij → „Do ekranu początkowego”.

Po aktualizacji nowa wersja ładuje się sama: chwilę po otwarciu aplikacja raz się przeładowuje. Zapisane dane i trwające ćwiczenie zostają.

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
| `js/format.js` | formatowanie czasu, liczb, dat i podsumowań w bieżącym języku |
| `js/i18n.js` | teksty interfejsu (pl, en, es) i tłumaczenia domyślnych nazw |
| `js/app.js` | widoki i obsługa dotknięć |
| `js/sync.js` | synchronizacja z plikiem w repozytorium GitHub (API, łączenie zmian) |
| `sw.js` | praca bez internetu (service worker) |
| `test/` | testy `node --test` dla `store.js`, `format.js`, `i18n.js` i `sync.js` |

## Ograniczenia

- Na iPhonie nie ma wibracji, a sygnał dźwiękowy może nie zagrać przy włączonym trybie cichym.
- Sygnał końca odpoczynku działa, gdy aplikacja jest na ekranie. Przy zablokowanym telefonie przeglądarka wstrzymuje liczniki; czas jest liczony poprawnie, ale sygnał nie zagra.
- Synchronizacja działa tylko w wersji z GitHub Pages; w podglądzie na claude.ai przeglądarka blokuje połączenia z GitHubem.
