export type Lang = "uk" | "pl" | "en";
export const LANGS: { id: Lang; label: string }[] = [
  { id: "uk", label: "Українська" },
  { id: "pl", label: "Polski" },
  { id: "en", label: "English" },
];

export type HelpAction = "floor" | "editor" | "openFile";

export interface HelpSection {
  id: string;
  title: Record<Lang, string>;
  body: Record<Lang, string[]>;
  /** Кнопка «Показати»: переходить до потрібного місця програми. */
  action?: { run: HelpAction; label: Record<Lang, string> };
}

export const HELP_UI: Record<Lang, { title: string; search: string; close: string; empty: string; steps: string; stepsList: string[] }> = {
  uk: {
    title: "Довідка",
    search: "Пошук у довідці…",
    close: "Закрити",
    empty: "Нічого не знайдено. Спробуйте інше слово.",
    steps: "Швидкий старт",
    stepsList: [
      "Відкрийте план поверху: DWG (точніше) або векторний PDF.",
      "Для PDF вкажіть масштаб (наприклад 100 для М 1:100).",
      "Дочекайтеся таблиці: одна квартира — один рядок.",
      "Перевірте жовті рядки — програма сумнівається в них.",
      "Натисніть «Експорт у Excel».",
    ],
  },
  pl: {
    title: "Pomoc",
    search: "Szukaj w pomocy…",
    close: "Zamknij",
    empty: "Nic nie znaleziono. Spróbuj innego słowa.",
    steps: "Szybki start",
    stepsList: [
      "Otwórz rzut piętra: DWG (dokładniej) lub wektorowy PDF.",
      "Dla PDF podaj skalę (np. 100 dla 1:100).",
      "Poczekaj na tabelę: jedno mieszkanie to jeden wiersz.",
      "Sprawdź żółte wiersze — program ma w nich wątpliwości.",
      "Kliknij „Eksport do Excela”.",
    ],
  },
  en: {
    title: "Help",
    search: "Search help…",
    close: "Close",
    empty: "Nothing found. Try another word.",
    steps: "Quick start",
    stepsList: [
      "Open the floor plan: DWG (more accurate) or a vector PDF.",
      "For PDF enter the drawing scale (e.g. 100 for 1:100).",
      "Wait for the table: one apartment is one row.",
      "Check the yellow rows — the program is unsure about them.",
      "Click “Export to Excel”.",
    ],
  },
};

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "what",
    title: { uk: "Що робить програма", pl: "Co robi program", en: "What the program does" },
    body: {
      uk: [
        "VoltGrid читає готовий електричний план поверху, сама знаходить квартири, рахує в кожній компоненти (розетки, виводи освітлення, вимикачі, TM, TSM, IT, RTV…) і віддає результат у таблиці Excel.",
        "Малювати нічого не потрібно: розпізнавання йде з підписів і ліній самого креслення. Ручний «Редактор» лишається як запасний режим для плану, який програма не змогла розібрати.",
      ],
      pl: [
        "VoltGrid czyta gotowy rzut instalacji elektrycznej piętra, sam znajduje mieszkania, liczy w każdym elementy (gniazda, wypusty oświetleniowe, łączniki, TM, TSM, IT, RTV…) i oddaje wynik w tabeli Excel.",
        "Nie trzeba niczego rysować: rozpoznawanie opiera się na opisach i liniach samego rysunku. Ręczny „Edytor” zostaje jako tryb awaryjny dla planu, którego program nie potrafił rozpoznać.",
      ],
      en: [
        "VoltGrid reads a ready electrical floor plan, finds the apartments by itself, counts the components in each one (sockets, lighting outlets, switches, TM, TSM, IT, RTV…) and gives the result as an Excel table.",
        "Nothing has to be drawn: recognition uses the labels and lines of the drawing itself. The manual “Editor” stays as a fallback for a plan the program could not read.",
      ],
    },
  },
  {
    id: "start",
    title: { uk: "Як почати: DWG або PDF", pl: "Jak zacząć: DWG lub PDF", en: "Getting started: DWG or PDF" },
    body: {
      uk: [
        "На вкладці «Поверх з DWG» натисніть «Відкрити план поверху» й оберіть файл .dwg або .pdf. Розбір поверху на 50 квартир займає 10–20 секунд.",
        "DWG точніший, бо в ньому є назви блоків і шари. PDF працює, якщо він векторний (збережений із CAD, текст виділяється мишею). Скани й фото PDF не підходять.",
        "Для PDF обов'язково вкажіть масштаб креслення: 100 означає М 1:100. Від нього залежать площі та відстані.",
      ],
      pl: [
        "Na karcie „Poziom z DWG” kliknij „Otwórz rzut piętra” i wybierz plik .dwg lub .pdf. Analiza piętra z 50 mieszkaniami trwa 10–20 sekund.",
        "DWG jest dokładniejszy, bo zawiera nazwy bloków i warstwy. PDF działa, jeśli jest wektorowy (zapisany z CAD, tekst da się zaznaczyć myszą). Skany i zdjęcia nie nadają się.",
        "Dla PDF koniecznie podaj skalę rysunku: 100 oznacza 1:100. Od niej zależą powierzchnie i odległości.",
      ],
      en: [
        "On the “Floor from DWG” tab click “Open floor plan” and choose a .dwg or .pdf file. Analysing a floor with 50 apartments takes 10–20 seconds.",
        "DWG is more accurate because it keeps block names and layers. PDF works when it is vector (saved from CAD, text can be selected with the mouse). Scans and photos do not work.",
        "For PDF always enter the drawing scale: 100 means 1:100. Areas and distances depend on it.",
      ],
    },
    action: { run: "floor", label: { uk: "Показати екран поверху", pl: "Pokaż ekran piętra", en: "Show the floor screen" } },
  },
  {
    id: "how",
    title: { uk: "Як програма розпізнає квартири", pl: "Jak program rozpoznaje mieszkania", en: "How apartments are recognised" },
    body: {
      uk: [
        "1) Стіни, вікна й рамки дверей стають перешкодами на сітці 5 см. 2) Біля кожного щита TM програма шукає проріз вхідних дверей, закриває його й заливає простір усередині — це контур квартири. 3) Обирається варіант, де всередині є розетки, а TM і TSM лежать біля межі.",
        "Компоненти рахуються за підписами: «N/TM» — номер кола (1 освітлення, 2 холодильник, 3 посудомийка, 4 пральня, 5 плита 3f, 6 ванна, 7 кухня, 8 салон, 9 спальні), «x2» — подвійна розетка, літери a, b, g,h — вимикачі й виводи світла.",
      ],
      pl: [
        "1) Ściany, okna i ościeżnice drzwi stają się przeszkodami na siatce 5 cm. 2) Przy każdej tablicy TM program szuka otworu drzwi wejściowych, zamyka go i wypełnia przestrzeń w środku — to obrys mieszkania. 3) Wybierany jest wariant, w którym w środku są gniazda, a TM i TSM leżą przy granicy.",
        "Elementy liczone są po opisach: „N/TM” to numer obwodu (1 oświetlenie, 2 lodówka, 3 zmywarka, 4 pralka, 5 płyta 3f, 6 łazienka, 7 kuchnia, 8 salon, 9 pokoje), „x2” to gniazdo podwójne, litery a, b, g,h to łączniki i wypusty światła.",
      ],
      en: [
        "1) Walls, windows and door frames become obstacles on a 5 cm grid. 2) Next to each TM board the program looks for the entrance-door opening, closes it and fills the space inside — that is the apartment outline. 3) The variant is chosen where sockets are inside and TM and TSM lie near the boundary.",
        "Components are counted from labels: “N/TM” is the circuit number (1 lighting, 2 fridge, 3 dishwasher, 4 washer, 5 cooker 3-phase, 6 bathroom, 7 kitchen, 8 living room, 9 bedrooms), “x2” is a double socket, letters a, b, g,h are switches and light outlets.",
      ],
    },
  },
  {
    id: "table",
    title: { uk: "Таблиця й жовті рядки", pl: "Tabela i żółte wiersze", en: "The table and yellow rows" },
    body: {
      uk: [
        "Один тип компонента — один стовпець. Наведіть курсор на заголовок, щоб побачити польську назву з легенди проєкту. Внизу рядок «Разом» по всьому поверху.",
        "Жовтий рядок означає сумнів: у контурі два TM (об'єднано дві квартири, бо в кресленні немає розділової стіни), надто велика або мала площа, не знайдено розеток. Перевірте такий рядок за кресленням.",
        "Номер квартири поки що порядковий (за розташуванням у файлі), правило «від ліфта за годинниковою» ще не реалізоване.",
      ],
      pl: [
        "Jeden typ elementu to jedna kolumna. Najedź na nagłówek, aby zobaczyć polską nazwę z legendy projektu. Na dole wiersz „Razem” dla całego piętra.",
        "Żółty wiersz oznacza wątpliwość: w obrysie są dwa TM (połączono dwa mieszkania, bo w rysunku brak ściany działowej), zbyt duża lub mała powierzchnia, brak gniazd. Sprawdź taki wiersz z rysunkiem.",
        "Numer mieszkania jest na razie kolejny (wg położenia w pliku); zasada „od windy zgodnie z ruchem wskazówek zegara” nie jest jeszcze zaimplementowana.",
      ],
      en: [
        "One component type is one column. Hover a header to see the Polish name from the project legend. The bottom row “Total” covers the whole floor.",
        "A yellow row means doubt: two TM boards in one outline (two apartments merged because the drawing has no dividing wall), unusually large or small area, no sockets found. Check such a row against the drawing.",
        "The apartment number is currently sequential (by position in the file); the “from the lift, clockwise” rule is not implemented yet.",
      ],
    },
  },
  {
    id: "limits",
    title: { uk: "Що програма ще не вміє", pl: "Czego program jeszcze nie umie", en: "What the program cannot do yet" },
    body: {
      uk: [
        "З PDF не розпізнаються символи без підпису: домофонна трубка, датчик диму, настінні виводи світла — ці стовпці можуть бути нулями. У DWG вони розпізнаються за назвою блока.",
        "Поки немає: трасування кабель-каналів fi20/25/32 і їхніх довжин, спільних зон, блискавкозахисту, заземлення, автоматичного іменування квартир.",
        "Стилі ліній стін для PDF підібрано під цей проєкт. Для іншого проєкту, можливо, знадобиться налаштування.",
      ],
      pl: [
        "Z PDF nie są rozpoznawane symbole bez opisu: unifon, czujka dymu, wypusty ścienne — te kolumny mogą mieć zera. W DWG są rozpoznawane po nazwie bloku.",
        "Jeszcze nie ma: trasowania peszli fi20/25/32 i ich długości, części wspólnych, ochrony odgromowej, uziemienia, automatycznego nazywania mieszkań.",
        "Style linii ścian dla PDF dobrano pod ten projekt. Dla innego projektu może być potrzebne dostrojenie.",
      ],
      en: [
        "From PDF, symbols without a label are not recognised: intercom handset, smoke detector, wall light outlets — those columns may show zeros. In DWG they are recognised by block name.",
        "Not yet available: routing of fi20/25/32 conduits and their lengths, common areas, lightning protection, earthing, automatic apartment naming.",
        "Wall line styles for PDF were tuned for this project. Another project may need adjustment.",
      ],
    },
  },
  {
    id: "excel",
    title: { uk: "Експорт у Excel", pl: "Eksport do Excela", en: "Excel export" },
    body: {
      uk: [
        "«Експорт у Excel» створює файл із аркушем «Mieszkania» (рядок на квартиру, стовпець на тип компонента, рядок «Razem» із формулами) та аркушем «Informacje» (джерело й попередження).",
      ],
      pl: [
        "„Eksport do Excela” tworzy plik z arkuszem „Mieszkania” (wiersz na mieszkanie, kolumna na typ elementu, wiersz „Razem” z formułami) i arkuszem „Informacje” (źródło i ostrzeżenia).",
      ],
      en: [
        "“Export to Excel” creates a file with a “Mieszkania” sheet (a row per apartment, a column per component type, a “Razem” row with formulas) and an “Informacje” sheet (source and warnings).",
      ],
    },
  },
  {
    id: "editor",
    title: { uk: "Ручний редактор", pl: "Edytor ręczny", en: "Manual editor" },
    body: {
      uk: [
        "Вкладка «Редактор» — запасний режим: можна накреслити стіни, двері, розетки, кола й кабельні траси вручну, розрахувати довжини та зберегти проєкт у файл. Потрібна, лише якщо автоматичний розбір плану не спрацював.",
        "Гарячі клавіші: Ctrl+Z — назад, Ctrl+Y — вперед, Delete — видалити виділене, F1 — ця довідка.",
      ],
      pl: [
        "Karta „Edytor” to tryb awaryjny: można ręcznie narysować ściany, drzwi, gniazda, obwody i trasy kabli, policzyć długości i zapisać projekt do pliku. Potrzebna tylko wtedy, gdy automatyczna analiza planu zawiodła.",
        "Skróty: Ctrl+Z — cofnij, Ctrl+Y — ponów, Delete — usuń zaznaczone, F1 — ta pomoc.",
      ],
      en: [
        "The “Editor” tab is a fallback: you can draw walls, doors, sockets, circuits and cable routes by hand, calculate lengths and save the project to a file. Needed only when automatic analysis fails.",
        "Hotkeys: Ctrl+Z undo, Ctrl+Y redo, Delete removes the selection, F1 opens this help.",
      ],
    },
    action: { run: "editor", label: { uk: "Відкрити редактор", pl: "Otwórz edytor", en: "Open the editor" } },
  },
  {
    id: "license",
    title: { uk: "Ліцензії й конфіденційність", pl: "Licencje i prywatność", en: "Licences and privacy" },
    body: {
      uk: [
        "Файли обробляються локально у вашому комп'ютері й нікуди не надсилаються. Для читання DWG використовується LibreDWG (GPL-3.0): якщо програма не поширюється, а продається лише результат розрахунку, обмежень GPL це не зачіпає.",
      ],
      pl: [
        "Pliki są przetwarzane lokalnie na Twoim komputerze i nigdzie nie są wysyłane. Do odczytu DWG służy LibreDWG (GPL-3.0): jeśli program nie jest rozpowszechniany, a sprzedawany jest tylko wynik obliczeń, ograniczenia GPL tego nie dotyczą.",
      ],
      en: [
        "Files are processed locally on your computer and are not uploaded anywhere. DWG is read with LibreDWG (GPL-3.0): if the program is not distributed and only the calculation result is sold, the GPL restrictions do not apply.",
      ],
    },
  },
];
