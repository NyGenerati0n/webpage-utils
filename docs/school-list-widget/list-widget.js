(function() {

const MAX_CARDS_SHOW = 50; // The amount of cards to show at a time
const N_LOADING_CARDS = 5;
const NO_MORE_RESULTS_LABEL = "Det finns inga fler resultat";
const NO_RESULT_LABEL = "Inga resultat hittades";
const SEARCH_PLACEHOLDER_TEXT = "Sök på din skola...";

const scriptUrl = document.currentScript.src;
const baseUrl = scriptUrl.substring(0, scriptUrl.lastIndexOf('/'));

document.addEventListener("DOMContentLoaded", () => {
  // Hitta elementet med data-attributet
  const containers = document.querySelectorAll('[data-school-app="true"]');

  for (const container of containers) {
    if (!container) continue;

    const url = container.getAttribute('data-url');
    const follow = container.getAttribute('data-follow-container') === "true";

    // Initiera widget
    initSchoolList(container, url, follow);
  }
});

async function initSchoolList(target, url, follow) {
  // ====== Build Widget ======
  const { EL_SEARCH_INPUT } = buildLayout(target);
  target.className = "list-widget-container"
  if(follow)
    target.className = "list-widget-container-follow"

  // ====== Target-specifik variables ======
  const STATE = {
    cards_shown: 0,
    shown_all_cards: false,
  }

  const LIST = target.querySelector(".list-widget-schools-container");
  const DATA = await loadData(url);
  const SCHOOLS_UNFILTERED = DATA.schools;
  const FUSE = new Fuse(SCHOOLS_UNFILTERED, {
    keys: ["name", "adress.city", "type"],
    threshold: 0.32
  })

  displayData(SCHOOLS_UNFILTERED);

  
  // ====== Target Events ======
  EL_SEARCH_INPUT.addEventListener("input", e => {
    STATE.cards_shown = 0;
    STATE.shown_all_cards = false;

    if(EL_SEARCH_INPUT.value === "")
      displayData(SCHOOLS_UNFILTERED)
    else
      displayData(FUSE.search(EL_SEARCH_INPUT.value).map(el => el.item));
  })
  
  // ====== Target-specifik functions ======
  function clearData() {
    LIST.innerHTML = "";
  }

  function displayData(data) {
    clearData();

    let iMax = STATE.cards_shown + MAX_CARDS_SHOW
    for(let i = STATE.cards_shown; i < data.length; i++) {
      if(i >= iMax) break;
      const school = data[i];
      const card = buildSchoolCard(school)

      LIST.appendChild(card);
      STATE.cards_shown++;
    }

    const sentinel = createDiv();
    const loader = createDiv("list-widget-schools-load-more-label", "Laddar fler skolor...");

    LIST.appendChild(sentinel);
    LIST.appendChild(loader);



    if(data.length == STATE.cards_shown) {
      STATE.shown_all_cards = true;

      LIST.removeChild(sentinel);
      if(data.length == 0)
        loader.innerHTML = NO_RESULT_LABEL;  
      else
        loader.innerHTML = NO_MORE_RESULTS_LABEL;
    }


    initInfiniteScroll(sentinel, loader, data);
  }

  function displayMoreData(data, sentinel, loader) {
    let iMax = STATE.cards_shown + MAX_CARDS_SHOW
    for(let i = STATE.cards_shown; i < data.length; i++) {
      if(i >= iMax) break;
      const school = data[i];
      const card = buildSchoolCard(school)

      LIST.insertBefore(card, sentinel);
      STATE.cards_shown++;
    }

    if(data.length == STATE.cards_shown) {
      STATE.shown_all_cards = true;

      LIST.removeChild(sentinel);
      loader.innerHTML = NO_MORE_RESULTS_LABEL;
    }
  }

  function initInfiniteScroll(sentinel, loader, data) {
    const options = {
      root: target, // Använder webbläsarfönstret som referens
      rootMargin: '200px', // Börja ladda redan 200px innan användaren når botten
      threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(entry.isIntersecting && !STATE.shown_all_cards) {
          displayMoreData(data, sentinel, loader);
        }
      })
    }, options);

    observer.observe(sentinel);
  }
}


// ====== General Helper Functions ======
function loadData(url) {
  return fetch(url).then(res => res.json());
}

function createDiv(className = "", innerHTML = ""){
  const el = document.createElement("div")
  el.className = className;
  el.innerHTML = innerHTML;
  return el;
}

function createTextInput(className = "", placeholderText = "") {
  const el = document.createElement("input");
  el.className = className;
  el.placeholder = placeholderText;
  return el;
}

function createImg(src, className = "") {
  const el = document.createElement("img");
  el.className = className;
  el.src = baseUrl + "/" + src;
  return el;
}

function buildSchoolCard(school) {
  const container = createDiv("list-widget-school-card");
  const title = createDiv("list-widget-school-card-title");
  const indicator = createDiv("list-widget-school-card-group-indicator" + (school.isActive? " list-widget-active" : " list-widget-inactive"));
  const name = createDiv("list-widget-school-card-info-name", school.name);
  const info = createDiv("list-widget-school-card-info");
  const type = createDiv("list-widget-school-card-info-type", school.type);
  const city = createDiv("list-widget-school-card-info-city", school.adress.city);

  
  container.appendChild(title);
  container.appendChild(info);

  title.appendChild(indicator);
  title.appendChild(name);

  info.appendChild(type);
  info.appendChild(city);
  

  return container;
}

function buildSchoolCardLoadingPlaceholder() {
  const container = createDiv("list-widget-school-card list-widget-school-card-loading");
  const title = createDiv("list-widget-school-card-title");
  const indicator = createDiv("list-widget-school-card-group-indicator");
  const name = createDiv("list-widget-school-card-info-name", "Skolan laddas");
  const info = createDiv("list-widget-school-card-info");
  const type = createDiv("list-widget-school-card-info-type", "Detta visar skolans info");

  
  container.appendChild(title);
  container.appendChild(info);

  title.appendChild(indicator);
  title.appendChild(name);

  info.appendChild(type);
  

  return container;
}


function buildLayout(target) {
  target.innerHTML = "";

  const EL_SEARCH_CONTAINER = createDiv("list-widget-search-container");
  const EL_INPUT_CONTAINER = createDiv("list-widget-search-input-container");
  const EL_SEARCH_INPUT = createTextInput("list-widget-search-input", SEARCH_PLACEHOLDER_TEXT);
  const EL_SEARCH_BUTTON = createDiv("list-widget-search-icon");
  const EL_SEARCH_BUTTON_IMG = createImg("img/magnifying-glass-icon.png", "list-widget-image");
  const EL_LIST_CONTAINER = createDiv("list-widget-schools-container");


  EL_SEARCH_CONTAINER.appendChild(EL_INPUT_CONTAINER);

  EL_INPUT_CONTAINER.appendChild(EL_SEARCH_BUTTON);
  EL_INPUT_CONTAINER.appendChild(EL_SEARCH_INPUT);

  EL_SEARCH_BUTTON.appendChild(EL_SEARCH_BUTTON_IMG);

  target.appendChild(EL_SEARCH_CONTAINER);
  target.appendChild(EL_LIST_CONTAINER);


  // Make sure you cant drag the images
  EL_SEARCH_BUTTON_IMG.setAttribute('no-drag', 'on');
  EL_SEARCH_BUTTON_IMG.setAttribute('draggable', 'false');
  EL_SEARCH_BUTTON_IMG.addEventListener('dragstart', e => e.preventDefault(), false);


  // Build temporary cards with loading animation
  for(let i = 0; i < N_LOADING_CARDS; i++) {
    EL_LIST_CONTAINER.appendChild(buildSchoolCardLoadingPlaceholder());
  }

  return { EL_SEARCH_INPUT, EL_SEARCH_BUTTON, EL_LIST_CONTAINER }
}





})();