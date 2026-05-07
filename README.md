# Kodbibliotek nygeneration.se
Detta repo innehåller kod som används på våran hemsida nygeneration.se. 

## Filstruktur kodbibliotek
Alla kodfiler finns under mappen `docs/` under branchen `main` och följer följande struktur:

```text
docs/ (branch: main)
├── index.html
├── preview.html
└── <code-library-name>
        ├── dev/
        │   ├── test.html
        │   └── <library-files>
        ├── <library-files>
        └── README.md
```


### Filen `index.html`
---
Denna fil innehåller lite info om sidan och vart all kod finns.


### Filen `preview.html`
---
Denna fil innehåller en preview av varje egengjort element (som är fristående och inte kräver andra element från en Squarespace sida). I den här filen bör du länka till produktionskoden i biblioteken (inte koden i `dev/`). 


### Mappen `<code-library-name>/`
---
Innehåller alla filer för att implementera en specifik funktion på hemsidan och gärna en README.md fil som förklarar hur man använder koden. 

Mappen `dev/` används när man utvecklar/ändrar verktyget. Dessa filer kan man länka till i gömda/debug sidor på Squarespace för att testa koden utan att riskera att förstöra funktionen på sidor som redan använder en tidigare version av koden. Sidorna som användarna ser (dvs de som är i produktion) ska länka till koden utanför `dev/` det vill säga i mappen `<code-library-name>/`. I `dev/` kan man också testa lokalt med en test.html fil eller liknande när det är möjligt (rekommenderat). 


## Att länka till kodbibliotek
Alla filer i `docs/` mappen publiceras på en webserver med `github pages`. Du kommer åt filerna i den mappen med hjälp av länken nedan där du byter ut `<path to file>` mot filens sökväg. 

`https://nygenerati0n.github.io/webpage-utils/<path to file>`

### Exempel
---

Om du ska hämta filhttps://github.com/NyGenerati0n/webpage-dataen `script.js` i kodbiblioteket `exempel-projekt` för en sida i produktion (som användarna ser) så blir länken:

`https://nygenerati0n.github.io/webpage-utils/exempel-projekt/script.js`

Och om du ska hämta samma fil men för att testa den i en Squarespace-sida för debugging som inte syns för användarna blir länken istället:

`https://nygenerati0n.github.io/webpage-utils/exempel-projekt/dev/script.js`



## Data
Många av biblioteken använder extern data. Den datan sparas i ett separat repo ([webpage-data](https://github.com/NyGenerati0n/webpage-data)). Där finns det instruktioner för hur du länkar till datan på hemsidan. 

## Utveckling och `git`
För att ladda upp koden till github brukar man använda programmet `git`. Om du inte vet hur det fungerar rekomenderar jag dig att lära dig grunderna för det underlättar mycket när man uppdaterar koden. Du kan också använda text-redigerare som `vscode` eller liknande för att underlätta när du kodar och `vscode` har ett inbyggt system för att hantera git commandon. 

Här är en quickstart för att använda `git` i `vscode`: [vscode quickstart](https://code.visualstudio.com/docs/sourcecontrol/quickstart)

Ett tips är att commita så mycket som möjligt, så fort du gjort en meningsfull ändring och skriv vad du ändrade i meddelandet. 

Om du vill lära dig mer är branchess ett bra ställe att börja på. Det finns en beskrivning på vad det är och hur du använder det här: [vscode branches](https://code.visualstudio.com/docs/sourcecontrol/branches-worktrees)

***`OBS!`*** branches är väldigt användbara (kanske nödvändiga) att lära sig om flera personer ska jobba på koden samtidigt, även om man jobbar på olika verktyg (det vill säga när man jobbar på samma repo).