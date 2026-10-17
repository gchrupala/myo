// Interface languages. t(key, vars) looks a string up in the current
// language. A value is text with {name} placeholders, or a function of the
// variables where the wording depends on a number (plural forms).

export const LANGUAGES = { pl: 'Polski', en: 'English', es: 'Español' };
const LOCALES = { pl: 'pl-PL', en: 'en-GB', es: 'es-ES' };

let current = 'pl';

const rules = {};
// Picks the form for n by the language's plural rules (Polish has one, few
// and many: 1 seria, 2 serie, 5 serii).
function pick(lang, n, forms) {
  rules[lang] ??= new Intl.PluralRules(LOCALES[lang]);
  return forms[rules[lang].select(n)] ?? forms.other;
}
const pl = (n, one, few, many) => pick('pl', n, { one, few, many, other: many });
const en = (n, one, other) => pick('en', n, { one, other });
const es = (n, one, other) => pick('es', n, { one, other });

const STRINGS = {
  pl: {
    'tab.machines': 'Maszyny',
    'tab.history': 'Historia',
    'nav.view': 'Widok',
    'nav.back': 'Wróć',
    'nav.settings': 'Ustawienia',
    'storage.notice': 'Ta przeglądarka nie zapisuje danych (na przykład w trybie prywatnym). Serie znikną po zamknięciu strony.',

    'day.today': 'Dzisiaj',
    'day.yesterday': 'Wczoraj',
    'day.todayMid': 'dzisiaj',
    'day.yesterdayMid': 'wczoraj',

    'banner.active': 'Trwa',
    'banner.paused': 'pauza',
    'banner.rest': 'odpoczynek',
    'banner.waiting': 'czeka na serię',

    'aria.less': '{label}: mniej',
    'aria.more': '{label}: więcej',

    'bw.label': 'Twoja waga',
    'bw.aria': 'Waga',
    'bw.savedDiff': 'Zapisano na dzisiaj. Od {since}: {diff} kg.',
    'bw.saved': 'Zapisano na dzisiaj.',
    'bw.last': 'Ostatnio {kg} kg ({day}). Wpisz dzisiejszą albo użyj − i +.',
    'bw.empty': 'Wpisz, a zapisze się z dzisiejszą datą.',

    'home.last': 'Ostatnio {day} · {summary}',
    'home.never': 'Jeszcze bez zapisanych serii',
    'home.add': 'Dodaj maszynę',

    'ex.edit': 'Edytuj',
    'ex.noSettings': 'Ta maszyna nie ma ustawień. Dodasz je w edycji.',
    'ex.settingsAria': 'Ustawienia maszyny',
    'ex.restTarget': 'Cel odpoczynku',
    'ex.sound': 'Dźwięk po upływie celu',
    'ex.end': 'Zakończ ćwiczenie',
    'ex.previous': 'Poprzednio · {day}',

    'stack.hint': 'Dotknij płytki, w którą wkładasz bolec.',
    'dial.name': 'Tarcza',
    'dial.less': 'Tarcza: mniej',
    'dial.more': 'Tarcza: więcej',
    'dial.caption': 'tarcza, {unit}',

    'plate.rest': 'odpoczynek',
    'hint.restDone': 'Minął cel {target}. Czas na serię {n}.',
    'hint.rest': 'Cel odpoczynku: {target}.',
    'hint.ready': 'Zrób serię, ustaw powtórzenia i zapisz.',
    'plate.set': 'seria',
    'ex.reps': 'Powtórzenia',
    'ex.saveSet': 'Zapisz serię {n}',
    'ex.timerAria': 'Minutnik odpoczynku',

    'cardio.aria': 'Stoper',
    'cardio.running': 'trwa',
    'cardio.paused': 'pauza',
    'cardio.stopwatch': 'stoper',
    'cardio.hintRunning': 'Dotknij, aby zatrzymać.',
    'cardio.hintPaused': 'Dotknij, aby wznowić.',
    'cardio.hintReady': 'Dotknij, aby włączyć stoper.',
    'cardio.stop': 'Zatrzymaj stoper',
    'cardio.start': 'Włącz stoper',
    'cardio.finish': 'Zapisz i zakończ',

    'set.reps': ({ n }) => `${n} powt.`,
    'set.rest': 'odpoczynek {time}',
    'set.delete': 'Usuń',
    'set.confirm': 'Usunąć?',
    'sum.sets': ({ n, reps }) => `${n} ${pl(n, 'seria', 'serie', 'serii')}: ${reps} powt.`,

    'hist.weight': 'waga {kg} kg',
    'hist.sets': ({ n, reps }) => `${n} ${pl(n, 'seria', 'serie', 'serii')}, ${reps} powt.`,
    'hist.emptyTitle': 'Historia jest pusta',
    'hist.emptyText': 'Wybierz maszynę w zakładce Maszyny, zrób serię, ustaw liczbę powtórzeń i naciśnij „Zapisz serię”. Seria trafi tutaj z datą i ustawieniami.',

    'data.title': 'Kopia danych',
    'data.note': 'Dane są zapisane tylko w tej przeglądarce, na tym telefonie. Pobierz kopię przed zmianą telefonu albo wyczyszczeniem danych przeglądarki.',
    'data.export': 'Pobierz kopię',
    'data.import': 'Wczytaj kopię',
    'data.confirm': ({ machines, sets }) =>
      `Plik zawiera ${machines} ${pl(machines, 'maszynę', 'maszyny', 'maszyn')} i ${sets} ${pl(sets, 'serię', 'serie', 'serii')}. Obecne dane zostaną zastąpione.`,
    'data.replace': 'Zastąp dane',
    'data.cancel': 'Anuluj',
    'data.errorParse': 'Nie udało się wczytać pliku. To nie jest kopia danych Myo.',
    'data.errorRead': 'Nie udało się odczytać pliku.',

    'edit.titleEdit': 'Edytuj maszynę',
    'edit.titleNew': 'Nowa maszyna',
    'edit.name': 'Nazwa',
    'edit.namePlaceholder': 'np. Prasa nożna',
    'edit.type': 'Rodzaj',
    'edit.typeStrength': 'Siłowa: serie i powtórzenia',
    'edit.typeCardio': 'Cardio: stoper',
    'edit.settings': 'Ustawienia',
    'edit.settingsNote': 'Na przykład ciężar, wysokość siedziska, pozycja oparcia. „Stos ciężarków” to płytki z bolcem i tarczą do małych dodatków, opisane tak jak na maszynie.',
    'edit.fieldName': 'Nazwa ustawienia',
    'edit.fieldPlaceholder': 'np. Oparcie',
    'edit.kind': 'Rodzaj ustawienia',
    'edit.kindNumber': 'Liczba',
    'edit.kindStack': 'Stos ciężarków',
    'edit.removeField': 'Usuń ustawienie {label}',
    'edit.plates': 'Płytek',
    'edit.firstPlate': 'Pierwsza płytka',
    'edit.firstKg': 'Pierwsza płytka w kg',
    'edit.firstLb': 'Pierwsza płytka w funtach',
    'edit.nextPlate': 'Każda następna',
    'edit.nextKg': 'Każda następna płytka w kg',
    'edit.nextLb': 'Każda następna płytka w funtach',
    'edit.dialCount': 'Tarcza: pozycji',
    'edit.noDial': '0 = bez tarczy',
    'edit.dialStep': 'Tarcza: co',
    'edit.dialUnit': 'Jednostka tarczy',
    'edit.zero': 'Pozycja 0 kg nad płytkami (np. maszyna z asystą: bez asysty)',
    'edit.unit': 'Jednostka',
    'edit.step': 'Krok − i +',
    'edit.addField': 'Dodaj ustawienie',
    'edit.save': 'Zapisz',
    'edit.delete': 'Usuń maszynę',
    'edit.deleteConfirm': 'Na pewno usunąć?',
    'edit.deleteNote': 'Zapisane serie zostaną w historii.',
    'edit.nameError': 'Podaj nazwę maszyny.',

    'settings.title': 'Ustawienia',
    'settings.language': 'Język',
    'settings.system': 'Systemowy ({name})',
    'settings.languageNote': 'Domyślne nazwy maszyn i ustawień też zmienią język. Nazwy wpisane ręcznie zostają bez zmian.',

    'sync.title': 'Synchronizacja z GitHubem',
    'sync.intro': 'Dane trafiają do pliku myo.json w Twoim prywatnym repozytorium i stamtąd na inne urządzenia. Każda zmiana to commit, więc zostaje historia.',
    'sync.step1': 'Załóż na GitHubie prywatne repozytorium (z plikiem README), np. myo-data:',
    'sync.step2': 'Utwórz token: link wypełnia uprawnienie Contents: Read and write i ważność na rok; w „Repository access” wybierz tylko to repozytorium:',
    'sync.step3': 'Wpisz poniżej nazwę repozytorium i token.',
    'sync.repo': 'Repozytorium',
    'sync.repoPlaceholder': 'właściciel/nazwa',
    'sync.token': 'Token',
    'sync.connect': 'Połącz',
    'sync.connecting': 'Łączę…',
    'sync.connected': 'Połączono z {repo}.',
    'sync.last': 'Ostatnia synchronizacja: {when}.',
    'sync.never': 'Jeszcze bez synchronizacji.',
    'sync.busy': 'Synchronizuję…',
    'sync.now': 'Synchronizuj teraz',
    'sync.disconnect': 'Odłącz',
    'sync.disconnectConfirm': 'Na pewno odłączyć?',
    'sync.disconnectNote': 'Odłączenie usuwa token z tego urządzenia. Dane w repozytorium i tutaj zostają.',
    'sync.homeError': 'Synchronizacja z GitHubem nie działa. Szczegóły w ustawieniach.',
    'sync.err.auth': 'Token jest nieprawidłowy albo wygasł. Utwórz nowy, odłącz i połącz ponownie.',
    'sync.err.forbidden': 'Token nie pozwala zapisywać w tym repozytorium. Sprawdź uprawnienie Contents: Read and write.',
    'sync.err.notFound': 'Nie znaleziono repozytorium. Sprawdź nazwę i czy token ma do niego dostęp.',
    'sync.err.public': 'To repozytorium jest publiczne. Użyj prywatnego, bo dane (np. waga) byłyby widoczne dla wszystkich.',
    'sync.err.network': 'Brak połączenia z GitHubem. Spróbuj ponownie.',
    'sync.err.conflict': 'Plik w repozytorium zmieniał się w tym samym czasie. Spróbuj ponownie.',
    'sync.err.bad': 'Synchronizacja się nie udała. Spróbuj ponownie później.',
    'sync.err.repoFormat': 'Wpisz repozytorium jako właściciel/nazwa, np. gchrupala/myo-data.',
    'sync.err.token': 'Wpisz token.',
  },

  en: {
    'tab.machines': 'Machines',
    'tab.history': 'History',
    'nav.view': 'View',
    'nav.back': 'Back',
    'nav.settings': 'Settings',
    'storage.notice': 'This browser does not save data (for example in private mode). Your sets will be lost when the page is closed.',

    'day.today': 'Today',
    'day.yesterday': 'Yesterday',
    'day.todayMid': 'today',
    'day.yesterdayMid': 'yesterday',

    'banner.active': 'In progress',
    'banner.paused': 'paused',
    'banner.rest': 'rest',
    'banner.waiting': 'waiting for a set',

    'aria.less': '{label}: less',
    'aria.more': '{label}: more',

    'bw.label': 'Your weight',
    'bw.aria': 'Weight',
    'bw.savedDiff': 'Saved for today. Since {since}: {diff} kg.',
    'bw.saved': 'Saved for today.',
    'bw.last': 'Last {kg} kg ({day}). Enter today’s, or use − and +.',
    'bw.empty': 'Enter it and it is saved with today’s date.',

    'home.last': 'Last {day} · {summary}',
    'home.never': 'No sets saved yet',
    'home.add': 'Add machine',

    'ex.edit': 'Edit',
    'ex.noSettings': 'This machine has no settings. Add them under Edit.',
    'ex.settingsAria': 'Machine settings',
    'ex.restTarget': 'Rest target',
    'ex.sound': 'Sound when the target is reached',
    'ex.end': 'Finish exercise',
    'ex.previous': 'Previous · {day}',

    'stack.hint': 'Tap the plate you put the pin in.',
    'dial.name': 'Dial',
    'dial.less': 'Dial: less',
    'dial.more': 'Dial: more',
    'dial.caption': 'dial, {unit}',

    'plate.rest': 'rest',
    'hint.restDone': 'Target {target} reached. Time for set {n}.',
    'hint.rest': 'Rest target: {target}.',
    'hint.ready': 'Do the set, set the reps and save it.',
    'plate.set': 'set',
    'ex.reps': 'Reps',
    'ex.saveSet': 'Save set {n}',
    'ex.timerAria': 'Rest timer',

    'cardio.aria': 'Stopwatch',
    'cardio.running': 'running',
    'cardio.paused': 'paused',
    'cardio.stopwatch': 'stopwatch',
    'cardio.hintRunning': 'Tap to stop.',
    'cardio.hintPaused': 'Tap to resume.',
    'cardio.hintReady': 'Tap to start the stopwatch.',
    'cardio.stop': 'Stop the stopwatch',
    'cardio.start': 'Start the stopwatch',
    'cardio.finish': 'Save and finish',

    'set.reps': ({ n }) => `${n} ${en(n, 'rep', 'reps')}`,
    'set.rest': 'rest {time}',
    'set.delete': 'Delete',
    'set.confirm': 'Delete?',
    'sum.sets': ({ n, reps }) => `${n} ${en(n, 'set', 'sets')}: ${reps} reps`,

    'hist.weight': 'weight {kg} kg',
    'hist.sets': ({ n, reps }) => `${n} ${en(n, 'set', 'sets')}, ${reps} ${en(reps, 'rep', 'reps')}`,
    'hist.emptyTitle': 'No history yet',
    'hist.emptyText': 'Pick a machine on the Machines tab, do a set, set the number of reps and press “Save set”. The set appears here with the date and settings.',

    'data.title': 'Data backup',
    'data.note': 'Your data is stored only in this browser, on this phone. Download a backup before you change phones or clear the browser data.',
    'data.export': 'Download backup',
    'data.import': 'Load backup',
    'data.confirm': ({ machines, sets }) =>
      `The file has ${machines} ${en(machines, 'machine', 'machines')} and ${sets} ${en(sets, 'set', 'sets')}. Your current data will be replaced.`,
    'data.replace': 'Replace data',
    'data.cancel': 'Cancel',
    'data.errorParse': 'Could not load the file. It is not a Myo backup.',
    'data.errorRead': 'Could not read the file.',

    'edit.titleEdit': 'Edit machine',
    'edit.titleNew': 'New machine',
    'edit.name': 'Name',
    'edit.namePlaceholder': 'e.g. Leg press',
    'edit.type': 'Type',
    'edit.typeStrength': 'Strength: sets and reps',
    'edit.typeCardio': 'Cardio: stopwatch',
    'edit.settings': 'Settings',
    'edit.settingsNote': 'For example weight, seat height, back pad position. A “weight stack” is the plates with a pin and a dial for small additions, labelled as on the machine.',
    'edit.fieldName': 'Setting name',
    'edit.fieldPlaceholder': 'e.g. Back pad',
    'edit.kind': 'Setting type',
    'edit.kindNumber': 'Number',
    'edit.kindStack': 'Weight stack',
    'edit.removeField': 'Remove setting {label}',
    'edit.plates': 'Plates',
    'edit.firstPlate': 'First plate',
    'edit.firstKg': 'First plate in kg',
    'edit.firstLb': 'First plate in lb',
    'edit.nextPlate': 'Each next one',
    'edit.nextKg': 'Each next plate in kg',
    'edit.nextLb': 'Each next plate in lb',
    'edit.dialCount': 'Dial: positions',
    'edit.noDial': '0 = no dial',
    'edit.dialStep': 'Dial: step',
    'edit.dialUnit': 'Dial unit',
    'edit.zero': 'A 0 kg position above the plates (e.g. assisted machine: no assistance)',
    'edit.unit': 'Unit',
    'edit.step': 'Step for − and +',
    'edit.addField': 'Add setting',
    'edit.save': 'Save',
    'edit.delete': 'Delete machine',
    'edit.deleteConfirm': 'Really delete?',
    'edit.deleteNote': 'Saved sets stay in the history.',
    'edit.nameError': 'Enter a name for the machine.',

    'settings.title': 'Settings',
    'settings.language': 'Language',
    'settings.system': 'System ({name})',
    'settings.languageNote': 'Default machine and setting names change language too. Names you typed in stay as they are.',

    'sync.title': 'Sync with GitHub',
    'sync.intro': 'Your data goes to a myo.json file in your private repository and from there to your other devices. Every change is a commit, so the history is kept.',
    'sync.step1': 'Create a private repository on GitHub (with a README file), e.g. myo-data:',
    'sync.step2': 'Create a token: the link fills in the Contents: Read and write permission and a one-year expiry; under “Repository access” select only that repository:',
    'sync.step3': 'Enter the repository name and the token below.',
    'sync.repo': 'Repository',
    'sync.repoPlaceholder': 'owner/name',
    'sync.token': 'Token',
    'sync.connect': 'Connect',
    'sync.connecting': 'Connecting…',
    'sync.connected': 'Connected to {repo}.',
    'sync.last': 'Last sync: {when}.',
    'sync.never': 'Not synced yet.',
    'sync.busy': 'Syncing…',
    'sync.now': 'Sync now',
    'sync.disconnect': 'Disconnect',
    'sync.disconnectConfirm': 'Really disconnect?',
    'sync.disconnectNote': 'Disconnecting removes the token from this device. The data in the repository and here stays.',
    'sync.homeError': 'Sync with GitHub is not working. See Settings for details.',
    'sync.err.auth': 'The token is invalid or has expired. Create a new one, disconnect and connect again.',
    'sync.err.forbidden': 'The token cannot write to this repository. Check the Contents: Read and write permission.',
    'sync.err.notFound': 'Repository not found. Check the name and that the token has access to it.',
    'sync.err.public': 'This repository is public. Use a private one: your data (e.g. weight) would be visible to everyone.',
    'sync.err.network': 'Could not reach GitHub. Try again.',
    'sync.err.conflict': 'The file in the repository was changing at the same time. Try again.',
    'sync.err.bad': 'Sync failed. Try again later.',
    'sync.err.repoFormat': 'Enter the repository as owner/name, e.g. gchrupala/myo-data.',
    'sync.err.token': 'Enter the token.',
  },

  es: {
    'tab.machines': 'Máquinas',
    'tab.history': 'Historial',
    'nav.view': 'Vista',
    'nav.back': 'Volver',
    'nav.settings': 'Ajustes',
    'storage.notice': 'Este navegador no guarda datos (por ejemplo, en modo privado). Las series se perderán al cerrar la página.',

    'day.today': 'Hoy',
    'day.yesterday': 'Ayer',
    'day.todayMid': 'hoy',
    'day.yesterdayMid': 'ayer',

    'banner.active': 'En curso',
    'banner.paused': 'en pausa',
    'banner.rest': 'descanso',
    'banner.waiting': 'esperando una serie',

    'aria.less': '{label}: menos',
    'aria.more': '{label}: más',

    'bw.label': 'Tu peso',
    'bw.aria': 'Peso',
    'bw.savedDiff': 'Guardado para hoy. Desde {since}: {diff} kg.',
    'bw.saved': 'Guardado para hoy.',
    'bw.last': 'Último: {kg} kg ({day}). Escribe el de hoy o usa − y +.',
    'bw.empty': 'Escríbelo y se guardará con la fecha de hoy.',

    'home.last': 'Última vez {day} · {summary}',
    'home.never': 'Aún sin series guardadas',
    'home.add': 'Añadir máquina',

    'ex.edit': 'Editar',
    'ex.noSettings': 'Esta máquina no tiene ajustes. Añádelos en Editar.',
    'ex.settingsAria': 'Ajustes de la máquina',
    'ex.restTarget': 'Objetivo de descanso',
    'ex.sound': 'Sonido al cumplir el objetivo',
    'ex.end': 'Terminar ejercicio',
    'ex.previous': 'Anterior · {day}',

    'stack.hint': 'Toca la placa donde pones el pasador.',
    'dial.name': 'Selector',
    'dial.less': 'Selector: menos',
    'dial.more': 'Selector: más',
    'dial.caption': 'selector, {unit}',

    'plate.rest': 'descanso',
    'hint.restDone': 'Objetivo de {target} cumplido. Hora de la serie {n}.',
    'hint.rest': 'Objetivo de descanso: {target}.',
    'hint.ready': 'Haz la serie, ajusta las repeticiones y guárdala.',
    'plate.set': 'serie',
    'ex.reps': 'Repeticiones',
    'ex.saveSet': 'Guardar serie {n}',
    'ex.timerAria': 'Temporizador de descanso',

    'cardio.aria': 'Cronómetro',
    'cardio.running': 'en marcha',
    'cardio.paused': 'en pausa',
    'cardio.stopwatch': 'cronómetro',
    'cardio.hintRunning': 'Toca para parar.',
    'cardio.hintPaused': 'Toca para reanudar.',
    'cardio.hintReady': 'Toca para iniciar el cronómetro.',
    'cardio.stop': 'Parar el cronómetro',
    'cardio.start': 'Iniciar el cronómetro',
    'cardio.finish': 'Guardar y terminar',

    'set.reps': ({ n }) => `${n} rep.`,
    'set.rest': 'descanso {time}',
    'set.delete': 'Borrar',
    'set.confirm': '¿Borrar?',
    'sum.sets': ({ n, reps }) => `${n} ${es(n, 'serie', 'series')}: ${reps} rep.`,

    'hist.weight': 'peso {kg} kg',
    'hist.sets': ({ n, reps }) => `${n} ${es(n, 'serie', 'series')}, ${reps} rep.`,
    'hist.emptyTitle': 'Aún no hay historial',
    'hist.emptyText': 'Elige una máquina en la pestaña Máquinas, haz una serie, ajusta las repeticiones y pulsa «Guardar serie». La serie aparecerá aquí con la fecha y los ajustes.',

    'data.title': 'Copia de seguridad',
    'data.note': 'Los datos se guardan solo en este navegador, en este teléfono. Descarga una copia antes de cambiar de teléfono o de borrar los datos del navegador.',
    'data.export': 'Descargar copia',
    'data.import': 'Cargar copia',
    'data.confirm': ({ machines, sets }) =>
      `El archivo contiene ${machines} ${es(machines, 'máquina', 'máquinas')} y ${sets} ${es(sets, 'serie', 'series')}. Se reemplazarán los datos actuales.`,
    'data.replace': 'Reemplazar datos',
    'data.cancel': 'Cancelar',
    'data.errorParse': 'No se pudo cargar el archivo. No es una copia de Myo.',
    'data.errorRead': 'No se pudo leer el archivo.',

    'edit.titleEdit': 'Editar máquina',
    'edit.titleNew': 'Nueva máquina',
    'edit.name': 'Nombre',
    'edit.namePlaceholder': 'p. ej. Prensa de piernas',
    'edit.type': 'Tipo',
    'edit.typeStrength': 'Fuerza: series y repeticiones',
    'edit.typeCardio': 'Cardio: cronómetro',
    'edit.settings': 'Ajustes',
    'edit.settingsNote': 'Por ejemplo peso, altura del asiento, posición del respaldo. Una «pila de placas» son las placas con pasador y un selector para pequeños incrementos, rotuladas como en la máquina.',
    'edit.fieldName': 'Nombre del ajuste',
    'edit.fieldPlaceholder': 'p. ej. Respaldo',
    'edit.kind': 'Tipo de ajuste',
    'edit.kindNumber': 'Número',
    'edit.kindStack': 'Pila de placas',
    'edit.removeField': 'Quitar el ajuste {label}',
    'edit.plates': 'Placas',
    'edit.firstPlate': 'Primera placa',
    'edit.firstKg': 'Primera placa en kg',
    'edit.firstLb': 'Primera placa en libras',
    'edit.nextPlate': 'Cada siguiente',
    'edit.nextKg': 'Cada placa siguiente en kg',
    'edit.nextLb': 'Cada placa siguiente en libras',
    'edit.dialCount': 'Selector: posiciones',
    'edit.noDial': '0 = sin selector',
    'edit.dialStep': 'Selector: paso',
    'edit.dialUnit': 'Unidad del selector',
    'edit.zero': 'Posición de 0 kg sobre las placas (p. ej. máquina asistida: sin asistencia)',
    'edit.unit': 'Unidad',
    'edit.step': 'Paso de − y +',
    'edit.addField': 'Añadir ajuste',
    'edit.save': 'Guardar',
    'edit.delete': 'Borrar máquina',
    'edit.deleteConfirm': '¿Seguro que quieres borrarla?',
    'edit.deleteNote': 'Las series guardadas se quedan en el historial.',
    'edit.nameError': 'Escribe el nombre de la máquina.',

    'settings.title': 'Ajustes',
    'settings.language': 'Idioma',
    'settings.system': 'Sistema ({name})',
    'settings.languageNote': 'Los nombres predeterminados de máquinas y ajustes también cambian de idioma. Los nombres que escribiste se quedan igual.',

    'sync.title': 'Sincronización con GitHub',
    'sync.intro': 'Los datos se guardan en un archivo myo.json de tu repositorio privado y de ahí pasan a tus otros dispositivos. Cada cambio es un commit, así que queda el historial.',
    'sync.step1': 'Crea un repositorio privado en GitHub (con un archivo README), p. ej. myo-data:',
    'sync.step2': 'Crea un token: el enlace rellena el permiso Contents: Read and write y una caducidad de un año; en «Repository access» elige solo ese repositorio:',
    'sync.step3': 'Escribe abajo el nombre del repositorio y el token.',
    'sync.repo': 'Repositorio',
    'sync.repoPlaceholder': 'propietario/nombre',
    'sync.token': 'Token',
    'sync.connect': 'Conectar',
    'sync.connecting': 'Conectando…',
    'sync.connected': 'Conectado a {repo}.',
    'sync.last': 'Última sincronización: {when}.',
    'sync.never': 'Aún sin sincronizar.',
    'sync.busy': 'Sincronizando…',
    'sync.now': 'Sincronizar ahora',
    'sync.disconnect': 'Desconectar',
    'sync.disconnectConfirm': '¿Seguro que quieres desconectar?',
    'sync.disconnectNote': 'Al desconectar se borra el token de este dispositivo. Los datos del repositorio y de aquí se quedan.',
    'sync.homeError': 'La sincronización con GitHub no funciona. Detalles en Ajustes.',
    'sync.err.auth': 'El token no es válido o ha caducado. Crea uno nuevo, desconecta y vuelve a conectar.',
    'sync.err.forbidden': 'El token no puede escribir en este repositorio. Revisa el permiso Contents: Read and write.',
    'sync.err.notFound': 'No se encontró el repositorio. Revisa el nombre y que el token tenga acceso.',
    'sync.err.public': 'Este repositorio es público. Usa uno privado: tus datos (p. ej. el peso) serían visibles para todos.',
    'sync.err.network': 'No se pudo conectar con GitHub. Inténtalo de nuevo.',
    'sync.err.conflict': 'El archivo del repositorio cambiaba al mismo tiempo. Inténtalo de nuevo.',
    'sync.err.bad': 'La sincronización falló. Inténtalo más tarde.',
    'sync.err.repoFormat': 'Escribe el repositorio como propietario/nombre, p. ej. gchrupala/myo-data.',
    'sync.err.token': 'Escribe el token.',
  },
};

// The app stores the names of its default machines and settings in Polish.
// They are shown in the current language; names the user typed are shown as
// typed.
const DEFAULT_NAMES = {
  en: {
    'Podciąganie': 'Chin-up',
    'Pompki na poręczach': 'Dips',
    'Brzuch': 'Abdominal',
    'Wyciskanie nad głowę': 'Overhead press',
    'Wiosłowanie': 'Row',
    'Wyciskanie na klatkę': 'Chest press',
    'Pośladki': 'Glutes',
    'Taśma': 'Treadmill',
    'Ciężar': 'Weight',
    'Siedzisko': 'Seat',
    'Energia': 'Energy',
    'Prędkość': 'Speed',
    'Nachylenie': 'Incline',
  },
  es: {
    'Podciąganie': 'Dominadas',
    'Pompki na poręczach': 'Fondos',
    'Brzuch': 'Abdominales',
    'Wyciskanie nad głowę': 'Press de hombros',
    'Wiosłowanie': 'Remo',
    'Wyciskanie na klatkę': 'Press de pecho',
    'Pośladki': 'Glúteos',
    'Taśma': 'Cinta',
    'Ciężar': 'Peso',
    'Siedzisko': 'Asiento',
    'Energia': 'Energía',
    'Prędkość': 'Velocidad',
    'Nachylenie': 'Inclinación',
  },
};

export function t(key, vars = {}) {
  const s = STRINGS[current][key] ?? STRINGS.pl[key];
  if (s === undefined) return key;
  if (typeof s === 'function') return s(vars);
  return s.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}

export function nameFor(stored) {
  return DEFAULT_NAMES[current]?.[stored] ?? stored;
}

export function setLanguage(code) {
  current = code in LANGUAGES ? code : 'pl';
}

export function language() {
  return current;
}

export function locale() {
  return LOCALES[current];
}

export function decimalSeparator() {
  return current === 'en' ? '.' : ',';
}

// The language to use for a preference ('system' or a code) and the
// browser's preferred languages. Unsupported system languages get English.
export function resolveLanguage(preference, preferred = []) {
  if (preference in LANGUAGES) return preference;
  for (const tag of preferred) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (base in LANGUAGES) return base;
  }
  return 'en';
}

// For tests: every key of every language.
export function keysOf(code) {
  return Object.keys(STRINGS[code]);
}
