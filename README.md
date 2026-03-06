# Kodbibliotek nygeneration.se
Detta repo innehåller kod som används på våran hemsida nygeneration.se. Alla filer som är publiserade och kan användas av hemsidan finns under mappen `doc/`. Så här ser filstrukturen ut. 

```text
doc/
├── index.html
├── preview.html
├── data/
│   ├── schools.json
│   └── <other-data>
└── <code-library-name>
        ├── dev/
        │   ├── test.html
        │   └── <library-files>
        ├── <library-files>
        └── README.md
```

## Mappen `data/`
Mappen innehåller all data som används på hemsidan. 

`schools.json` uppdatersas just nu automatiskt av ett appsscript som hämtar data från salesforce. 

## Mappen `<code-library-name>/`
Innehåller alla filer för att implementera en specifik funktion på hemsidan och gärna en README.md fil som förklarar hur man använder koden. 

Mappen `dev/` används när man utvecklar/ändrar verktyget. Dessa filer kan man länka till i gömda/debug sidor på squarespace för att testa koden utan att riskera att förstöra funktionen på sidor som redan använder en tidigare version av koden. Sidorna som användarna ser (dvs de som är i produktion) ska länka till koden utanför `dev/` det vill säga i mappen `<code-library-name>/`. I `dev/` kan man också testa lokalt med en test.html fil eller liknande när det är möjligt (rekommenderat). 

## Filen `index.html`
Denna fil innehåller lite info om sidan och vart all kod fins.

## Filen `preview.html`
Denna fil innehåller en preview av varje egengjort element (som är fristående och inte kräver andra element från en squarespace sida). Denna bör länka till produktionskoden i biblioteken. 



## Utveckling och `git`
För att ladda upp koden till github brukar man använda programmet `git`. Om du inte vet hur det fungerar rekomenderar jag dig att lära dig grunderna för det underlättar mycket. Du kan också använda text-redigerare som `vscode` eller liknande för att underlätta när du kodar. 

Här är en quickstart för att använda `git` i `vscode`: [vscode quickstart](https://code.visualstudio.com/docs/sourcecontrol/quickstart)

Ett tips om du vill lära dig mer är att använda branchess. Det finns en beskrivning på vad det är och hur du använder det här: [vscode branches](https://code.visualstudio.com/docs/sourcecontrol/branches-worktrees)

***`OBS!`*** branches är nödvändigt att lära sig om när flera personer ska jobba på koden samtidigt, även om det är olika verktyg till hemsidan (det vill säga när man jobbar på samma repository).