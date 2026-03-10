# School List Widget
Det här är en widget som skapar en sökbar lista med alla skolgrupper i vår databas samt visar vilka skolor som har en aktiv skolgrupp. 

Just nu är koden specialskriven för att visa en viss struktur på data, det vill säga den som ges av vår endpoint i Google Sheets (denna data laddas automatiskt upp till projektet på en annan branch). 

## Användning
Så här lägger du till koden på en squarespace-sida:

1. Börja med att importera kodbiblioteket fuse.js. Lägg denna kod antingen i en code-injection eller i samma kodblock som i steg två. Du kan byta ut versionen (7.1.0) till senaste versionen om du vill/det behövs. 

```html
<script src="https://cdn.jsdelivr.net/npm/fuse.js@7.1.0"></script>
```

2. Lägg in denna kod i ett kodblock på hemsidan där du vill ha listan:

```html
<div data-school-app="true" data-url="<url till datan>">
    Laddar skolor...
</div>

<script src="<path to folder>/list-widget.js" defer></script>
```

`data-school-app="true"` talar om för skriptet att detta element ska användas som wrapper till listan. 

`data-url` är länken till datan som ska visas (dvs alla skolor och skolgrupper). 

3. Länka stylingen genom att lägga in detta i code-injektion:

```html
<link rel="stylesheet" href="<path to folder>/list-widget.css">
```

## Länkar
För att hitta länken som du skriver in i stället för `<path to folder>` och i `data-url` kan du använda instruktionerna som finns i filen [README.md](../../README.md#att-länka-kod) i projektets root-mapp (huvudmappen). 