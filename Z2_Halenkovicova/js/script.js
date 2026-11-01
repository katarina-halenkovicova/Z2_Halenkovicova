const SOURCES = {
  eatnmeet: "data/eatandmeet.html",
  idyla:    "data/idyla.html",
  fiit:     "data/fiitfood.html",
};

const LABELS = {
  eatnmeet: { name: "Eat&Meet", url: "https://eatandmeet.sk/" },
  idyla:    { name: "Idyla – Karlova Ves", url: "https://restauracie.sme.sk/restauracia/idyla-2-cafe-restaurant_1295-karlova-ves_2738/denne-menu" },
  fiit:     { name: "FiitFood (FIIT STU)", url: "http://www.freefood.sk/menu/#fiit-food" },
};

async function loadRestaurantHtml(path) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Stránku sa nepodarilo načítať (HTTP ${response.status}).`);
  }
  return response.text();
}

function parseHtml(html) {
  return new DOMParser().parseFromString(html, "text/html");
}

function cleanText(text) {
  return text.replace(/\s+/g, " ").trim();
}


const DAY_NAMES = {
  "day-1": "Pondelok",
  "day-2": "Utorok",
  "day-3": "Streda",
  "day-4": "Štvrtok",
  "day-5": "Piatok",
  "day-6": "Sobota",
  "day-7": "Nedeľa",
};

const DAY_NAMES_2 = {
  1: "Pondelok",
  2: "Utorok",
  3: "Streda",
  4: "Štvrtok",
  5: "Piatok",
  6: "Sobota",
  7: "Nedeľa",
};

// "0,90 € / " or "5,90 €" -> 0.9
function parsePrice(raw) {
  const m = (raw ?? "").match(/\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(",", ".")) : null;
}

function clean(str) {
  return (str ?? "").replace(/\s+/g, " ").trim();
}

//Eat&Meet 

function parseEatnMeet(doc) {
  const panes = [...doc.querySelectorAll(".tab-content .tab-pane")];

  return panes.map((pane) => {
    const items = [...pane.querySelectorAll(".menu-left")].map(parseEatnMeetDish);

    return {
      dayId: pane.id || null,                                  // "day-1"
      day: DAY_NAMES[pane.id] || null,                         // "Pondelok"
      items,
    };
  });
}

function parseEatnMeetDish(section) {
  const title = section.querySelector(".menu-title");
  const priceEl = title?.querySelector(".price");
  const desc = section.querySelector(".menu-description .desc");

  return {
    category: clean(title?.querySelector("h4")?.textContent),  // "Polievka 1", "MENU 2"
    name: eatnMeetDishName(desc),
    allergens: eatnMeetAllergens(desc),
    price: parsePrice(priceEl?.firstChild?.textContent),       // 0.9  (full price)
    subsidizedPrice: parsePrice(priceEl?.querySelector("span")?.textContent), // 0.9
    image: section.querySelector(".menu-thumbnail img")?.getAttribute("src") || null,
  };
}

function eatnMeetDishName(desc) {
  if (!desc) return "";
  const clone = desc.cloneNode(true);
  clone.querySelectorAll("span").forEach((s) => s.remove());
  return clean(clone.textContent);
}

// <span>(1,7)</span> -> [1, 7]   |   <span></span> -> []
function eatnMeetAllergens(desc) {
  return [...(desc?.querySelectorAll("span") ?? [])]
    .flatMap((s) => s.textContent.match(/\d+/g) ?? [])
    .map(Number);
}

//Idyla

function parseIdylaMenu(doc) {
  const blocks = [
    ...doc.querySelectorAll(".dnesne_menu"),
    ...doc.querySelectorAll(".ostatne_menu"),
  ];

  return blocks
    .map(parseIdylaDayBlock)
    .filter((day) => day.date || day.items.length);
}

function parseIdylaDayBlock(block) {
  const { date, dateText } = parseIdylaHeading(block.querySelector("h2"));

  const items = [...block.querySelectorAll(".jedlo_polozka")]
    .map(parseIdylaDish)
    .filter((dish) => dish.name || dish.price !== null);

  return {
    date,                                        // "2026-11-02"
    dateText,                                    // "02.11.2026"
    day: date ? DAY_NAMES_2[isoWeekday(date)] : null, // "Pondelok"
    isToday: block.classList.contains("dnesne_menu"),
    closed: items.length === 0,                  // "Zatvorené."
    items,
  };
}

function parseIdylaDish(section) {
  const left = section.querySelector(".left");
  const right = section.querySelector(".right");

  const text = clean(left?.textContent);
  const price = parsePrice(right?.textContent);

  // "Zatvorené." / "2.11.2026" placeholders carry no dish
  if (!text || /^zatvoren/i.test(text) || /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(text)) {
    return { name: "", allergens: [], price: null, raw: text };
  }

  return {
    name: idylaDishName(text),                     // "Kurací rezeň, zemiaková kaša 150g"
    allergens: idylaAllergens(text),               // [1, 7]
    price,                                       // 5.9
    raw: text,
  };
}

// "Kurací rezeň (1,7) 150g" -> "Kurací rezeň 150g"
function idylaDishName(text) {
  return clean(text.replace(/\(([\d,\s]*)\)/g, " "));
}

// "(1,7)" -> [1, 7]   |   no parens -> []
function idylaAllergens(text) {
  const groups = text.match(/\(([\d,\s]*)\)/g) ?? [];
  return groups
    .flatMap((g) => g.match(/\d+/g) ?? [])
    .map(Number);
}

// "Obedové menu Pondelok (02.11.2026)" -> { date: "2026-11-02", dateText: "02.11.2026" }
function parseIdylaHeading(h2) {
  const text = clean(h2?.textContent);
  const m = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return { date: null, dateText: null };

  const [, d, mo, y] = m;
  return {
    date: `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`,
    dateText: m[0],
  };
}

// "2026-11-02" -> 1 (Monday) … 7 (Sunday), without timezone drift
function isoWeekday(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

//FIIT food
const FIIT_TAB_ID = "fiit-food";

function parseFiitFood(doc) {
  const tab = doc.querySelector(`#${FIIT_TAB_ID}`);
  if (!tab) return [];

  return [...tab.querySelectorAll(".daily-offer .day-title")]
    .map((titleLi) => parseFiitFoodDay(titleLi))
    .filter((day) => day.date || day.items.length);
}

function parseFiitFoodDay(titleLi) {
  const { date, dateText } = parseFreeFoodHeading(titleLi);
  const list = titleLi.querySelector(".day-offer");

  const items = [...(list?.children ?? [])]
    .map(parseFiitFoodDish)
    .filter((dish) => dish.name);

  return {
    date,                                        // "2026-10-26"
    dateText,                                    // "26.10.2026"
    day: date ? DAY_NAMES_2[isoWeekday(date)] : null, // "Pondelok"
    closed: items.length === 0,
    items,
  };
}

function parseFiitFoodDish(li) {
  const price = parsePrice(li.querySelector(".brand.price")?.textContent);

  const clone = li.cloneNode(true);
  clone.querySelectorAll(".brand.price").forEach((s) => s.remove());
  const text = clean(clone.textContent);

  return {
    name: freeFoodDishName(text),                // "Zeleninová s mušličkami 0,3l"
    allergens: freeFoodAllergens(text),          // [1, 3]
    price,                                       // 1.7
    raw: text,
  };
}

// "P. Zeleninová s mušličkami 0,3l A:1,3" -> "Zeleninová s mušličkami 0,3l"
function freeFoodDishName(text) {
  return clean(
    text
      .replace(/\s*A:\s*[\d,\s]*$/i, " ")
      .replace(/^[A-ZÁ-Ž]\.\s+/, " ")
  );
}

// "A:1,3" -> [1, 3]   |   no marker -> []
function freeFoodAllergens(text) {
  const m = text.match(/A:\s*([\d,\s]+)/i);
  return m ? (m[1].match(/\d+/g) ?? []).map(Number) : [];
}

// "pondelok, 26.10.2026" -> { date: "2026-10-26", dateText: "26.10.2026" }
function parseFreeFoodHeading(li) {
  const text = clean(li.textContent);
  const m = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return { date: null, dateText: null };

  const [, d, mo, y] = m;
  return {
    date: `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`,
    dateText: m[0],
  };
}



async function main() {
  const entries = Object.entries(SOURCES);

  const settled = await Promise.allSettled(
    entries.map(async ([key, path]) => {
      const doc = parseHtml(await loadRestaurantHtml(path));
      return { key, days: parseSource(key, doc) };
    })
  );

  const results = {};
  settled.forEach((outcome, i) => {
    const key = entries[i][0];
    results[key] = outcome.status === "fulfilled"
      ? outcome.value.days
      : { error: outcome.reason?.message ?? "Neznáma chyba" };
  });

  render(results);
  return results;
}

function render(results) {
  const root = document.querySelector("#menu-root");
  if (!root) return;

  root.innerHTML = "";

  for (const [key, days] of Object.entries(results)) {
    const meta = LABELS[key] ?? { name: key };

    const section = document.createElement("section");
    section.className = "restaurant";

    const h2 = document.createElement("h2");
    h2.textContent = meta.name;
    section.append(h2);

    if (meta.url) {
      const link = document.createElement("a");
      link.className = "restaurant-link";
      link.href = meta.url;
      link.textContent = "Pôvodná stránka";
      link.rel = "noopener";
      section.append(link);
    }

    if (days?.error) {
      const p = document.createElement("p");
      p.className = "error";
      p.textContent = `Menu sa nepodarilo načítať: ${days.error}`;
      section.append(p);
    } else if (!days?.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "Žiadne menu k dispozícii.";
      section.append(p);
    } else {
      section.append(renderDays(days));
    }

    root.append(section);
  }
}

function parseSource(key, doc) {
  switch (key) {
    case "eatnmeet": return parseEatnMeet(doc);
    case "idyla":    return parseIdylaMenu(doc);
    case "fiit":     return parseFiitFood(doc);
    default:         return [];
  }
}

function renderDays(days) {
  const wrap = document.createElement("div");
  wrap.className = "days";

  for (const day of days) {
    const card = document.createElement("article");
    card.className = "day" + (day.isToday ? " day--today" : "");

    const h3 = document.createElement("h3");
    h3.textContent = day.day
      ? `${day.day}${day.dateText ? ` · ${day.dateText}` : ""}`
      : day.dateText ?? "Menu";
    card.append(h3);

    if (day.closed || !day.items.length) {
      const p = document.createElement("p");
      p.className = "closed";
      p.textContent = "Zatvorené.";
      card.append(p);
    } else {
      card.append(renderItems(day.items));
    }

    wrap.append(card);
  }
  return wrap;
}


function renderItems(items) {
  const list = document.createElement("ul");
  list.className = "dishes";

  for (const dish of items) {
    const li = document.createElement("li");

    const name = document.createElement("span");
    name.className = "dish-name";
    name.textContent = dish.name;
    li.append(name);

    if (dish.category) {
      const cat = document.createElement("span");
      cat.className = "dish-category";
      cat.textContent = dish.category;
      li.append(cat);
    }

    if (dish.allergens?.length) {
      const al = document.createElement("span");
      al.className = "dish-allergens";
      al.textContent = `Alergény: ${dish.allergens.join(", ")}`;
      li.append(al);
    }

    if (dish.price !== null && dish.price !== undefined) {
      const price = document.createElement("span");
      price.className = "dish-price";
      price.textContent = formatPrice(dish.price);
      li.append(price);
    }

    list.append(li);
  }
  return list;
}

function formatPrice(value) {
  return value.toLocaleString("sk-SK", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}



main();