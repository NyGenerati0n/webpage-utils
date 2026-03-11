# SSAutocomplete

**SSAutocomplete** är ett kraftfullt och lättviktigt JavaScript-bibliotek skapat specifikt för att lägga till sök- och autofyll-funktionalitet (autocomplete) till vanliga Squarespace-formulär.

Eftersom Squarespace har en specifik och ibland oförutsägbar DOM-struktur för formulär, använder det här biblioteket en "carrier"-metod. Det innebär att det letar upp det befintliga textfältet baserat på dess etikett (label), döljer det och injicerar ett nytt, snyggt sökgränssnitt ovanpå. När användaren gör ett val fylls originalfältet i "under huven", vilket gör att Squarespaces inbyggda validering och inskickning (submit) fungerar precis som vanligt.

Biblioteket har fullt stöd för asynkron data (via Fetch), komplex villkorlig logik (conditions) och integrerar sömlöst med [Fuse.js](https://fusejs.io/) för "fuzzy search".

## 📦 Installation

1. Gå till **Settings > Advanced > Code Injection > Footer** och lägg till följande:

```html
<script src="https://cdn.jsdelivr.net/npm/fuse.js@6.6.2"></script>

<link rel="stylesheet" href="<path to folder>/ss-autocomplete.css">
<script src="<path to folder>/ss-autocomplete.js"></script>

<script>
  document.addEventListener("DOMContentLoaded", function() {
    SSAutocomplete.init({
      // Din konfiguration placeras här
    });
  });
</script>
```

### Installation via Code Block (om Footer Injection saknas)
Om du inte har tillgång till global *Code Injection* (t.ex. på Squarespace Personal-planen), kan du istället använda ett **Code Block** direkt på sidan där formuläret finns.

1. Lägg till ett **Code Block** längst ner på sidan.
2. Klistra in följande kod (se till att "HTML" är valt och "Display Source" är avstängt):

```html
<link rel="stylesheet" href="<path to folder>/ss-autocomplete.css">
<script src="https://cdn.jsdelivr.net/npm/fuse.js@6.6.2"></script>

<script src="<path to folder>/ss-autocomplete.js"></script>

<script>
  (function() {
    var initSSAC = function() {
      if (window.SSAutocomplete) {
        window.SSAutocomplete.init({
          fields: [
            {
              targetLabel: "Din Etikett",
              data: [ /* Din data */ ]
            }
          ]
        });
      } else {
        // Försök igen om skriptet inte laddat än
        setTimeout(initSSAC, 100);
      }
    };
    
    // Kör när DOM är redo
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSSAC);
    } else {
      initSSAC();
    }
  })();
</script>
```

### Länkar

För att hitta länken som du skriver in i stället för `<path to folder>` och i konfigens `dataUrl` kan du använda instruktionerna som finns i filen README.md i projektets root-mapp (huvudmappen) om att [Länka kod](../../README.md#att-länka-till-kodbibliotek) och att [Länka data](../../README.md#att-länka-till-data). 

---

## 🚀 Grundläggande användning

För att göra ett fält sökbart anger du vilken etikett (`targetLabel`) skriptet ska leta efter och skickar med den data som ska sökas igenom.

```js
SSAutocomplete.init({
  fields: [
    {
      targetLabel: "Välj din skola", // Måste matcha etiketten i Squarespace
      placeholder: "Sök efter skola...",
      data: [
        { id: "1", label: "KTH Royal Institute of Technology" },
        { id: "2", label: "Chalmers tekniska högskola" },
        { id: "3", label: "Lunds universitet" }
      ]
    }
  ]
});
```

---

## ⚙️ Global Konfiguration

När du anropar `SSAutocomplete.init(config)` kan du skicka med globala inställningar.

| Egenskap | Typ | Standardvärde | Beskrivning |
| :--- | :--- | :--- | :--- |
| **`debug`** | `boolean` | `false` | Skriver ut varningar och status i konsolen. |
| **`observer`** | `object` | `{ subtree: true, childList: true }` | Inställningar för DOM-observer. Bra för formulär i popups. |
| **`fuseDefaults`** | `object` | `{ threshold: 0.35, ignoreLocation: true, minMatchCharLength: 1 }` | Standardinställningar för Fuse.js (om inläst). |
| **`fetch`** | `object` | `{ cache: "no-store" }` | Inställningar för fetch-anrop. |
| **`fields`** | `array` | `[]` | En lista med konfigurations-objekt för varje fält. |

---

## 📝 Fält-konfiguration (`fields`)

Varje objekt i `fields`-arrayen styr ett specifikt fält.

### 1. Identifiering & UI
| Egenskap | Typ | Beskrivning |
| :--- | :--- | :--- |
| **`targetLabel`** | `string` | **Krävs.** Etiketten på fältet i Squarespace som ska omvandlas. |
| **`placeholder`** | `string` | Platshållartext i sökfältet (Standard: `"Sök och välj…"`). |
| **`emptyText`** | `string` | Text när sökningen inte ger träffar (Standard: `"Inga träffar"`). |
| **`maxResults`** | `number` | Max antal resultat i listan (Standard: `8`). |

### 2. Datahantering
*Notera: Om både `data` och `dataUrl` anges för samma fält, **prioriteras alltid `data`** (den statiska arrayen) och `dataUrl` ignoreras.*

| Egenskap | Typ | Beskrivning |
| :--- | :--- | :--- |
| **`data`** | `array` | En statisk array med objekt som ska sökas igenom. *(Högst prioritet)* |
| **`dataUrl`** | `string` | En URL för att hämta JSON-data asynkront via `fetch`. |
| **`listPath`** | `string` | Om API-svaret är nästlat (t.ex. `"data.schools"`), anger du sökvägen till arrayen här. |
| **`mapItem`** | `function` | Formaterar inkommande data till `{ id, label }`. |
| **`filterItem`** | `function` | Filtrerar bort objekt från listan innan de görs sökbara. |

### 3. Inskickning (Submit)
| Egenskap | Typ | Beskrivning |
| :--- | :--- | :--- |
| **`isRequired`** | `boolean` | Tvingar användaren att göra ett giltigt val från listan. |
| **`removeRequiredSuffix`**| `boolean` | Rensar bort "(Krävs)" från etiketten om fältet är `isRequired: false` (Standard: `true`). |
| **`submitValue`** | `string` | Vad som skickas in: `"label"` eller `"id"` (Standard: `"label"`). |
| **`sentinelValue`** | `string` | Ett osynligt utfyllnadsvärde som används om fältet lämnas tomt (och inte är required) för att undvika valideringsfel i Squarespace (Standard: `"__SS_EMPTY__"`). |

---

## 🧠 Villkor & Logik (Conditions)

Biblioteket låter dig styra autocomplete-fältet dynamiskt baserat på vad användaren gör i *andra* fält i formuläret (t.ex. kryssrutor, radioknappar eller dropdowns).

### `conditionControls`
Detta objekt definierar vilka andra fält i formuläret som ska övervakas. Du kan hitta dem via CSS-selektorer eller deras synliga etikett (Label).

| Egenskap | Typ | Beskrivning |
| :--- | :--- | :--- |
| **`selectorMap`** | `object` | Nyckel-värde-par där nyckeln är ett valfritt namn och värdet är en CSS-selektor. T.ex. `{ region: 'select[name="region-select"]' }`. |
| **`byLabel`** | `object` | Nyckel-värde-par där nyckeln är ett valfritt namn och värdet är fältets etiketttext. T.ex. `{ missingSchool: 'Min skola finns inte med' }`. |
| **`events`** | `array` | Vilka händelser som ska trigga en uppdatering (Standard: `["change"]`). |

### `conditions`
En funktion som anropas varje gång något av fälten i `conditionControls` triggar ett event. Funktionen tar emot ett objekt med kontext och förväntas returnera ett objekt med state-uppdateringar.

**Argument till funktionen:**
``` js
conditions: ({ controls, form, wrapper, uiInput, carrier, state }) => { ... }
```

* `controls`: Ett objekt innehållande DOM-elementen du definierade i `conditionControls` (t.ex. `controls.missingSchool`).
* `state`: Fältets nuvarande interna state.
* `form`, `wrapper`, `uiInput`, `carrier`: Referenser till relevanta DOM-element.

**Return-värden för att styra fältet:**
Du returnerar ett objekt med en eller flera av följande egenskaper. Om du inte returnerar en egenskap, behålls dess nuvarande state.

| Retur-egenskap | Typ | Standard | Beskrivning |
| :--- | :--- | :--- | :--- |
| **`enabled`** | `boolean` | `true` | Om fältet ska vara aktiverat eller utgråat (disabled). |
| **`listEnabled`** | `boolean` | `true` | Om söklistan/dropdown-menyn ska gå att öppna överhuvudtaget. |
| **`freeTextMode`** | `boolean` | `false` | Om `true` stängs sökningen av och fältet fungerar som en vanlig text-input där användaren kan skriva vad som helst. |
| **`freeTextEmptyToSentinel`**| `boolean` | `false` | Om fältet är i `freeTextMode` och lämnas tomt: ska vi skicka `sentinelValue` (utfyllnad) för att tillåta submit? |
| **`clearSelection`** | `boolean` | `false` | Om `true` (eller truthy) rensas omedelbart användarens aktuella val och input-text. |

### Exempel på conditions: Fritt textval
Ett vanligt scenario: Om användaren kryssar i "Skolan finns inte i listan", förvandlas autocomplete-fältet till ett vanligt fritextfält.

``` js
{
  targetLabel: "Skola",
  dataUrl: "/schools.json",
  
  conditionControls: {
    byLabel: { 
      missingSchoolCheckbox: "Min skola finns inte med i listan" 
    }
  },
  
  conditions: ({ controls }) => {
    // Kontrollera om rutan är ikryssad
    const isChecked = controls.missingSchoolCheckbox && controls.missingSchoolCheckbox.checked;
    
    return {
      freeTextMode: isChecked,     // Aktivera fritext om ikryssad
      listEnabled: !isChecked,     // Stäng av dropdown om ikryssad
      clearSelection: isChecked    // Töm fältet när de kryssar i rutan
    };
  }
}
```

---

## 🎨 Styling

SSAutocomplete är byggt för att ärva så mycket som möjligt från ditt Squarespace-tema (font, padding, borders på input-fältet). För dropdown-menyn injiceras några enkla klasser som du fritt kan skriva över i **Design > Custom CSS**.

* `.ssac-panel`: Huvudbehållaren för sökresultaten (dropdown-menyn).
* `.ssac-item`: Varje enskilt resultat.
* `.ssac-item[aria-selected="true"]`: Resultatet som just nu är markerat.
* `.ssac-muted`: Tomt tillstånd (t.ex. texten "Inga träffar").