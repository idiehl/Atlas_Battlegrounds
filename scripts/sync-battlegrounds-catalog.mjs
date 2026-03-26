import { mkdir, writeFile } from "node:fs/promises";

const BASE_URL = "https://hearthstone.blizzard.com/en-us";
const CATALOG_URL = `${BASE_URL}/battlegrounds?minionType=all`;
const API_URL = `${BASE_URL}/api/cards`;
const OUTPUT_DIR = new URL("../data/", import.meta.url);
const PAGE_SIZE = 200;
const LOCALE = "en_US";

const BG_CARD_TYPES = [
  { key: "hero", label: "Heroes" },
  { key: "minion", label: "Minions" },
  { key: "quest", label: "Quests" },
  { key: "reward", label: "Rewards" },
  { key: "anomaly", label: "Anomalies" },
  { key: "spell", label: "Spells" },
  { key: "trinket", label: "Trinkets" },
  { key: "timewarp", label: "Timewarp" }
];

function buildRequest(url) {
  return new Request(url, {
    headers: {
      "user-agent": "Mozilla/5.0 Codex Hearthstone Catalog Sync"
    }
  });
}

async function fetchJson(url) {
  const response = await fetch(buildRequest(url));
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} for ${url}`);
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(buildRequest(url));
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} for ${url}`);
  }
  return response.text();
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function pickLocaleText(value) {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return value[LOCALE] ?? value.en_US ?? Object.values(value)[0] ?? "";
}

function stripHtml(value = "") {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractConfigMinionTypes(html) {
  const match = html.match(/<div id="battlegroundsMount"[^>]*config="([^"]+)"/);
  if (!match) {
    throw new Error("Unable to locate battlegrounds page config.");
  }

  const config = JSON.parse(decodeHtmlEntities(match[1]));
  const battlegroundsMode = config.gameModes?.find((entry) => entry.slug === "battlegrounds");
  const battlegroundsModeId = battlegroundsMode?.id;
  const minionTypes = (config.minionTypes ?? [])
    .filter((entry) => entry.id === 0 || !battlegroundsModeId || (entry.gameModes ?? []).includes(battlegroundsModeId))
    .map((entry) => ({
      id: entry.id,
      slug: entry.slug,
      name: entry.name
    }));

  return {
    battlegroundsModeId,
    minionTypes
  };
}

async function fetchCategory(typeKey) {
  const firstPage = await fetchJson(`${API_URL}?gameMode=battlegrounds&bgCardType=${typeKey}&page=1&pageSize=${PAGE_SIZE}`);
  const cards = [...firstPage.cards];

  for (let page = 2; page <= firstPage.pageCount; page += 1) {
    const nextPage = await fetchJson(`${API_URL}?gameMode=battlegrounds&bgCardType=${typeKey}&page=${page}&pageSize=${PAGE_SIZE}`);
    cards.push(...nextPage.cards);
  }

  return {
    typeKey,
    cardCount: firstPage.cardCount,
    cards
  };
}

function unique(values) {
  return [...new Set(values)];
}

async function fetchCardsByIds(ids) {
  const batches = [];
  for (let index = 0; index < ids.length; index += 100) {
    batches.push(ids.slice(index, index + 100));
  }

  const cards = [];
  for (const batch of batches) {
    const payload = await fetchJson(`${API_URL}?ids=${batch.join(",")}`);
    cards.push(...payload.cards);
  }

  return cards;
}

function normalizeCard(raw, context = {}) {
  const bg = raw.battlegrounds ?? {};
  const name = pickLocaleText(raw.name);
  const text = pickLocaleText(raw.text);
  const flavorText = pickLocaleText(raw.flavorText);
  const image = pickLocaleText(bg.image) || pickLocaleText(raw.image);
  const imageGold = pickLocaleText(bg.imageGold) || pickLocaleText(raw.imageGold);
  const minionType = context.minionTypeMap?.get(raw.minionTypeId) ?? null;
  const tier = bg.tier ?? null;
  const category = context.category ?? null;

  return {
    id: raw.id,
    slug: raw.slug,
    name,
    text,
    plainText: stripHtml(text),
    flavorText,
    artist: raw.artistName ?? "",
    category,
    cardTypeId: raw.cardTypeId ?? null,
    classId: raw.classId ?? null,
    minionTypeId: raw.minionTypeId ?? null,
    minionType: minionType?.name ?? null,
    minionTypeSlug: minionType?.slug ?? null,
    cardSetId: raw.cardSetId ?? null,
    rarityId: raw.rarityId ?? null,
    attack: raw.attack ?? null,
    health: raw.health ?? null,
    armor: raw.armor ?? null,
    manaCost: raw.manaCost ?? null,
    tier,
    collectible: Boolean(raw.collectible),
    hero: Boolean(bg.hero),
    quest: Boolean(bg.quest),
    reward: Boolean(bg.reward),
    duosOnly: Boolean(bg.duosOnly),
    solosOnly: Boolean(bg.solosOnly),
    heroPowerId: bg.heroPowerId ?? null,
    upgradeId: bg.upgradeId ?? null,
    companionId: bg.companionId ?? null,
    childIds: raw.childIds ?? [],
    keywordIds: raw.keywordIds ?? [],
    image,
    imageGold,
    cropImage: raw.cropImage ?? "",
    searchText: [
      name,
      stripHtml(text),
      flavorText,
      category,
      minionType?.name ?? "",
      tier ? `tier ${tier}` : "",
      raw.attack != null && raw.health != null ? `${raw.attack}/${raw.health}` : ""
    ]
      .join(" ")
      .toLowerCase()
  };
}

function sortCards(left, right) {
  const tierLeft = left.tier ?? 99;
  const tierRight = right.tier ?? 99;

  return tierLeft - tierRight
    || left.name.localeCompare(right.name)
    || left.id - right.id;
}

async function main() {
  console.log("Fetching battlegrounds page config...");
  const catalogPage = await fetchText(CATALOG_URL);
  const { minionTypes } = extractConfigMinionTypes(catalogPage);
  const minionTypeMap = new Map(minionTypes.map((entry) => [entry.id, entry]));

  console.log("Fetching category pages...");
  const categoryPayloads = [];
  for (const entry of BG_CARD_TYPES) {
    const payload = await fetchCategory(entry.key);
    categoryPayloads.push(payload);
    console.log(`  ${entry.key}: ${payload.cards.length}`);
  }

  const mainCards = [];
  for (const payload of categoryPayloads) {
    mainCards.push(
      ...payload.cards.map((card) => normalizeCard(card, {
        category: payload.typeKey,
        minionTypeMap
      }))
    );
  }

  const mainCardIds = new Set(mainCards.map((card) => card.id));
  const linkedIds = unique(
    mainCards.flatMap((card) => [
      card.heroPowerId,
      card.upgradeId,
      card.companionId
    ].filter(Boolean))
  ).filter((id) => !mainCardIds.has(id));

  console.log(`Fetching ${linkedIds.length} linked detail cards...`);
  const linkedCardsRaw = linkedIds.length > 0 ? await fetchCardsByIds(linkedIds) : [];
  const linkedCards = linkedCardsRaw
    .map((card) => normalizeCard(card, { minionTypeMap }))
    .sort(sortCards);

  const linkedCardMap = Object.fromEntries(linkedCards.map((card) => [card.id, card]));
  const cards = mainCards.sort(sortCards);

  const counts = Object.fromEntries(
    BG_CARD_TYPES.map((entry) => [entry.key, cards.filter((card) => card.category === entry.key).length])
  );
  counts.all = cards.length;

  const payload = {
    syncedAt: new Date().toISOString(),
    source: {
      page: CATALOG_URL,
      api: API_URL
    },
    counts,
    bgCardTypes: [
      { key: "all", label: "All", count: counts.all },
      ...BG_CARD_TYPES.map((entry) => ({
        key: entry.key,
        label: entry.label,
        count: counts[entry.key]
      }))
    ],
    minionTypes: [
      { id: 0, slug: "all", name: "All Types" },
      ...minionTypes.filter((entry) => entry.id !== 0)
    ],
    cards,
    linkedCards: linkedCardMap
  };

  await mkdir(OUTPUT_DIR, { recursive: true });

  const jsonFile = new URL("battlegrounds-catalog.json", OUTPUT_DIR);
  const jsFile = new URL("battlegrounds-catalog.js", OUTPUT_DIR);

  await writeFile(jsonFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeFile(jsFile, `window.BATTLEGROUNDS_CATALOG = ${JSON.stringify(payload, null, 2)};\n`, "utf8");

  console.log(`Wrote ${cards.length} catalog cards and ${linkedCards.length} linked cards.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
