const catalog = window.BATTLEGROUNDS_CATALOG;
const buildsCatalog = window.BATTLEGROUNDS_BUILDS;
const combosCatalog = window.BATTLEGROUNDS_COMBOS ?? { combos: [], methodology: [], sources: [], asOf: catalog?.syncedAt ?? "" };
const buildGuideCatalog = window.BATTLEGROUNDS_BUILD_GUIDES ?? {};
const buildTierPlanCatalog = window.BATTLEGROUNDS_BUILD_TIER_PLANS ?? {};
const adConfig = window.ATLAS_AD_CONFIG ?? {
  enabled: false,
  desktopMinWidth: 1680,
  hiddenRoutes: ["community", "support", "privacy"],
  adClient: "",
  leftSlot: { adSlot: "", fallback: null },
  rightSlot: { adSlot: "", fallback: null },
  inlineTopSlot: { adSlot: "", fallback: null },
  inlineBottomSlot: { adSlot: "", fallback: null },
  inlineMidSlot: { adSlot: "", fallback: null }
};
const supportConfig = window.ATLAS_SUPPORT_CONFIG ?? {
  title: "Support Atlas",
  eyebrow: "Support Atlas",
  lead: "If Atlas is useful, optional contributions help fund upkeep and new development.",
  helper: "Support is optional and not tax-deductible.",
  transparencyNote: "No paywall and no supporter-only gameplay perks.",
  contactEmail: "",
  oneTimeOptions: [],
  monthlyOptions: [],
  customOption: null,
  fundingUses: [],
  notes: []
};

if (!catalog || !Array.isArray(catalog.cards) || catalog.cards.length === 0) {
  throw new Error("Battlegrounds catalog payload missing.");
}

if (!buildsCatalog || !Array.isArray(buildsCatalog.builds) || buildsCatalog.builds.length === 0) {
  throw new Error("Battlegrounds builds payload missing.");
}

const CATEGORY_PAGES = [
  { key: "heroes", category: "hero", label: "Heroes", heading: "Hero Library", detailKind: "hero" },
  { key: "minions", category: "minion", label: "Minions", heading: "Minion Library", detailKind: "card" },
  { key: "quests", category: "quest", label: "Quests", heading: "Quest Library", detailKind: "card" },
  { key: "rewards", category: "reward", label: "Rewards", heading: "Reward Library", detailKind: "card" },
  { key: "anomalies", category: "anomaly", label: "Anomalies", heading: "Anomaly Library", detailKind: "card" },
  { key: "spells", category: "spell", label: "Spells", heading: "Spell Library", detailKind: "card" },
  { key: "trinkets", category: "trinket", label: "Trinkets", heading: "Trinket Library", detailKind: "card" },
  { key: "timewarp", category: "timewarp", label: "Timewarp", heading: "Timewarp Library", detailKind: "card" }
];

const BUILDS_PAGE = { key: "builds", label: "Builds", kind: "builds" };
const COMBOS_PAGE = { key: "combos", label: "Combos", kind: "combos" };
const COMMUNITY_PAGE = { key: "community", label: "Community", kind: "community" };
const ACCOUNT_PAGE = { key: "account", label: "Account", kind: "account" };
const SUPPORT_PAGE = { key: "support", label: "Support", kind: "support" };
const PRIVACY_PAGE = { key: "privacy", label: "Privacy", kind: "privacy" };
const COMBO_BUCKETS = [
  {
    key: "core",
    label: "Core Engines",
    note: "These are the most repeatable two-card and three-card packages already overlapping the current top build board."
  },
  {
    key: "timewarp",
    label: "Timewarp Hits",
    note: "Chronum-only lines worth holding for because they immediately amplify real Season 12 endgame shells."
  },
  {
    key: "trinket",
    label: "Trinket Spikes",
    note: "Less common than the core engines, but still worth taking when your board already supports the trigger pattern."
  }
];

const NAV_PAGES = [
  BUILDS_PAGE,
  COMBOS_PAGE,
  ...CATEGORY_PAGES.map((entry) => ({
    key: entry.key,
    label: entry.label,
    kind: entry.detailKind,
    category: entry.category
  })),
  COMMUNITY_PAGE,
  ACCOUNT_PAGE,
  SUPPORT_PAGE
];

const ROUTE_PAGES = [...NAV_PAGES, PRIVACY_PAGE];
const PAGE_BY_KEY = new Map(ROUTE_PAGES.map((entry) => [entry.key, entry]));
const PAGE_BY_CATEGORY = new Map(CATEGORY_PAGES.map((entry) => [entry.category, entry]));
const LEGACY_PAGE_ALIASES = new Map([
  ["overview", "builds"],
  ["build", "builds"],
  ["combo", "combos"],
  ["forum", "community"],
  ["accounts", "account"],
  ["login", "account"],
  ["profile", "account"],
  ["donate", "support"],
  ["donation", "support"],
  ["contribute", "support"],
  ["privacy-policy", "privacy"],
  ["legal", "privacy"],
  ["cookies", "privacy"],
  ["strategy", "builds"],
  ["strategies", "builds"],
  ["cards", "minions"],
  ["hero", "heroes"],
  ["minion", "minions"],
  ["quest", "quests"],
  ["reward", "rewards"],
  ["anomaly", "anomalies"],
  ["spell", "spells"],
  ["trinket", "trinkets"]
]);

const CATEGORY_NOTES = {
  all: "Everything Blizzard currently surfaces in the Battlegrounds catalog.",
  hero: "Every live hero card, plus linked hero powers and companions in the detail view.",
  minion: "The full Tavern minion pool, filterable by type and Tavern Tier.",
  quest: "Quests that currently appear in the live Battlegrounds catalog.",
  reward: "Quest rewards and follow-up payoff cards from the live catalog.",
  anomaly: "Anomalies currently listed in Blizzard's Battlegrounds library.",
  spell: "Standalone Battlegrounds spells and spell cards in the current catalog.",
  trinket: "All listed trinkets, including lesser and greater trinket entries.",
  timewarp: "Timewarp cards surfaced by the live Blizzard library."
};

const BUILD_RATING_ORDER = ["S", "A", "B", "C"];
const BUILD_DIFFICULTY_ORDER = ["Easy", "Medium", "Hard"];

const cards = catalog.cards;
const heroes = cards.filter((card) => card.category === "hero");
const rawBuilds = buildsCatalog.builds;
const cardsById = new Map(cards.map((card) => [card.id, card]));
const linkedCardsById = new Map(
  Object.entries(catalog.linkedCards ?? {}).map(([id, card]) => [Number(id), card])
);
const typeOptions = catalog.bgCardTypes;
const minionTypeOptions = catalog.minionTypes ?? [];
const tierOptions = [...new Set(cards.map((card) => card.tier).filter(Boolean))].sort((left, right) => left - right);
const allLookupCards = [...cards, ...linkedCardsById.values()];

function categorySupportsTier(category) {
  return category === "minion" || category === "spell";
}

function categorySupportsMinionType(category) {
  return category === "minion";
}

function getDefaultLibrarySort(category) {
  return category === "spell" ? "tier_asc" : "name_asc";
}

const LOOKUP_ALIAS_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "for",
  "from",
  "in",
  "into",
  "major",
  "minor",
  "of",
  "on",
  "or",
  "the",
  "to",
  "up",
  "with",
  "young"
]);
const lookupAliasEntries = buildLookupAliasEntries(allLookupCards);

const numberFormatter = new Intl.NumberFormat("en-US");
const syncFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeStyle: "short"
});

const cardsPageSize = 36;
const heroesPageSize = 24;

const state = {
  route: parseHash(),
  analytics: {
    lastRouteKey: ""
  },
  builds: {
    search: "",
    tribe: "all",
    difficulty: "all",
    rating: "all"
  },
  libraries: Object.fromEntries(
    CATEGORY_PAGES.map((entry) => [
      entry.category,
      entry.category === "hero"
        ? {
            search: "",
            mode: "all",
            sort: "name_asc",
            page: 1
          }
        : {
            search: "",
            mode: "all",
            sort: getDefaultLibrarySort(entry.category),
            minionType: "all",
            tier: "all",
            page: 1
          }
    ])
  )
};

const refs = {
  nav: document.getElementById("primary-nav"),
  buildsView: document.getElementById("builds-view"),
  combosView: document.getElementById("combos-view"),
  communityView: document.getElementById("community-view"),
  supportView: document.getElementById("support-view"),
  privacyView: document.getElementById("privacy-view"),
  libraryView: document.getElementById("library-view"),
  heroesView: document.getElementById("heroes-view"),
  commentDrawer: document.getElementById("comment-drawer-root"),
  adRailLeft: document.getElementById("ad-rail-left"),
  adRailRight: document.getElementById("ad-rail-right"),
  footer: document.getElementById("app-footer")
};

let communityController = null;
let accountController = null;
let adsenseScriptPromise = null;
const commentState = {
  threads: new Map(),
  loadingKeys: new Set(),
  errors: new Map(),
  expandedKeys: new Set(),
  pendingSubmitKeys: new Set(),
  pendingDeleteIds: new Set(),
  pendingPinIds: new Set(),
  drawer: null
};
const COMMENT_SORT_OPTIONS = [
  { value: "top", label: "Top" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" }
];
const DEFAULT_COMMENT_SORT = COMMENT_SORT_OPTIONS[0].value;

function postTelemetry(path, payload) {
  try {
    void fetch(path, {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch {
    // Telemetry failures should never affect rendering.
  }
}

function escapeHtml(value = "") {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseHash() {
  const parts = location.hash.replace(/^#/, "").split("/").filter(Boolean);
  const rawPage = parts[0] ?? "builds";
  let rawSegments = parts.slice(1);
  let normalizedPage = LEGACY_PAGE_ALIASES.get(rawPage) ?? rawPage;

  if (rawPage === "forum" && rawSegments.length === 0) {
    rawSegments = ["forum"];
  }

  if (rawPage === "cards" && Number.isFinite(Number(rawSegments[0])) && cardsById.has(Number(rawSegments[0]))) {
    normalizedPage = getPageForCategory(cardsById.get(Number(rawSegments[0])).category);
  }

  const page = PAGE_BY_KEY.has(normalizedPage) ? normalizedPage : "builds";
  const segments = [...rawSegments];

  if ((page === "community" || page === "account") && segments.length === 1 && /^\d+$/.test(segments[0])) {
    segments.unshift("profile");
  }

  const trailingId = segments.length ? Number(segments.at(-1)) : null;
  const id = Number.isFinite(trailingId) && String(trailingId) === segments.at(-1) ? trailingId : null;

  return {
    page,
    id,
    segments
  };
}

function getRoutePage() {
  return PAGE_BY_KEY.get(state.route.page) ?? PAGE_BY_KEY.get("builds");
}

function getCategoryPage(pageKey = state.route.page) {
  const routePage = PAGE_BY_KEY.get(pageKey);
  if (!routePage?.category) {
    return null;
  }
  return PAGE_BY_CATEGORY.get(routePage.category) ?? null;
}

function getPageForCategory(category) {
  return PAGE_BY_CATEGORY.get(category)?.key ?? "builds";
}

function getLibraryState(category) {
  return state.libraries[category];
}

function formatSyncDate(value) {
  try {
    return syncFormatter.format(new Date(value));
  } catch {
    return value;
  }
}

function formatCount(value) {
  return numberFormatter.format(value);
}

function buildHash(page, id = null) {
  return id ? `#/${page}/${id}` : `#/${page}`;
}

function buildHashParts(page, ...parts) {
  const normalizedParts = parts
    .flat()
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);

  return normalizedParts.length ? `#/${page}/${normalizedParts.join("/")}` : `#/${page}`;
}

function navigate(page, id = null) {
  const nextHash = buildHash(page, id);
  if (location.hash === nextHash) {
    state.route = parseHash();
    render();
    return;
  }
  location.hash = nextHash;
}

function navigateParts(page, ...parts) {
  const nextHash = buildHashParts(page, ...parts);
  if (location.hash === nextHash) {
    state.route = parseHash();
    render();
    return;
  }
  location.hash = nextHash;
}

function getCategoryLabel(key) {
  return typeOptions.find((entry) => entry.key === key)?.label ?? key;
}

function getModeLabel(card) {
  if (card.duosOnly) {
    return "Duos Only";
  }
  if (card.solosOnly) {
    return "Solos Only";
  }
  return "All Modes";
}

function getCardImage(card, fallback = "") {
  return card.image || card.cropImage || fallback;
}

function getCardFullImage(card, fallback = "") {
  return card?.image || fallback;
}

function getCardSlugTail(slug = "") {
  return String(slug).replace(/^\d+-/, "");
}

function getLinkedCardThumbnail(card, sourceCard = null) {
  const directImage = getCardFullImage(card);
  if (directImage) {
    return { src: directImage, isCrop: false };
  }

  if (sourceCard?.name === card?.name) {
    const sourceImage = getCardFullImage(sourceCard);
    if (sourceImage) {
      return { src: sourceImage, isCrop: false };
    }
  }

  const slugTail = getCardSlugTail(card?.slug);
  const slugMatch = slugTail
    ? cards.find((entry) => getCardFullImage(entry) && getCardSlugTail(entry.slug) === slugTail)
    : null;
  if (slugMatch) {
    return { src: slugMatch.image, isCrop: false };
  }

  const prioritizedNameMatch = card?.name
    ? cards.find((entry) => getCardFullImage(entry) && entry.name === card.name && (!sourceCard?.category || entry.category === sourceCard.category))
    : null;
  if (prioritizedNameMatch) {
    return { src: prioritizedNameMatch.image, isCrop: false };
  }

  const fallbackNameMatch = card?.name
    ? cards.find((entry) => getCardFullImage(entry) && entry.name === card.name)
    : null;
  if (fallbackNameMatch) {
    return { src: fallbackNameMatch.image, isCrop: false };
  }

  const cropImage = card?.cropImage || "";
  if (cropImage) {
    return { src: cropImage, isCrop: true };
  }

  return { src: "", isCrop: false };
}

function getLookupCardKey(card) {
  return `${card.category}:${card.id ?? normalizeLookupText(card.name)}`;
}

function getLookupAliasCandidates(card) {
  const fullName = normalizeLookupText(card.name);
  const tokens = fullName.split(" ").filter(Boolean);
  const significantTokens = tokens.filter((token) => token.length >= 3 && !LOOKUP_ALIAS_STOPWORDS.has(token));
  const aliases = new Set([fullName]);

  if (significantTokens.length >= 2) {
    aliases.add(significantTokens.join(" "));
    aliases.add(significantTokens.slice(-2).join(" "));
  }

  significantTokens
    .filter((token) => token.length >= 5)
    .forEach((token) => aliases.add(token));

  return [...aliases].filter(Boolean);
}

function buildLookupAliasEntries(lookupCards) {
  const aliasMap = new Map();

  lookupCards.forEach((card) => {
    getLookupAliasCandidates(card).forEach((alias) => {
      if (!aliasMap.has(alias)) {
        aliasMap.set(alias, new Map());
      }
      aliasMap.get(alias).set(getLookupCardKey(card), card);
    });
  });

  return [...aliasMap.entries()]
    .filter(([, cardsForAlias]) => cardsForAlias.size === 1)
    .map(([alias, cardsForAlias]) => ({
      alias,
      card: [...cardsForAlias.values()][0]
    }))
    .sort((left, right) => right.alias.length - left.alias.length);
}

function normalizeLookupText(value = "") {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function slugify(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function findCardByName(name, category = null) {
  const normalizedName = normalizeLookupText(name);
  return allLookupCards.find((card) => {
    if (category && card.category !== category) {
      return false;
    }
    return normalizeLookupText(card.name) === normalizedName;
  }) ?? null;
}

function resolveNamedCards(names = [], category = null) {
  return [...new Set((names ?? []).filter(Boolean))].map((name) => ({
    name,
    card: findCardByName(name, category)
  }));
}

function findMentionedCards(text, { cards = allLookupCards, limit = 3 } = {}) {
  const normalizedText = normalizeLookupText(text);
  if (!normalizedText) {
    return [];
  }

  const haystack = ` ${normalizedText} `;
  const aliasEntries = cards === allLookupCards ? lookupAliasEntries : buildLookupAliasEntries(cards);
  const matches = [];
  const seen = new Set();

  aliasEntries.forEach((entry) => {
    const matchIndex = haystack.indexOf(` ${entry.alias} `);
    if (matchIndex === -1) {
      return;
    }

    const key = getLookupCardKey(entry.card);
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    matches.push({
      card: entry.card,
      index: matchIndex,
      aliasLength: entry.alias.length
    });
  });

  return matches
    .sort((left, right) => left.index - right.index || right.aliasLength - left.aliasLength)
    .slice(0, limit)
    .map((entry) => entry.card);
}

function getUniqueStrings(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function formatHumanList(values = [], conjunction = "and") {
  const items = getUniqueStrings(values);
  if (!items.length) {
    return "";
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return `${items[0]} ${conjunction} ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, ${conjunction} ${items.at(-1)}`;
}

function getGuideDefaultText(build) {
  const coreLead = formatHumanList(build.coreCards.slice(0, 2));
  const supportLead = formatHumanList(build.addonCards.slice(0, 2));
  const corePackage = formatHumanList(build.coreCards.slice(0, 3));
  const addonPackage = formatHumanList(build.addonCards.slice(0, 3));
  const tribeDescriptor = build.tribe === "Neutral" ? "board" : `${build.tribe.toLowerCase()} board`;
  const commitWindow = String(build.whenToCommit || build.buildName).replace(/\.$/, "");
  const howToPlay = String(build.howToPlay || "").replace(/\.$/, "");

  return {
    bestInSlotCards: [...build.coreCards, ...build.addonCards],
    signalCards: build.coreCards,
    pivotCards: build.addonCards,
    metaRead:
      build.metaRead
      ?? `${build.buildName} is currently tracked as a ${build.rating}-tier Season 12 line in the Firestone last-patch sample, posting an average finish of ${build.averagePlacement.toFixed(2)} across ${numberFormatter.format(build.games)} games. It performs best when ${coreLead || build.buildName} comes together early enough that the midgame can be spent buying support instead of emergency tempo.`,
    timewarpPriorities: [
      `Minor Timewarp should usually prioritize economy, Tavern-spell access, or extra copies that make ${coreLead || build.buildName} easier to assemble.`,
      `Major Timewarp is strongest when it finds premium support, trigger multipliers, or cleaner access to ${supportLead || build.buildName}.`,
      `If the board is unstable, cash Chronum into immediate tempo instead of greedily holding for a perfect ${build.buildName} turn.`
    ],
    openers: [
      `Stay on the strongest tempo curve first; weak ${build.tribe.toLowerCase()} tags alone are not enough reason to force the comp.`,
      `Buy flexible support that preserves health while keeping open the pivot into ${coreLead || build.buildName}.`,
      `Keep one or two clean stat carriers or utility slots so the first real payoff turn has something worth scaling.`
    ],
    commitChecklist: [
      `${commitWindow} is already online or one clean shop away.`,
      "Your health total can absorb a setup turn without losing control of the lobby.",
      `The surrounding shell already supports ${supportLead || coreLead || build.buildName}, rather than relying on one isolated high-roll card.`
    ],
    capBoard: [
      `Final board wants ${corePackage || build.buildName} as the core engine.`,
      `Support slots should be the highest-value enablers such as ${addonPackage || supportLead || build.buildName}, not leftover tempo bodies.`,
      "Use the final flex slot on scam, protection, or combat utility once the main engine already wins standard stat fights."
    ],
    heroFit: build.recommendedHeroes ?? [],
    techChoices: [
      `If the lobby is faster than expected, stabilize with one premium tempo slot before returning to the full ${build.buildName} shell.`,
      `When scam boards are common, cut the weakest support piece for a cleaner answer instead of greedily adding one more setup card.`,
      `If ${coreLead || build.buildName} is late, keep the support package flexible enough to pivot into the strongest adjacent endgame board.`
    ],
    commonMistakes: [
      `Forcing ${build.buildName} too early from weak shops instead of waiting for the real payoff window.`,
      `Keeping low-impact tempo cards after ${coreLead || build.buildName} is online and the board needs premium support instead.`,
      `Spending too many turns chasing the perfect cap board before the current lobby tempo is actually stable.`
    ],
    earlyGame:
      build.earlyGame
      ?? `Play the strongest tempo line available while you level on time and preserve enough health to reach the real ${build.buildName} turn.`,
    midGame:
      build.midGame
      ?? `Shift into the comp once ${commitWindow.toLowerCase()} appears, then stop buying filler units that do not advance the final ${tribeDescriptor}.`,
    lateGame:
      build.lateGame
      ?? `Trim weak tempo cards and spend every buy on scaling, protection, or premium support that raises the ceiling of ${coreLead || build.buildName}.`,
    positioning:
      build.positioning
      ?? `Protect the main payoff and let disposable support units absorb the most exposed combat slots so ${coreLead || build.buildName} survives to matter.`,
    pivotPlan:
      build.pivotPlan
      ?? `If ${commitWindow.toLowerCase()} never materializes, use the economy and support shell to pivot into the strongest adjacent late-game board instead of forcing ${build.buildName}.`,
    signalsSummary: build.signalsSummary ?? commitWindow
  };
}

function createFallbackTierEntry({ build, tier, keyTier, targetCards }) {
  const targetText = formatHumanList(targetCards);
  const tierConfig = {
    3: {
      turnWindow: tier === keyTier ? "1-2 turns" : "0-1 turns",
      pace: tier === keyTier ? "Build here" : "Pass-through"
    },
    4: {
      turnWindow: tier >= keyTier ? "1-2 turns" : "0-1 turns",
      pace: tier === keyTier ? "Stabilize here" : "Bridge to 5"
    },
    5: {
      turnWindow: tier === keyTier ? "1-2 turns" : "1 turn",
      pace: tier === keyTier ? "Spike on 5" : "Support tier"
    },
    6: {
      turnWindow: "Finish here",
      pace: "Cap here"
    }
  }[tier];

  let importance = "Medium";
  if (tier === keyTier) {
    importance = tier >= 5 ? "Critical" : "High";
  } else if (tier === Math.max(3, keyTier - 1) || (tier === 6 && keyTier < 6)) {
    importance = "High";
  }

  let goal = `Use Tier ${tier} to keep the board stable and set up the next real spike for ${build.buildName}.`;
  if (targetText) {
    goal = `Use Tier ${tier} to find ${targetText} and keep the board pointed toward ${build.buildName}.`;
  }

  let leveling = `Do not linger here unless the shop is unusually strong; the real swing usually starts closer to Tier ${keyTier}.`;
  if (tier === keyTier - 1) {
    leveling = `Take a short stabilizing stop here if the shop is strong, then level once you can survive the next fight.`;
  } else if (tier === keyTier) {
    leveling = `This is the main roll tier. Spend the bulk of your gold here until the payoff package is online, then level only if your health allows it.`;
  } else if (tier > keyTier) {
    leveling = `Only move here once the previous tier already produced the engine; after that, stay here and improve combat quality.`;
  }

  return {
    tier,
    importance,
    turnWindow: tierConfig.turnWindow,
    pace: tierConfig.pace,
    goal,
    leveling,
    targetCards
  };
}

function buildFallbackTierPlan(build, guideDetails) {
  const tierCandidates = getUniqueStrings([
    ...guideDetails.bestInSlotCards,
    ...guideDetails.signalCards,
    ...guideDetails.pivotCards,
    ...build.coreCards,
    ...build.addonCards,
    ...(build.tierSupportCards ?? [])
  ]);

  const resolvedTierCards = resolveNamedCards(tierCandidates)
    .filter((entry) => entry.card && Number.isFinite(entry.card.tier) && entry.card.tier >= 3 && entry.card.tier <= 6);

  const cardsByTier = new Map(
    [3, 4, 5, 6].map((tier) => [tier, []])
  );
  resolvedTierCards.forEach((entry) => {
    const bucket = cardsByTier.get(entry.card.tier);
    if (!bucket || bucket.some((candidate) => candidate.name === entry.name)) {
      return;
    }
    bucket.push(entry);
  });

  const signalResolved = resolveNamedCards(guideDetails.signalCards)
    .filter((entry) => entry.card && Number.isFinite(entry.card.tier) && entry.card.tier >= 3 && entry.card.tier <= 6);
  const keyTier = signalResolved.length
    ? Math.max(...signalResolved.map((entry) => entry.card.tier))
    : 5;

  return [3, 4, 5, 6].map((tier) => createFallbackTierEntry({
    build,
    tier,
    keyTier,
    targetCards: (cardsByTier.get(tier) ?? []).slice(0, 3).map((entry) => entry.name)
  }));
}

const builds = rawBuilds.map((build) => {
  const guideDefaults = getGuideDefaultText(build);
  const inlineGuideDetails = build.guideDetails ?? {};
  const guideDetails = {
    ...guideDefaults,
    ...inlineGuideDetails,
    ...(buildGuideCatalog[build.buildName] ?? {})
  };
  const coreResolved = resolveNamedCards(build.coreCards);
  const addonResolved = resolveNamedCards(build.addonCards);
  const bestInSlotResolved = resolveNamedCards(guideDetails.bestInSlotCards);
  const signalResolved = resolveNamedCards(guideDetails.signalCards);
  const pivotResolved = resolveNamedCards(guideDetails.pivotCards);
  const heroFitResolved = resolveNamedCards(guideDetails.heroFit, "hero");
  const tierPlanSource = build.tierPlan ?? buildTierPlanCatalog[build.buildName] ?? [];
  const tierPlan = (tierPlanSource.length ? tierPlanSource : buildFallbackTierPlan(build, guideDetails)).map((entry) => ({
    ...entry,
    resolvedTargets: resolveNamedCards(entry.targetCards)
  }));
  const leadCard = coreResolved.find((entry) => entry.card)?.card ?? addonResolved.find((entry) => entry.card)?.card ?? null;
  const guideMentionCards = [...new Map(
    [
      ...coreResolved,
      ...addonResolved,
      ...bestInSlotResolved,
      ...signalResolved,
      ...pivotResolved,
      ...heroFitResolved,
      ...tierPlan.flatMap((entry) => entry.resolvedTargets)
    ]
      .filter((entry) => entry.card)
      .map((entry) => [getLookupCardKey(entry.card), entry.card])
  ).values()];

  return {
    ...build,
    leadCard,
    coreResolved,
    addonResolved,
    bestInSlotCards: guideDetails.bestInSlotCards,
    signalCards: guideDetails.signalCards,
    pivotCards: guideDetails.pivotCards,
    metaRead: guideDetails.metaRead,
    timewarpPriorities: guideDetails.timewarpPriorities,
    openers: guideDetails.openers,
    commitChecklist: guideDetails.commitChecklist,
    capBoard: guideDetails.capBoard,
    heroFit: guideDetails.heroFit,
    techChoices: guideDetails.techChoices,
    commonMistakes: guideDetails.commonMistakes,
    earlyGame: guideDetails.earlyGame,
    midGame: guideDetails.midGame,
    lateGame: guideDetails.lateGame,
    positioning: guideDetails.positioning,
    pivotPlan: guideDetails.pivotPlan,
    signalsSummary: guideDetails.signalsSummary,
    bestInSlotResolved,
    signalResolved,
    pivotResolved,
    heroFitResolved,
    tierPlan,
    guideMentionCards,
    searchText: normalizeLookupText([
      build.tribe,
      build.buildName,
      build.rating,
      build.difficulty,
      build.whenToCommit,
      build.howToPlay,
      guideDetails.earlyGame,
      guideDetails.midGame,
      guideDetails.lateGame,
      guideDetails.positioning,
      guideDetails.pivotPlan,
      guideDetails.signalsSummary,
      guideDetails.metaRead,
      ...guideDetails.timewarpPriorities,
      ...guideDetails.openers,
      ...guideDetails.commitChecklist,
      ...guideDetails.capBoard,
      ...guideDetails.heroFit,
      ...guideDetails.techChoices,
      ...guideDetails.commonMistakes,
      ...build.coreCards,
      ...build.addonCards,
      ...guideDetails.bestInSlotCards,
      ...guideDetails.signalCards,
      ...guideDetails.pivotCards,
      ...tierPlan.flatMap((entry) => [
        `Tier ${entry.tier}`,
        entry.importance,
        entry.turnWindow,
        entry.pace,
        entry.goal,
        entry.leveling,
        ...(entry.targetCards ?? [])
      ])
    ].join(" "))
  };
});

const buildsByRank = new Map(builds.map((build) => [build.rank, build]));
const buildsByName = new Map(builds.map((build) => [build.buildName, build]));
const buildTribeOptions = ["all", ...new Set(builds.map((build) => build.tribe))];
const buildDifficultyOptions = ["all", ...BUILD_DIFFICULTY_ORDER.filter((difficulty) => builds.some((build) => build.difficulty === difficulty))];
const buildRatingOptions = ["all", ...BUILD_RATING_ORDER.filter((rating) => builds.some((build) => build.rating === rating))];
const comboBucketOrder = new Map(COMBO_BUCKETS.map((entry, index) => [entry.key, index]));
const combos = (combosCatalog.combos ?? [])
  .map((combo, index) => {
    const cardsResolved = resolveNamedCards(combo.cards ?? []);
    const sourceBuildRefs = (combo.sourceBuilds ?? [])
      .map((buildName) => buildsByName.get(buildName))
      .filter(Boolean);
    const key = slugify(combo.key || combo.title || `combo-${index + 1}`) || `combo-${index + 1}`;

    return {
      ...combo,
      key,
      sortIndex: index,
      cardsResolved,
      sourceBuildRefs,
      searchText: normalizeLookupText([
        combo.title,
        combo.bucket,
        combo.reliabilityLabel,
        combo.payoff,
        combo.summary,
        combo.whyItWorks,
        combo.assemble,
        combo.finisher,
        ...(combo.tags ?? []),
        ...(combo.cards ?? []),
        ...(combo.sourceBuilds ?? [])
      ].join(" "))
    };
  })
  .sort((left, right) => {
    if (right.reliabilityScore !== left.reliabilityScore) {
      return right.reliabilityScore - left.reliabilityScore;
    }

    const bucketDelta = (comboBucketOrder.get(left.bucket) ?? 99) - (comboBucketOrder.get(right.bucket) ?? 99);
    if (bucketDelta !== 0) {
      return bucketDelta;
    }

    return left.sortIndex - right.sortIndex;
  });
const combosByKey = new Map(combos.map((combo) => [combo.key, combo]));
const comboCountsByBucket = COMBO_BUCKETS.reduce((accumulator, bucket) => {
  accumulator[bucket.key] = combos.filter((combo) => combo.bucket === bucket.key).length;
  return accumulator;
}, {});

function getVisibleBuilds() {
  return builds
    .filter((build) => !state.builds.search || build.searchText.includes(state.builds.search))
    .filter((build) => state.builds.tribe === "all" || build.tribe === state.builds.tribe)
    .filter((build) => state.builds.difficulty === "all" || build.difficulty === state.builds.difficulty)
    .filter((build) => state.builds.rating === "all" || build.rating === state.builds.rating)
    .sort((left, right) => left.rank - right.rank);
}

function getResolvedBuildCards(entries) {
  return entries.filter((entry) => entry.card);
}

function getMissingBuildCards(entries) {
  return entries.filter((entry) => !entry.card).map((entry) => entry.name);
}

function renderNav() {
  refs.nav.innerHTML = NAV_PAGES.map((entry) => {
    const active = state.route.page === entry.key ? " is-active" : "";
    const href = entry.key === "community"
      ? buildHashParts("community", "builds")
      : entry.key === "account"
        ? buildHash("account")
        : buildHash(entry.key);
    return `<a class="nav-link${active}" href="${href}">${entry.label}</a>`;
  }).join("");
}

function getCardSummaryPills(card) {
  const pills = [getCategoryLabel(card.category)];

  if (card.tier) {
    pills.push(`Tier ${card.tier}`);
  }

  if (card.minionType) {
    pills.push(card.minionType);
  }

  if (card.attack != null && card.health != null) {
    pills.push(`${card.attack}/${card.health}`);
  }

  if (card.armor != null) {
    pills.push(`${card.armor} Armor`);
  }

  pills.push(getModeLabel(card));
  return pills;
}

function renderPillRow(values, muted = false) {
  return values
    .filter(Boolean)
    .map((value) => `<span class="pill${muted ? " is-muted" : ""}">${escapeHtml(value)}</span>`)
    .join("");
}

function getSavedItemGroupLabel(itemType) {
  return {
    build: "Builds",
    combo: "Combos",
    hero: "Heroes",
    minion: "Minions",
    quest: "Quests",
    reward: "Rewards",
    anomaly: "Anomalies",
    spell: "Spells",
    trinket: "Trinkets",
    timewarp: "Timewarp"
  }[itemType] ?? "Saved";
}

function getCommentTargetTypeLabel(itemType) {
  return {
    build: "Build",
    combo: "Combo",
    hero: "Hero",
    minion: "Minion",
    quest: "Quest",
    reward: "Reward",
    anomaly: "Anomaly",
    spell: "Spell",
    trinket: "Trinket",
    timewarp: "Timewarp"
  }[itemType] ?? "Item";
}

function getAccountSnapshot() {
  return accountController?.getState() ?? {
    ready: false,
    loading: false,
    session: null,
    savedItems: [],
    pendingKeys: new Set(),
    error: ""
  };
}

function buildCommentThreadKey(targetType, targetKey) {
  return `${String(targetType || "").trim().toLowerCase()}:${String(targetKey || "").trim().toLowerCase()}`;
}

function normalizeCommentSort(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return COMMENT_SORT_OPTIONS.some((option) => option.value === normalized)
    ? normalized
    : DEFAULT_COMMENT_SORT;
}

function getCommentCountLabel(count = 0) {
  const normalizedCount = Number(count) || 0;
  return `${normalizedCount} comment${normalizedCount === 1 ? "" : "s"}`;
}

function getExpandedCommentLoadLimit(totalComments = 0) {
  return Math.min(Math.max(Number(totalComments) || 0, 20), 40);
}

function getCommentMutationLimit(thread) {
  return Math.max(Number(thread?.loadedLimit) || 0, 20);
}

function normalizeCommentTarget(targetType, targetKey) {
  const normalizedType = String(targetType || "").trim().toLowerCase();
  const normalizedKey = String(targetKey || "").trim().toLowerCase();

  if (!normalizedType || !normalizedKey) {
    return null;
  }

  return {
    targetType: normalizedType,
    targetKey: normalizedKey
  };
}

function isSameCommentTarget(left, right) {
  return Boolean(
    left &&
    right &&
    left.targetType === right.targetType &&
    left.targetKey === right.targetKey
  );
}

function getCommentThreadState(targetType, targetKey) {
  const normalizedTarget = normalizeCommentTarget(targetType, targetKey);
  if (!normalizedTarget) {
    return {
      targetType: "",
      targetKey: "",
      sort: DEFAULT_COMMENT_SORT,
      totalComments: 0,
      loadedLimit: 0,
      comments: [],
      loading: false,
      error: ""
    };
  }

  const threadKey = buildCommentThreadKey(normalizedTarget.targetType, normalizedTarget.targetKey);
  const thread = commentState.threads.get(threadKey);
  return {
    targetType: normalizedTarget.targetType,
    targetKey: normalizedTarget.targetKey,
    sort: normalizeCommentSort(thread?.sort),
    totalComments: thread?.totalComments ?? 0,
    loadedLimit: thread?.loadedLimit ?? 0,
    comments: thread?.comments ?? [],
    loading: commentState.loadingKeys.has(threadKey),
    error: commentState.errors.get(threadKey) ?? ""
  };
}

async function commentsApi(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Comment request failed.");
  }

  return payload;
}

function storeCommentThread(thread) {
  const normalizedTarget = normalizeCommentTarget(thread?.targetType, thread?.targetKey);
  if (!normalizedTarget) {
    return;
  }

  const threadKey = buildCommentThreadKey(normalizedTarget.targetType, normalizedTarget.targetKey);
  commentState.threads.set(threadKey, {
    targetType: normalizedTarget.targetType,
    targetKey: normalizedTarget.targetKey,
    sort: normalizeCommentSort(thread?.sort),
    totalComments: Number(thread.totalComments) || 0,
    loadedLimit: Number(thread.loadedLimit) || (Array.isArray(thread.comments) ? thread.comments.length : 0),
    comments: Array.isArray(thread.comments) ? thread.comments : []
  });
  commentState.errors.delete(threadKey);
}

async function loadCommentThreads(targets, { limit = 12, force = false, sort = DEFAULT_COMMENT_SORT } = {}) {
  const normalizedTargets = targets
    .map((target) => normalizeCommentTarget(target.targetType, target.targetKey))
    .filter(Boolean);
  const normalizedSort = normalizeCommentSort(sort);

  if (!normalizedTargets.length) {
    return;
  }

  const requestTargets = normalizedTargets.filter((target) => {
    const threadKey = buildCommentThreadKey(target.targetType, target.targetKey);
    const existing = commentState.threads.get(threadKey);
    const needsLoad = force
      || !existing
      || normalizeCommentSort(existing.sort) !== normalizedSort
      || (existing.loadedLimit ?? 0) < limit;
    return needsLoad && !commentState.loadingKeys.has(threadKey);
  });

  if (!requestTargets.length) {
    return;
  }

  requestTargets.forEach((target) => {
    const threadKey = buildCommentThreadKey(target.targetType, target.targetKey);
    commentState.loadingKeys.add(threadKey);
    commentState.errors.delete(threadKey);
  });
  render();

  try {
    const params = new URLSearchParams();
    requestTargets.forEach((target) => {
      params.append("target", `${target.targetType}:${target.targetKey}`);
    });
    params.set("limit", String(limit));
    params.set("sort", normalizedSort);

    const payload = await commentsApi(`/api/comments/bootstrap?${params.toString()}`);
    (payload.threads ?? []).forEach((thread) => storeCommentThread(thread));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load comments.";
    requestTargets.forEach((target) => {
      const threadKey = buildCommentThreadKey(target.targetType, target.targetKey);
      commentState.errors.set(threadKey, message);
    });
  } finally {
    requestTargets.forEach((target) => {
      const threadKey = buildCommentThreadKey(target.targetType, target.targetKey);
      commentState.loadingKeys.delete(threadKey);
    });
    render();
  }
}

function getCommentAvatarMarkup(user) {
  const initials = getCompactInitials(user?.displayName || user?.username || "AT");

  if (user?.avatarUrl) {
    return `
      <span class="comment-avatar">
        <img src="${escapeHtml(user.avatarUrl)}" alt="${escapeHtml(user.displayName || user.username || "Comment author")}" loading="lazy">
      </span>
    `;
  }

  return `
    <span class="comment-avatar is-fallback">
      <span>${escapeHtml(initials || "AT")}</span>
    </span>
  `;
}

function renderCommentEntry(comment, targetType, targetKey) {
  const accountState = getAccountSnapshot();
  const canDelete = Boolean(accountState.session && (accountState.session.isAdmin || accountState.session.id === comment.author.id));
  const deletePending = commentState.pendingDeleteIds.has(comment.id);
  const canPin = Boolean(accountState.session?.isAdmin);
  const pinPending = commentState.pendingPinIds.has(comment.id);
  const disableActions = deletePending || pinPending;

  return `
    <article class="comment-card${comment.isPinned ? " is-pinned" : ""}">
      <div class="comment-header">
        <div class="comment-author">
          ${getCommentAvatarMarkup(comment.author)}
          <div class="comment-meta">
            <div class="comment-meta-line">
              <strong>${escapeHtml(comment.author.displayName || comment.author.username)}</strong>
              ${comment.isPinned ? `<span class="comment-badge">Pinned</span>` : ""}
            </div>
            <span>@${escapeHtml(comment.author.username)}</span>
            <span>${escapeHtml(formatSyncDate(comment.createdAt))}</span>
          </div>
        </div>
        ${canPin || canDelete ? `
          <div class="comment-header-actions">
            ${canPin ? `
              <button
                type="button"
                class="pill-button comment-action"
                data-comment-pin="${comment.id}"
                data-comment-pinned="${comment.isPinned ? "true" : "false"}"
                data-comment-type="${escapeHtml(targetType)}"
                data-comment-key="${escapeHtml(targetKey)}"
                ${disableActions ? "disabled" : ""}
              >
                ${pinPending ? (comment.isPinned ? "Unpinning..." : "Pinning...") : (comment.isPinned ? "Unpin" : "Pin")}
              </button>
            ` : ""}
            ${canDelete ? `
          <button
            type="button"
            class="pill-button comment-action"
            data-comment-delete="${comment.id}"
            data-comment-type="${escapeHtml(targetType)}"
            data-comment-key="${escapeHtml(targetKey)}"
            ${disableActions ? "disabled" : ""}
          >
            ${deletePending ? "Removing…" : "Delete"}
          </button>
            ` : ""}
          </div>
        ` : ""}
      </div>
      <p class="comment-body">${escapeHtml(comment.body)}</p>
    </article>
  `;
}

function renderCommentComposer(targetType, targetKey, { compact = false } = {}) {
  const accountState = getAccountSnapshot();
  const threadKey = buildCommentThreadKey(targetType, targetKey);
  const pending = commentState.pendingSubmitKeys.has(threadKey);

  if (!accountState.session) {
    return `
      <div class="comment-empty">
        <p class="comment-helper">Log in to join the conversation on this item.</p>
        <a class="button-link" href="${buildHash("account")}">Log In To Comment</a>
      </div>
    `;
  }

  return `
    <form
      class="comment-form${compact ? " is-compact" : ""}"
      data-comment-form="true"
      data-comment-type="${escapeHtml(targetType)}"
      data-comment-key="${escapeHtml(targetKey)}"
    >
      <label class="comment-field">
        <span class="detail-label">Add Comment</span>
        <textarea
          name="body"
          rows="${compact ? "3" : "4"}"
          maxlength="1200"
          placeholder="Share a note, question, matchup read, or correction."
          ${pending ? "disabled" : ""}
        ></textarea>
      </label>
      <div class="comment-form-actions">
        <button class="button-link is-primary" type="submit" ${pending ? "disabled" : ""}>
          ${pending ? "Posting…" : "Post Comment"}
        </button>
      </div>
    </form>
  `;
}

function renderCommentSortControls(targetType, targetKey) {
  const thread = getCommentThreadState(targetType, targetKey);
  if (thread.totalComments < 2) {
    return "";
  }

  return `
    <div class="comment-sort-row">
      <span class="detail-label">Sort</span>
      <div class="comment-sort-buttons" role="group" aria-label="Sort comments">
        ${COMMENT_SORT_OPTIONS.map((option) => `
          <button
            type="button"
            class="pill-button comment-sort-button${thread.sort === option.value ? " is-active" : ""}"
            data-comment-sort="${option.value}"
            data-comment-type="${escapeHtml(targetType)}"
            data-comment-key="${escapeHtml(targetKey)}"
          >
            ${option.label}
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderCommentThreadBody({
  targetType,
  targetKey,
  compact = false,
  emptyMessage = "No one has commented on this item yet."
}) {
  const normalizedTarget = normalizeCommentTarget(targetType, targetKey);
  if (!normalizedTarget) {
    return "";
  }

  const thread = getCommentThreadState(normalizedTarget.targetType, normalizedTarget.targetKey);
  const hasComments = thread.comments.length > 0;

  return `
    <div class="comment-thread-body-shell${compact ? " is-compact" : ""}">
      ${thread.loading && !hasComments ? `<p class="comment-helper">Loading comments…</p>` : ""}
      ${thread.error ? `<p class="comment-error">${escapeHtml(thread.error)}</p>` : ""}
      ${renderCommentSortControls(normalizedTarget.targetType, normalizedTarget.targetKey)}
      ${hasComments ? `
        <div class="comment-list">
          ${thread.comments.map((comment) => renderCommentEntry(comment, normalizedTarget.targetType, normalizedTarget.targetKey)).join("")}
        </div>
      ` : (!thread.loading ? `
        <div class="comment-empty">
          <p class="comment-helper">${escapeHtml(emptyMessage)}</p>
        </div>
      ` : "")}
      ${hasComments && thread.totalComments > thread.comments.length ? `
        <p class="comment-helper">Showing ${thread.comments.length} of ${thread.totalComments} comments.</p>
      ` : ""}
      ${renderCommentComposer(normalizedTarget.targetType, normalizedTarget.targetKey, { compact })}
    </div>
  `;
}

function renderCommentSection({
  targetType,
  targetKey,
  title = "Comments",
  helper = "",
  compact = false,
  collapsible = false
}) {
  const normalizedTarget = normalizeCommentTarget(targetType, targetKey);
  if (!normalizedTarget) {
    return "";
  }

  const threadKey = buildCommentThreadKey(normalizedTarget.targetType, normalizedTarget.targetKey);
  const thread = getCommentThreadState(normalizedTarget.targetType, normalizedTarget.targetKey);
  const expanded = !collapsible || commentState.expandedKeys.has(threadKey);
  const countLabel = getCommentCountLabel(thread.totalComments);

  return `
    <div class="item-comments${compact ? " is-compact" : ""}">
      <div class="comment-thread-head">
        <div class="comment-thread-copy">
          <span class="detail-label">${escapeHtml(title)}</span>
          <p class="comment-helper">
            ${helper
              ? escapeHtml(helper)
              : thread.totalComments
                ? escapeHtml(countLabel)
                : "No comments yet."}
          </p>
        </div>
        ${collapsible ? `
          <button
            type="button"
            class="pill-button comment-toggle"
            data-comment-toggle="true"
            data-comment-type="${escapeHtml(normalizedTarget.targetType)}"
            data-comment-key="${escapeHtml(normalizedTarget.targetKey)}"
            aria-expanded="${expanded ? "true" : "false"}"
          >
            ${expanded ? "Hide Comments" : thread.totalComments ? `Comments (${thread.totalComments})` : "Comments"}
          </button>
        ` : ""}
      </div>
      ${expanded ? `
        <div class="comment-thread-body">
          ${renderCommentThreadBody({
            targetType: normalizedTarget.targetType,
            targetKey: normalizedTarget.targetKey,
            compact
          })}
        </div>
      ` : ""}
    </div>
  `;
}

function renderCommentLauncher({
  targetType,
  targetKey,
  title,
  contextLabel = "",
  detailHref = "",
  className = ""
}) {
  const normalizedTarget = normalizeCommentTarget(targetType, targetKey);
  if (!normalizedTarget) {
    return "";
  }

  const thread = getCommentThreadState(normalizedTarget.targetType, normalizedTarget.targetKey);
  const isOpen = isSameCommentTarget(commentState.drawer, normalizedTarget);
  const classes = ["pill-button", "comment-launcher", className, isOpen ? "is-active" : ""].filter(Boolean).join(" ");

  return `
    <button
      type="button"
      class="${classes}"
      data-comment-open="true"
      data-comment-type="${escapeHtml(normalizedTarget.targetType)}"
      data-comment-key="${escapeHtml(normalizedTarget.targetKey)}"
      data-comment-title="${escapeHtml(title || "")}"
      data-comment-label="${escapeHtml(contextLabel || `${getCommentTargetTypeLabel(normalizedTarget.targetType)} Comments`)}"
      data-comment-detail="${escapeHtml(detailHref)}"
      aria-haspopup="dialog"
      aria-expanded="${isOpen ? "true" : "false"}"
    >
      Comment (${thread.totalComments})
    </button>
  `;
}

function openCommentDrawer({ targetType, targetKey, title = "", contextLabel = "", detailHref = "" }) {
  const target = normalizeCommentTarget(targetType, targetKey);
  if (!target) {
    return;
  }

  commentState.drawer = {
    targetType: target.targetType,
    targetKey: target.targetKey,
    title: String(title || "").trim(),
    contextLabel: String(contextLabel || "").trim(),
    detailHref: String(detailHref || "").trim()
  };

  const thread = getCommentThreadState(target.targetType, target.targetKey);
  const limit = getExpandedCommentLoadLimit(thread.totalComments);
  render();

  void loadCommentThreads([target], {
    limit,
    force: thread.loadedLimit < limit,
    sort: thread.sort
  });

  requestAnimationFrame(() => {
    const textarea = document.querySelector(".comment-drawer textarea");
    if (textarea instanceof HTMLElement) {
      textarea.focus();
      return;
    }

    const closeButton = document.querySelector("[data-comment-close]");
    if (closeButton instanceof HTMLElement) {
      closeButton.focus();
    }
  });
}

function closeCommentDrawer() {
  if (!commentState.drawer) {
    return;
  }

  commentState.drawer = null;
  render();
}

function renderCommentDrawer() {
  if (!refs.commentDrawer) {
    return;
  }

  const drawer = commentState.drawer;
  document.body.classList.toggle("has-comment-drawer", Boolean(drawer));

  if (!drawer) {
    refs.commentDrawer.innerHTML = "";
    return;
  }

  const thread = getCommentThreadState(drawer.targetType, drawer.targetKey);
  const title = drawer.title || "Conversation";
  const label = drawer.contextLabel || `${getCommentTargetTypeLabel(drawer.targetType)} Comments`;
  const helper = thread.totalComments
    ? getCommentCountLabel(thread.totalComments)
    : (thread.loading ? "Loading comments…" : "No comments yet.");

  refs.commentDrawer.innerHTML = `
    <div class="comment-drawer" data-comment-drawer="true">
      <button
        type="button"
        class="comment-drawer-backdrop"
        data-comment-close="true"
        aria-label="Close comments for ${escapeHtml(title)}"
      ></button>
      <section
        class="comment-drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="comment-drawer-title"
      >
        <header class="comment-drawer-head">
          <div class="comment-drawer-copy">
            <span class="detail-label">${escapeHtml(label)}</span>
            <h3 id="comment-drawer-title">${escapeHtml(title)}</h3>
            <p class="comment-helper">${escapeHtml(helper)}</p>
          </div>
          <div class="comment-drawer-actions">
            ${drawer.detailHref ? `<a class="pill-button" href="${escapeHtml(drawer.detailHref)}">Open Details</a>` : ""}
            <button type="button" class="pill-button" data-comment-close="true">Close</button>
          </div>
        </header>
        <div class="comment-drawer-body">
          ${renderCommentThreadBody({
            targetType: drawer.targetType,
            targetKey: drawer.targetKey,
            compact: true,
            emptyMessage: "Be the first to leave a note on this item."
          })}
        </div>
      </section>
    </div>
  `;
}

function renderSaveControl({
  itemType,
  itemKey,
  className = "",
  savedText = "Saved To Library",
  unsavedText = "Save To Library",
  pendingText = "Saving…"
}) {
  if (!accountController) {
    return "";
  }

  const accountState = getAccountSnapshot();
  const normalizedType = String(itemType);
  const normalizedKey = String(itemKey);
  const classes = ["pill-button", "save-control", className].filter(Boolean).join(" ");

  if (!accountState.ready && accountState.loading) {
    return `<span class="${classes} is-disabled">${escapeHtml(pendingText)}</span>`;
  }

  if (!accountState.session) {
    return `<a class="${classes}" href="${buildHash("account")}">Log In To Save</a>`;
  }

  const pending = accountController.isPending(normalizedType, normalizedKey);
  const saved = accountController.isSaved(normalizedType, normalizedKey);
  return `
    <button
      type="button"
      class="${classes}${saved ? " is-active" : ""}"
      data-save-item="true"
      data-save-type="${escapeHtml(normalizedType)}"
      data-save-key="${escapeHtml(normalizedKey)}"
      ${pending ? "disabled" : ""}
    >
      ${escapeHtml(pending ? pendingText : saved ? savedText : unsavedText)}
    </button>
  `;
}

function resolveSavedItem(itemType, itemKey) {
  const normalizedType = String(itemType || "").toLowerCase();
  const normalizedKey = String(itemKey || "").toLowerCase();

  if (normalizedType === "build") {
    const build = buildsByRank.get(Number(normalizedKey));
    if (!build) {
      return null;
    }

    return {
      itemType: normalizedType,
      itemKey: normalizedKey,
      groupLabel: getSavedItemGroupLabel(normalizedType),
      title: build.buildName,
      subtitle: `${build.rating} Tier • ${build.tribe} • Avg ${build.averagePlacement.toFixed(2)}`,
      summary: truncateText(build.howToPlay, 128),
      href: buildHash("builds", build.rank),
      imageUrl: build.leadCard ? getCardImage(build.leadCard) : ""
    };
  }

  if (normalizedType === "combo") {
    const combo = combosByKey.get(normalizedKey);
    if (!combo) {
      return null;
    }

    return {
      itemType: normalizedType,
      itemKey: normalizedKey,
      groupLabel: getSavedItemGroupLabel(normalizedType),
      title: combo.title,
      subtitle: `${combo.reliabilityLabel} • ${combo.payoff}`,
      summary: truncateText(combo.summary, 128),
      href: buildHash("combos"),
      imageUrl: combo.cardsResolved.find((entry) => entry.card)?.card ? getCardImage(combo.cardsResolved.find((entry) => entry.card).card) : ""
    };
  }

  const card = cardsById.get(Number(normalizedKey));
  if (!card || card.category !== normalizedType) {
    return null;
  }

  return {
    itemType: normalizedType,
    itemKey: normalizedKey,
    groupLabel: getSavedItemGroupLabel(normalizedType),
    title: card.name,
    subtitle: getCardSummaryPills(card).slice(0, 3).join(" • "),
    summary: truncateText(card.plainText || CATEGORY_NOTES[card.category] || "", 128),
    href: buildHash(getPageForCategory(card.category), card.id),
    imageUrl: getCardImage(card)
  };
}

function truncateText(value, length = 120) {
  if (!value) {
    return "";
  }
  if (value.length <= length) {
    return value;
  }
  return `${value.slice(0, length - 1).trim()}…`;
}

function formatRulesHtml(text) {
  if (!text) {
    return "<p class=\"hero-power-note\">The official catalog entry only exposes the image for this card.</p>";
  }
  return text.replace(/\n/g, "<br>");
}

function getLinkedCard(id) {
  return id ? linkedCardsById.get(id) ?? cardsById.get(id) ?? null : null;
}

function getCardsSorter(sortKey) {
  switch (sortKey) {
    case "name_desc":
      return (left, right) => right.name.localeCompare(left.name) || left.id - right.id;
    case "tier_asc":
      return (left, right) => (left.tier ?? 99) - (right.tier ?? 99) || left.name.localeCompare(right.name);
    case "tier_desc":
      return (left, right) => (right.tier ?? -1) - (left.tier ?? -1) || left.name.localeCompare(right.name);
    case "attack_desc":
      return (left, right) => (right.attack ?? -1) - (left.attack ?? -1) || left.name.localeCompare(right.name);
    case "health_desc":
      return (left, right) => (right.health ?? -1) - (left.health ?? -1) || left.name.localeCompare(right.name);
    case "name_asc":
    default:
      return (left, right) => left.name.localeCompare(right.name) || left.id - right.id;
  }
}

function getHeroSorter(sortKey) {
  switch (sortKey) {
    case "armor_desc":
      return (left, right) => (right.armor ?? -1) - (left.armor ?? -1) || left.name.localeCompare(right.name);
    case "armor_asc":
      return (left, right) => (left.armor ?? 999) - (right.armor ?? 999) || left.name.localeCompare(right.name);
    case "name_desc":
      return (left, right) => right.name.localeCompare(left.name) || left.id - right.id;
    case "name_asc":
    default:
      return (left, right) => left.name.localeCompare(right.name) || left.id - right.id;
  }
}

function getVisibleCards(category) {
  const libraryState = getLibraryState(category);

  return cards
    .filter((card) => card.category === category)
    .filter((card) => !libraryState.search || card.searchText.includes(libraryState.search))
    .filter((card) => !categorySupportsMinionType(category) || libraryState.minionType === "all" || card.minionTypeSlug === libraryState.minionType)
    .filter((card) => !categorySupportsTier(category) || libraryState.tier === "all" || String(card.tier) === libraryState.tier)
    .filter((card) => {
      switch (libraryState.mode) {
        case "shared":
          return !card.duosOnly && !card.solosOnly;
        case "duos":
          return card.duosOnly;
        case "solos":
          return card.solosOnly;
        default:
          return true;
      }
    })
    .sort(category === "hero" ? getHeroSorter(libraryState.sort) : getCardsSorter(libraryState.sort));
}

function getCategoryViewContext(category) {
  const pageConfig = PAGE_BY_CATEGORY.get(category);
  if (!pageConfig || category === "hero") {
    return null;
  }

  const libraryState = getLibraryState(category);
  const results = getVisibleCards(category);
  const { page } = clampPage(results.length, cardsPageSize, libraryState.page);
  const startIndex = (page - 1) * cardsPageSize;
  const pageCards = results.slice(startIndex, startIndex + cardsPageSize);
  const routeCard = state.route.id && cardsById.has(state.route.id)
    ? cardsById.get(state.route.id)
    : null;
  const selectedCard = routeCard?.category === category
    ? routeCard
    : results[0] ?? null;
  const hiddenByFilter = Boolean(selectedCard && !results.some((card) => card.id === selectedCard.id));

  return {
    pageConfig,
    libraryState,
    results,
    page,
    startIndex,
    pageCards,
    selectedCard,
    hiddenByFilter,
    hasMinionTypeFilter: categorySupportsMinionType(category),
    hasTierFilter: categorySupportsTier(category),
    emptyLabel: pageConfig.label.toLowerCase()
  };
}

function getHeroesViewContext() {
  const pageConfig = getCategoryPage("heroes");
  const libraryState = getLibraryState("hero");
  const results = getVisibleCards("hero");
  const { page } = clampPage(results.length, heroesPageSize, libraryState.page);
  const startIndex = (page - 1) * heroesPageSize;
  const pageHeroes = results.slice(startIndex, startIndex + heroesPageSize);
  const routeHero = state.route.id && cardsById.has(state.route.id)
    ? cardsById.get(state.route.id)
    : null;
  const selectedHero = routeHero?.category === "hero"
    ? routeHero
    : results[0] ?? null;
  const hiddenByFilter = Boolean(selectedHero && !results.some((hero) => hero.id === selectedHero.id));

  return {
    pageConfig,
    libraryState,
    results,
    page,
    startIndex,
    pageHeroes,
    selectedHero,
    hiddenByFilter
  };
}

function clampPage(totalItems, pageSize, currentPage) {
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(currentPage, 1), pageCount);
  return { pageCount, page };
}

function renderPagination(kind, totalItems, pageSize, currentPage) {
  const { pageCount, page } = clampPage(totalItems, pageSize, currentPage);
  if (pageCount <= 1) {
    return "";
  }

  const visiblePages = [];
  for (let index = Math.max(1, page - 2); index <= Math.min(pageCount, page + 2); index += 1) {
    visiblePages.push(index);
  }

  return `
    <div class="pagination">
      <button type="button" data-${kind}-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>Prev</button>
      ${visiblePages.map((value) => `
        <button
          type="button"
          class="${value === page ? "is-active" : ""}"
          data-${kind}-page="${value}"
        >
          ${value}
        </button>
      `).join("")}
      <button type="button" data-${kind}-page="${page + 1}" ${page >= pageCount ? "disabled" : ""}>Next</button>
    </div>
  `;
}

function getCompactInitials(value, limit = 2) {
  return String(value)
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, limit);
}

const BUILD_LOGO_ART_PRESETS = {
  "APM Pirates": { cardName: "Fleet Admiral Tethys", position: "50% 17%", scale: 3.02 },
  "Stuntdrake Dragons": { cardName: "Stuntdrake", position: "50% 19%", scale: 3.08 },
  "Attack Undead": { cardName: "Forsaken Weaver", position: "49% 17%", scale: 3.12 },
  "Refresh Elementals": { cardName: "Acid Rainfall", position: "50% 19%", scale: 3.02 },
  "Boost Shop Quilboar": { cardName: "Felboar", position: "54% 19%", scale: 3.08 },
  "End of Turn Murlocs": { cardName: "Magicfin Mycologist", position: "49% 18%", scale: 3.04 },
  "End of Turn Nagas": { cardName: "Fauna Whisperer", position: "48% 18%", scale: 3.02 },
  "Beasts Beetles": { cardName: "Rylak Metalhead", position: "50% 17%", scale: 3.02 },
  "Bomber Mechs": { cardName: "Photobomber", position: "48% 18%", scale: 3.04 },
  "Lord of Ruins Demons": { cardName: "Lord of the Ruins", position: "54% 18%", scale: 3.08 }
};

function getBuildLogoImage(card, fallback = "") {
  return card?.image || card?.cropImage || fallback;
}

function getBuildLogoCard(build) {
  return build.leadCard
    ?? build.bestInSlotResolved.find((entry) => entry.card)?.card
    ?? build.coreResolved.find((entry) => entry.card)?.card
    ?? null;
}

function getBuildLogoArtSpec(build) {
  const preset = build.logoArt ?? BUILD_LOGO_ART_PRESETS[build.buildName] ?? null;
  const presetCard = preset?.cardName ? findCardByName(preset.cardName) : null;
  return {
    card: presetCard ?? getBuildLogoCard(build),
    position: preset?.position ?? "50% 18%",
    scale: preset?.scale ?? 3.04
  };
}

function renderBuildLogoMark(build) {
  const logoSpec = getBuildLogoArtSpec(build);
  const logoCard = logoSpec.card;

  if (!logoCard) {
    return `
      <span class="build-row-logo-mark is-fallback">
        <span>${escapeHtml(getCompactInitials(build.buildName, 3))}</span>
      </span>
    `;
  }

  return `
    <span
      class="build-row-logo-mark"
      style="--build-logo-position: ${escapeHtml(logoSpec.position)}; --build-logo-scale: ${escapeHtml(String(logoSpec.scale))};"
    >
      <img src="${escapeHtml(getBuildLogoImage(logoCard))}" alt="" loading="lazy">
    </span>
  `;
}

function renderBuildBestInSlotThumb(entry) {
  const label = escapeHtml(entry.name);

  if (!entry.card) {
    return `
      <span class="build-card-thumb is-fallback" title="${label}">
        <span>${escapeHtml(getCompactInitials(entry.name))}</span>
      </span>
    `;
  }

  return `
    <span class="build-card-thumb" title="${label}">
      <img src="${escapeHtml(getCardImage(entry.card))}" alt="" loading="lazy">
    </span>
  `;
}

function renderBuildTile(build) {
  const tierClass = `build-list-item--${String(build.rating).toLowerCase()}`;
  const detailHref = buildHash("builds", build.rank);

  return `
    <article
      class="build-list-item ${escapeHtml(tierClass)}"
      data-build-link="${detailHref}"
      aria-label="Open ${escapeHtml(build.buildName)} guide"
      role="row"
      tabindex="0"
    >
      <span class="build-row-logo" aria-hidden="true" role="cell">
        ${renderBuildLogoMark(build)}
      </span>
      <span class="build-row-build" role="cell">
        <strong>${escapeHtml(build.buildName)}</strong>
        <span>#${build.rank} overall • ${escapeHtml(build.tribe)} build</span>
      </span>
      <span class="build-row-cards" aria-label="Best in slot cards" role="cell">
        ${build.bestInSlotResolved.map((entry) => renderBuildBestInSlotThumb(entry)).join("")}
      </span>
      <span class="build-row-stat build-row-stat-tier" role="cell">
        <span class="detail-label">Tier</span>
        <strong>${escapeHtml(build.rating)} Tier</strong>
      </span>
      <span class="build-row-stat build-row-stat-difficulty" role="cell">
        <span class="detail-label">Difficulty</span>
        <strong>${escapeHtml(build.difficulty)}</strong>
      </span>
      <span class="build-row-stat build-row-stat-average" role="cell">
        <span class="detail-label">Avg Place</span>
        <strong>${build.averagePlacement.toFixed(2)}</strong>
      </span>
      <span class="build-row-stat build-row-stat-sample" role="cell">
        <span class="detail-label">Sample</span>
        <strong>${build.games.toLocaleString("en-US")}</strong>
      </span>
      <div class="build-row-actions" role="cell">
        ${renderCommentLauncher({
          targetType: "build",
          targetKey: String(build.rank),
          title: build.buildName,
          contextLabel: "Build Comments",
          detailHref,
          className: "build-comment-button"
        })}
      </div>
    </article>
  `;
}

function renderComboPiece(entry) {
  const card = entry.card;

  if (!card) {
    return `
      <article class="combo-piece is-missing">
        <div class="combo-piece-media">
          <span>${escapeHtml(getCompactInitials(entry.name, 2))}</span>
        </div>
        <div class="combo-piece-copy">
          <strong>${escapeHtml(entry.name)}</strong>
          <span>Art not found in the live catalog</span>
        </div>
      </article>
    `;
  }

  const targetPage = getPageForCategory(card.category);

  return `
    <a class="combo-piece" href="${buildHash(targetPage, card.id)}">
      <div class="combo-piece-media">
        <img src="${escapeHtml(getCardImage(card))}" alt="${escapeHtml(card.name)}" loading="lazy">
      </div>
      <div class="combo-piece-copy">
        <strong>${escapeHtml(card.name)}</strong>
        <span>${escapeHtml(`${getCategoryLabel(card.category)}${card.tier ? ` • Tier ${card.tier}` : ""}`)}</span>
      </div>
    </a>
  `;
}

function renderComboBuildLinks(combo) {
  if (!combo.sourceBuildRefs.length) {
    return "";
  }

  return `
    <div class="combo-build-links">
      ${combo.sourceBuildRefs.map((build) => `
        <a class="pill-button" href="${buildHash("builds", build.rank)}">#${build.rank} ${escapeHtml(build.buildName)}</a>
      `).join("")}
    </div>
  `;
}

function renderReferenceSection({
  eyebrow,
  title,
  summary,
  basisLabel = "Selection Basis",
  basisText = "",
  methodology = [],
  sources = []
}) {
  const normalizedEyebrow = String(eyebrow || "").trim().toLowerCase();
  const normalizedTitle = String(title || "").trim().toLowerCase();
  const hasMethodology = Array.isArray(methodology) && methodology.length > 0;
  const hasSources = Array.isArray(sources) && sources.length > 0;

  if (normalizedEyebrow === "board notes" || normalizedTitle === "why these builds are on the board") {
    return "";
  }

  if (!basisText && !hasMethodology && !hasSources) {
    return "";
  }

  return `
    <section class="page-card build-guide-section">
      <div class="section-head build-guide-subhead">
        <div>
          <p class="eyebrow">${escapeHtml(eyebrow)}</p>
          <h2 class="section-title">${escapeHtml(title)}</h2>
          <p class="filter-helper">${escapeHtml(summary)}</p>
        </div>
      </div>
      <div class="build-source-layout">
        <article class="build-source-block">
          <span class="detail-label">${escapeHtml(basisLabel)}</span>
          <div class="build-source-list">
            ${basisText ? `<p>${escapeHtml(basisText)}</p>` : ""}
            ${hasMethodology ? methodology.map((entry) => `<p>${escapeHtml(entry)}</p>`).join("") : ""}
          </div>
        </article>
        <article class="build-source-block">
          <span class="detail-label">Sources</span>
          <div class="build-source-list">
            ${hasSources
              ? sources.map((source) => `<p>${escapeHtml(source.label)}</p>`).join("")
              : "<p>No source links captured for this section yet.</p>"}
          </div>
          ${hasSources ? `
            <div class="build-source-links">
              ${sources.map((source) => `
                <a class="pill-button" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)}</a>
              `).join("")}
            </div>
          ` : ""}
        </article>
      </div>
    </section>
  `;
}

function renderComboRow(combo) {
  const bucketClass = `combo-list-item--${combo.bucket}`;

  return `
    <article class="combo-list-item ${escapeHtml(bucketClass)}" role="row">
      <div class="combo-row-main" role="cell">
        <span class="detail-label combo-cell-label">Combo</span>
        <div class="pill-row combo-row-pills">
          ${renderPillRow([
            combo.reliabilityLabel,
            combo.payoff,
            ...(combo.tags ?? []).slice(0, 2)
          ], true)}
        </div>
        <div class="combo-row-heading">
          <h3>${escapeHtml(combo.title)}</h3>
          ${renderSaveControl({
            itemType: "combo",
            itemKey: combo.key,
            className: "combo-save-button",
            savedText: "Saved",
            unsavedText: "Save Combo",
            pendingText: "Saving…"
          })}
        </div>
        <p class="combo-summary">${escapeHtml(combo.summary)}</p>
        ${combo.sourceBuildRefs.length ? `
          <div class="combo-row-builds">
            <span class="detail-label">Seen In Guides</span>
            ${renderComboBuildLinks(combo)}
          </div>
        ` : ""}
      </div>

      <div class="combo-row-cards" aria-label="Combo cards" role="cell">
        <span class="detail-label combo-cell-label">Cards</span>
        <div class="combo-piece-grid">
          ${combo.cardsResolved.map((entry) => renderComboPiece(entry)).join("")}
        </div>
      </div>

      <div class="combo-row-note" role="cell">
        <span class="detail-label combo-cell-label">Why It Works</span>
        <p>${escapeHtml(combo.whyItWorks)}</p>
      </div>

      <div class="combo-row-note" role="cell">
        <span class="detail-label combo-cell-label">When To Take It</span>
        <p>${escapeHtml(combo.assemble)}</p>
      </div>

      <div class="combo-row-note" role="cell">
        <span class="detail-label combo-cell-label">Cap Board Payoff</span>
        <p>${escapeHtml(combo.finisher)}</p>
      </div>

      <div class="combo-row-comments" role="cell">
        <div class="combo-row-comment-bar">
          <div class="comment-thread-copy">
            <span class="detail-label">Discussion</span>
            <p class="comment-helper">Open the thread to read matchup notes, corrections, and pivot reports.</p>
          </div>
          ${renderCommentLauncher({
            targetType: "combo",
            targetKey: combo.key,
            title: combo.title,
            contextLabel: "Combo Comments",
            className: "combo-comment-button"
          })}
        </div>
      </div>
    </article>
  `;
}

function renderCombosView() {
  refs.combosView.classList.toggle("is-active", state.route.page === "combos");

  if (state.route.page !== "combos") {
    refs.combosView.innerHTML = "";
    return;
  }

  const comboSections = COMBO_BUCKETS.map((bucket) => ({
    ...bucket,
    combos: combos.filter((combo) => combo.bucket === bucket.key)
  })).filter((bucket) => bucket.combos.length > 0);

  refs.combosView.innerHTML = `
    <div class="page-stack">
      <section class="page-hero">
        <div class="page-hero-copy">
          <p class="eyebrow">Combo Atlas</p>
          <h1>${escapeHtml(combosCatalog.title || "Season 12 Power Combos")}</h1>
          <p class="page-hero-lead">
            Atlas isolates the small card packages that actually flip fights and economy turns in Season 12.
            The list starts with the most reliable engines already overlapping the live top-build board, then adds the best Timewarp and trinket spikes once the shell can support them.
          </p>
          <p class="filter-helper">Combo board refreshed ${escapeHtml(formatSyncDate(combosCatalog.asOf || buildsCatalog.asOf || catalog.syncedAt))}.</p>
        </div>
        <div class="hero-logo-panel" aria-hidden="true">
          <div class="hero-logo-frame">
            <img src="./assets/atlas-compass-logo.svg?v=20260325t" alt="">
          </div>
        </div>
      </section>

      <section class="page-card">
        <div class="page-header">
          <p class="eyebrow">How To Read This Page</p>
          <h2>Reliable First, Conditional Second</h2>
          <p>
            These combos are sorted by how often the package appears cleanly in real games.
            Core Engines are the most repeatable lines, Timewarp Hits are the best Chronum-only pivots, and Trinket Spikes are worth taking when your board already supports the trigger pattern.
          </p>
        </div>
        <div class="stat-rail combo-stat-rail">
          <article class="summary-card">
            <span class="summary-label">Core Engines</span>
            <strong>${formatCount(comboCountsByBucket.core ?? 0)}</strong>
            <p>Reliable minion-led loops that already overlap active top builds.</p>
          </article>
          <article class="summary-card">
            <span class="summary-label">Timewarp Hits</span>
            <strong>${formatCount(comboCountsByBucket.timewarp ?? 0)}</strong>
            <p>Chronum packages with real late-game ceiling once offered.</p>
          </article>
          <article class="summary-card">
            <span class="summary-label">Trinket Spikes</span>
            <strong>${formatCount(comboCountsByBucket.trinket ?? 0)}</strong>
            <p>Conditional trinket lines that are worth locking once the shell is live.</p>
          </article>
        </div>
      </section>

      ${comboSections.map((section) => `
        <section class="page-card combo-section">
          <div class="section-head combo-section-head">
            <div>
              <p class="eyebrow">${escapeHtml(section.label)}</p>
              <h2 class="section-title">${escapeHtml(section.label)}</h2>
              <p class="filter-helper">${escapeHtml(section.note)}</p>
            </div>
          </div>
          <div class="combo-table-scroll">
            <div class="combo-table" role="table" aria-label="${escapeHtml(section.label)} combo catalog">
              <div class="combo-table-head" role="rowgroup">
                <div class="combo-table-row combo-table-row-head" role="row">
                  <span class="combo-table-col" role="columnheader">Combo</span>
                  <span class="combo-table-col" role="columnheader">Cards</span>
                  <span class="combo-table-col" role="columnheader">Why It Works</span>
                  <span class="combo-table-col" role="columnheader">When To Take It</span>
                  <span class="combo-table-col" role="columnheader">Cap Board Payoff</span>
                </div>
              </div>
              <div class="combo-table-body" role="rowgroup">
                ${section.combos.map((combo) => renderComboRow(combo)).join("")}
              </div>
            </div>
          </div>
        </section>
      `).join("")}

      ${renderReferenceSection({
        eyebrow: "Atlas Notes",
        title: "How Combo Picks Are Chosen",
        summary: "Atlas favors small packages that overlap live endgame boards, create a real power turn immediately, and still scale once the lobby stops giving free setup.",
        basisLabel: "Selection Basis",
        basisText: "The combo board starts with repeatable engines that already overlap the strongest current build shells, then adds the best Timewarp and trinket pivots once their support pieces are already credible.",
        methodology: combosCatalog.methodology,
        sources: combosCatalog.sources
      })}
    </div>
  `;
}

function renderCommunityView() {
  const isSocialPage = state.route.page === "community" || state.route.page === "account";
  refs.communityView.classList.toggle("is-active", isSocialPage);
  if (!communityController) {
    refs.communityView.innerHTML = isSocialPage
      ? `
        <div class="empty-state">
          <h3>Atlas Social Unavailable</h3>
          <p>The social controller did not load. Reload the page and try again.</p>
        </div>
      `
      : "";
    return;
  }

  communityController.render({
    isActive: isSocialPage,
    route: state.route,
    mount: refs.communityView
  });
}

function getSupportOptionState(option) {
  const url = String(option?.url || "").trim();
  return {
    ...option,
    url,
    isActive: /^https?:\/\//i.test(url)
  };
}

function renderSupportAction(option, buttonText) {
  const resolved = getSupportOptionState(option);
  if (!resolved.isActive) {
    return `
      <div class="support-action-shell">
        <span class="button-link is-disabled">Stripe Link Pending</span>
        <p class="support-link-note">Add a Stripe Payment Link in <code>support-config.js</code> to activate this option.</p>
      </div>
    `;
  }

  return `
    <div class="support-action-shell">
      <a class="button-link is-primary" href="${escapeHtml(resolved.url)}" target="_blank" rel="noreferrer">${escapeHtml(buttonText)}</a>
      <p class="support-link-note">Secure checkout opens in Stripe.</p>
    </div>
  `;
}

function renderSupportOptionCard(option, { recurring = false } = {}) {
  const resolved = getSupportOptionState(option);
  const buttonText = recurring ? `Support ${resolved.amount}` : `Contribute ${resolved.amount}`;

  return `
    <article class="support-option-card">
      <div class="support-option-copy">
        <span class="detail-label">${escapeHtml(resolved.label)}</span>
        <h3>${escapeHtml(resolved.amount)}</h3>
        <p>${escapeHtml(resolved.note || "")}</p>
      </div>
      ${renderSupportAction(resolved, buttonText)}
    </article>
  `;
}

function renderSupportView() {
  refs.supportView.classList.toggle("is-active", state.route.page === "support");

  if (state.route.page !== "support") {
    refs.supportView.innerHTML = "";
    return;
  }

  const oneTimeOptions = (supportConfig.oneTimeOptions ?? []).map((option) => getSupportOptionState(option));
  const monthlyOptions = (supportConfig.monthlyOptions ?? []).map((option) => getSupportOptionState(option));
  const customOption = supportConfig.customOption ? getSupportOptionState(supportConfig.customOption) : null;
  const allOptions = [...oneTimeOptions, ...monthlyOptions, ...(customOption ? [customOption] : [])];
  const hasLiveCheckout = allOptions.some((option) => option.isActive);
  const contactEmail = String(supportConfig.contactEmail || "").trim();

  refs.supportView.innerHTML = `
    <div class="page-stack">
      <section class="page-hero support-hero">
        <div class="page-hero-copy">
          <p class="eyebrow">${escapeHtml(supportConfig.eyebrow || "Support Atlas")}</p>
          <h1>${escapeHtml(supportConfig.title || "Support Atlas")}</h1>
          <p class="page-hero-lead">${escapeHtml(supportConfig.lead || "Optional support helps fund the next round of Atlas development.")}</p>
          <p class="filter-helper">${escapeHtml(supportConfig.helper || "")}</p>
          <div class="hero-actions">
            <a class="button-link" href="${buildHash("community")}">See Community Work</a>
            <a class="button-link" href="${buildHash("builds")}">Back To Builds</a>
          </div>
        </div>
      </section>

      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Contribution Options</p>
            <h2 class="section-title">One-Time Support</h2>
            <p class="filter-helper">Best for people who want to chip in once without signing up for an ongoing plan.</p>
          </div>
        </div>
        <div class="support-option-grid">
          ${oneTimeOptions.map((option) => renderSupportOptionCard(option)).join("")}
          ${customOption ? renderSupportOptionCard(customOption) : ""}
        </div>
      </section>

      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Recurring Support</p>
            <h2 class="section-title">Monthly Backing</h2>
            <p class="filter-helper">Best for people who want to help fund ongoing hosting, maintenance, and feature work.</p>
          </div>
        </div>
        <div class="support-option-grid">
          ${monthlyOptions.map((option) => renderSupportOptionCard(option, { recurring: true })).join("")}
        </div>
      </section>

      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Where It Goes</p>
            <h2 class="section-title">What Support Funds</h2>
            <p class="filter-helper">${escapeHtml(supportConfig.transparencyNote || "Support helps keep Atlas moving.")}</p>
          </div>
        </div>
        <div class="support-use-grid">
          ${(supportConfig.fundingUses ?? []).map((entry) => `
            <article class="support-info-card">
              <h3>${escapeHtml(entry.title)}</h3>
              <p>${escapeHtml(entry.body)}</p>
            </article>
          `).join("")}
        </div>
      </section>

      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Notes</p>
            <h2 class="section-title">Support Expectations</h2>
            <p class="filter-helper">Keep the language clean and transparent so people know what they are actually contributing toward.</p>
          </div>
        </div>
        <div class="support-note-grid">
          ${(supportConfig.notes ?? []).map((entry) => `
            <article class="support-info-card">
              <h3>${escapeHtml(entry.title)}</h3>
              <p>${escapeHtml(entry.body)}</p>
            </article>
          `).join("")}
        </div>
        <div class="support-disclaimer">
          <p>${escapeHtml(supportConfig.helper || "Support is optional.")}</p>
          ${contactEmail ? `<p>Questions about support: <a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a></p>` : ""}
        </div>
      </section>
    </div>
  `;
}

function getHiddenAdRoutes() {
  return new Set((adConfig.hiddenRoutes ?? []).map((value) => String(value || "").trim().toLowerCase()));
}

function isAdRouteHidden() {
  return getHiddenAdRoutes().has(state.route.page);
}

function renderPrivacyView() {
  refs.privacyView.classList.toggle("is-active", state.route.page === "privacy");

  if (state.route.page !== "privacy") {
    refs.privacyView.innerHTML = "";
    return;
  }

  const contactEmail = String(supportConfig.contactEmail || "").trim();

  refs.privacyView.innerHTML = `
    <div class="page-stack">
      <section class="page-hero support-hero legal-hero">
        <div class="page-hero-copy">
          <p class="eyebrow">Privacy</p>
          <h1>Privacy, Ads, And Support</h1>
          <p class="page-hero-lead">Atlas Battlegrounds uses a small set of cookies and third-party providers so the site can run, optional accounts and community tools can work, and monetization can be enabled without turning the product into a paywall.</p>
          <p class="filter-helper">Last updated April 3, 2026. Update this page whenever Atlas changes its providers, account flows, analytics, or ad setup.</p>
          <div class="hero-actions">
            <a class="button-link" href="${buildHash("support")}">Open Support</a>
            <a class="button-link" href="${buildHash("builds")}">Back To Builds</a>
          </div>
        </div>
      </section>

      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">What Atlas Collects</p>
            <h2 class="section-title">Core Site Data</h2>
            <p class="filter-helper">The site currently stores only the information needed to power accounts, community features, moderation, and basic route analytics.</p>
          </div>
        </div>
        <div class="support-use-grid">
          <article class="support-info-card">
            <h3>Accounts</h3>
            <p>If you create an account, Atlas stores the username, email address, profile fields you submit, and a hashed password record so sign-in can work. Session cookies are used to keep you signed in.</p>
          </article>
          <article class="support-info-card">
            <h3>Community Content</h3>
            <p>If you post comments, submissions, profile updates, likes, buddy connections, or direct messages, Atlas stores that content so it can be shown back to you, other users, and moderators.</p>
          </article>
          <article class="support-info-card">
            <h3>Usage Analytics</h3>
            <p>Atlas records route-view and product activity events, along with the request IP address on the server side, so the site owner can understand traffic, moderation activity, and feature usage.</p>
          </article>
        </div>
      </section>

      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Third Parties</p>
            <h2 class="section-title">Ads And Payments</h2>
            <p class="filter-helper">The current codebase is prepared for Google AdSense display ads and Stripe Payment Links, but those providers should only be enabled after their live IDs, policies, and disclosures are in place.</p>
          </div>
        </div>
        <div class="support-note-grid">
          <article class="support-info-card">
            <h3>Advertising</h3>
            <p>When advertising is enabled, Atlas may load Google AdSense to show display ads and measure ad performance. Google may use cookies or similar technologies, subject to your message, disclosure, and consent setup.</p>
          </article>
          <article class="support-info-card">
            <h3>Donations</h3>
            <p>Optional support checkouts open through Stripe Payment Links. Atlas should not collect or store full payment card numbers directly because checkout is handed off to Stripe.</p>
          </article>
          <article class="support-info-card">
            <h3>External Links</h3>
            <p>Links to Blizzard data sources, payment providers, or future sponsors leave Atlas and are governed by those third parties once you open them.</p>
          </article>
        </div>
      </section>

      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Your Choices</p>
            <h2 class="section-title">How To Reach Atlas</h2>
            <p class="filter-helper">Use a contact address before enabling live ads or donations so people have a clear way to ask privacy or billing questions.</p>
          </div>
        </div>
        <div class="support-use-grid">
          <article class="support-info-card">
            <h3>Optional Account Use</h3>
            <ul class="guide-bullet-list legal-bullet-list">
              <li>You can browse the build and card library without creating an account.</li>
              <li>You can avoid optional support checkouts by not using the Support page buttons.</li>
              <li>You can sign out to clear the active Atlas session cookie from the browser.</li>
            </ul>
          </article>
          <article class="support-info-card">
            <h3>Requests And Questions</h3>
            <ul class="guide-bullet-list legal-bullet-list">
              <li>Use the contact address below for account, moderation, privacy, or donation questions.</li>
              <li>Review this page again if Atlas adds a CMP, affiliate links, sponsorships, or new analytics tooling.</li>
              <li>If ads are enabled, keep this page linked in the footer and keep <code>ads.txt</code> live at the site root.</li>
            </ul>
          </article>
        </div>
        <div class="support-disclaimer legal-disclaimer">
          <p>This page is the site-level disclosure for Atlas Battlegrounds as currently implemented. It should be refined after AdSense and Stripe are live, especially if traffic expands outside the United States.</p>
          ${contactEmail
            ? `<p>Privacy contact: <a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a></p>`
            : `<p>Add a real contact email in <code>support-config.js</code> before launching monetization so visitors have a clear contact path.</p>`}
        </div>
      </section>
    </div>
  `;
}

function shouldShowAdRails() {
  const minWidth = Number(adConfig.desktopMinWidth) || 1680;
  return Boolean(
    refs.adRailLeft &&
    refs.adRailRight &&
    adConfig.enabled &&
    window.innerWidth >= minWidth &&
    !isAdRouteHidden()
  );
}

function shouldShowInlineAds() {
  const minWidth = Number(adConfig.desktopMinWidth) || 1680;
  return Boolean(adConfig.enabled && window.innerWidth < minWidth && !isAdRouteHidden());
}

function getAdSlotState(slotConfig) {
  const adClient = String(adConfig.adClient || "").trim();
  const adSlot = String(slotConfig?.adSlot || "").trim();
  const fallback = slotConfig?.fallback ?? null;

  return {
    adClient,
    adSlot,
    fallback,
    isAdsenseReady: Boolean(adClient && adSlot)
  };
}

function renderAdFallbackCard(fallback, { surface = "rail" } = {}) {
  if (!fallback) {
    return "";
  }

  const href = String(fallback.href || "").trim();
  const openTag = href ? "a" : "article";
  const closeTag = href ? "a" : "article";
  const hrefMarkup = href ? ` href="${escapeHtml(href)}"` : "";

  return `
    <${openTag} class="ad-slot-card is-house is-${escapeHtml(surface)}"${hrefMarkup}>
      <span class="detail-label">${escapeHtml(fallback.label || "Atlas")}</span>
      <h3>${escapeHtml(fallback.title || "Atlas House Ad")}</h3>
      <p>${escapeHtml(fallback.body || "Use this rail for sponsors or internal promotion.")}</p>
      ${fallback.cta ? `<span class="button-link">${escapeHtml(fallback.cta)}</span>` : ""}
    </${closeTag}>
  `;
}

function renderAdSurfaceSlot(slotConfig, position, { surface = "rail" } = {}) {
  const slotState = getAdSlotState(slotConfig);

  if (slotState.isAdsenseReady) {
    return `
      <div class="ad-slot-card is-adsense is-${escapeHtml(surface)}">
        <span class="ad-slot-label">Advertisement</span>
        <ins
          class="adsbygoogle atlas-adsense-slot atlas-adsense-slot--${escapeHtml(surface)}"
          data-atlas-slot="${escapeHtml(position)}"
          data-ad-client="${escapeHtml(slotState.adClient)}"
          data-ad-slot="${escapeHtml(slotState.adSlot)}"
          data-ad-format="auto"
          data-full-width-responsive="${surface === "inline" ? "true" : "false"}"
        ></ins>
      </div>
    `;
  }

  return renderAdFallbackCard(slotState.fallback, { surface });
}

function renderAdRailSlot(slotConfig, position) {
  return renderAdSurfaceSlot(slotConfig, position, { surface: "rail" });
}

function ensureAdsenseScriptLoaded(clientId) {
  if (adsenseScriptPromise) {
    return adsenseScriptPromise;
  }

  adsenseScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-atlas-adsense="${escapeHtml(clientId)}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.atlasAdsense = clientId;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("AdSense script failed to load."));
    document.head.appendChild(script);
  }).catch(() => {});

  return adsenseScriptPromise;
}

function hydrateAdsenseSlots() {
  const clientId = String(adConfig.adClient || "").trim();
  if (!clientId) {
    return;
  }

  if (!document.querySelector(".atlas-adsense-slot:not([data-atlas-init])")) {
    return;
  }

  void ensureAdsenseScriptLoaded(clientId).then(() => {
    document.querySelectorAll(".atlas-adsense-slot:not([data-atlas-init])").forEach((slot) => {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        slot.dataset.atlasInit = "true";
      } catch {
        // Ignore transient AdSense initialization errors during local config.
      }
    });
  });
}

function getInlineAdMount() {
  if (state.route.page === "builds") {
    return refs.buildsView;
  }

  if (state.route.page === "combos") {
    return refs.combosView;
  }

  if (state.route.page === "heroes") {
    return refs.heroesView;
  }

  if (getCategoryPage(state.route.page)) {
    return refs.libraryView;
  }

  return null;
}

function clearInlineAdPlacements() {
  document.querySelectorAll(".atlas-inline-ad-placement").forEach((node) => node.remove());
}

function getStackContentSections(stack) {
  return [...stack.children].filter((node) => (
    node.nodeType === Node.ELEMENT_NODE &&
    !node.classList.contains("atlas-inline-ad-placement")
  ));
}

function renderInlineAdPlacement(slotConfig, position) {
  const slotMarkup = renderAdSurfaceSlot(slotConfig, position, { surface: "inline" });
  if (!slotMarkup) {
    return "";
  }

  return `
    <section class="atlas-inline-ad-placement atlas-inline-ad-placement--${escapeHtml(position)}" aria-label="Advertisement">
      ${slotMarkup}
    </section>
  `;
}

function renderInlineAds() {
  clearInlineAdPlacements();

  if (!shouldShowInlineAds()) {
    return;
  }

  const mount = getInlineAdMount();
  const stack = mount?.querySelector(".page-stack");
  if (!stack) {
    return;
  }

  const sections = getStackContentSections(stack);
  if (sections.length === 0) {
    return;
  }

  const topMarkup = renderInlineAdPlacement(adConfig.inlineTopSlot, "inline-top");
  if (topMarkup) {
    sections[0].insertAdjacentHTML("afterend", topMarkup);
  }

  const comboSections = [...stack.querySelectorAll(".combo-section")];
  if (state.route.page === "combos" && comboSections.length > 1) {
    const midMarkup = renderInlineAdPlacement(adConfig.inlineMidSlot, "inline-mid");
    const midTarget = comboSections[Math.max(0, Math.ceil(comboSections.length / 2) - 1)];
    if (midMarkup && midTarget) {
      midTarget.insertAdjacentHTML("afterend", midMarkup);
    }
  }

  const refreshedSections = getStackContentSections(stack);
  if (refreshedSections.length < 3) {
    return;
  }

  const bottomMarkup = renderInlineAdPlacement(adConfig.inlineBottomSlot, "inline-bottom");
  if (bottomMarkup) {
    refreshedSections.at(-1).insertAdjacentHTML("beforebegin", bottomMarkup);
  }
}

function renderAdRails() {
  if (!refs.adRailLeft || !refs.adRailRight) {
    return;
  }

  const showRails = shouldShowAdRails();
  refs.adRailLeft.classList.toggle("is-visible", showRails);
  refs.adRailRight.classList.toggle("is-visible", showRails);

  if (!showRails) {
    refs.adRailLeft.innerHTML = "";
    refs.adRailRight.innerHTML = "";
    return;
  }

  refs.adRailLeft.innerHTML = renderAdRailSlot(adConfig.leftSlot, "left");
  refs.adRailRight.innerHTML = renderAdRailSlot(adConfig.rightSlot, "right");
}

function renderAdPlacements() {
  renderAdRails();
  renderInlineAds();
  hydrateAdsenseSlots();
}

function renderMissingCardPills(values, label = "Unlinked Names") {
  if (values.length === 0) {
    return "";
  }

  return `
    <div class="detail-section">
      <span class="detail-label">${escapeHtml(label)}</span>
      <div class="pill-row">
        ${values.map((value) => `<span class="pill is-muted">${escapeHtml(value)}</span>`).join("")}
      </div>
    </div>
  `;
}

function renderGuideReferenceCard(label, card) {
  if (!card) {
    return "";
  }

  const targetPage = card.category ? getPageForCategory(card.category) : null;
  const summary = truncateText(card.plainText || CATEGORY_NOTES[card.category] || "", 118);
  const openTag = targetPage ? "a" : "article";
  const closeTag = targetPage ? "a" : "article";
  const href = targetPage ? ` href="${buildHash(targetPage, card.id)}"` : "";

  return `
    <${openTag} class="guide-reference-card"${href}>
      <div class="guide-reference-media">
        <img src="${escapeHtml(getCardImage(card))}" alt="${escapeHtml(card.name)}" loading="lazy">
      </div>
      <div class="guide-reference-copy">
        <span class="detail-label">${escapeHtml(label)}</span>
        <h4>${escapeHtml(card.name)}</h4>
        <div class="pill-row">${renderPillRow(getCardSummaryPills(card).slice(0, 3), true)}</div>
        <p>${escapeHtml(summary)}</p>
      </div>
    </${closeTag}>
  `;
}

function getGuideThumbMeta(card) {
  if (card.category === "hero") {
    return "Hero";
  }
  if (card.category === "minion" && card.tier) {
    return `Tier ${card.tier}`;
  }
  return PAGE_BY_CATEGORY.get(card.category)?.label ?? "Card";
}

function renderGuideThumbCard(card) {
  if (!card) {
    return "";
  }

  const targetPage = card.category && card.id != null ? getPageForCategory(card.category) : null;
  const openTag = targetPage ? "a" : "article";
  const closeTag = targetPage ? "a" : "article";
  const href = targetPage ? ` href="${buildHash(targetPage, card.id)}"` : "";

  return `
    <${openTag} class="guide-thumb-card"${href}>
      <div class="guide-thumb-media">
        <img src="${escapeHtml(getCardImage(card))}" alt="${escapeHtml(card.name)}" loading="lazy">
      </div>
      <div class="guide-thumb-copy">
        <strong>${escapeHtml(card.name)}</strong>
        <span>${escapeHtml(getGuideThumbMeta(card))}</span>
      </div>
    </${closeTag}>
  `;
}

function renderGuideCardSection(title, description, entries, cardLabel) {
  const resolved = getResolvedBuildCards(entries);

  if (resolved.length === 0) {
    return `
      <section class="build-guide-card-block">
        <div class="section-head build-guide-subhead">
          <div>
            <h3 class="subsection-title">${escapeHtml(title)}</h3>
            <p class="filter-helper">${escapeHtml(description)}</p>
          </div>
        </div>
        <p class="guide-empty-note">No linked cards from this section are available in the current local catalog snapshot.</p>
      </section>
    `;
  }

  return `
    <section class="build-guide-card-block">
      <div class="section-head build-guide-subhead">
        <div>
          <h3 class="subsection-title">${escapeHtml(title)}</h3>
          <p class="filter-helper">${escapeHtml(description)}</p>
        </div>
      </div>
      <div class="guide-reference-grid">
        ${resolved.map((entry) => renderGuideReferenceCard(cardLabel, entry.card)).join("")}
      </div>
    </section>
  `;
}

function renderGuideMentionListSection(title, description, items, cards = allLookupCards) {
  if (!items?.length) {
    return "";
  }

  return `
    <section class="build-list-card">
      <div class="section-head build-guide-subhead">
        <div>
          <h3 class="subsection-title">${escapeHtml(title)}</h3>
          <p class="filter-helper">${escapeHtml(description)}</p>
        </div>
      </div>
      <div class="guide-annotated-list">
        ${items.map((item) => {
          const mentionedCards = findMentionedCards(item, { cards, limit: 3 });

          return `
            <article class="guide-annotated-item">
              <p>${escapeHtml(item)}</p>
              ${mentionedCards.length ? `
                <div class="guide-thumb-row">
                  ${mentionedCards.map((card) => renderGuideThumbCard(card)).join("")}
                </div>
              ` : ""}
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderGuideListSection(title, description, items) {
  if (!items?.length) {
    return "";
  }

  return `
    <section class="build-list-card">
      <div class="section-head build-guide-subhead">
        <div>
          <h3 class="subsection-title">${escapeHtml(title)}</h3>
          <p class="filter-helper">${escapeHtml(description)}</p>
        </div>
      </div>
      <ul class="guide-bullet-list">
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </section>
  `;
}

function renderGuideThumbnailSection(title, description, items, category = null) {
  if (!items?.length) {
    return "";
  }

  const resolved = resolveNamedCards(items, category);
  const linkedEntries = getResolvedBuildCards(resolved);
  const missingEntries = getMissingBuildCards(resolved);

  return `
    <section class="build-list-card">
      <div class="section-head build-guide-subhead">
        <div>
          <h3 class="subsection-title">${escapeHtml(title)}</h3>
          <p class="filter-helper">${escapeHtml(description)}</p>
        </div>
      </div>
      ${linkedEntries.length ? `
        <div class="guide-thumb-grid">
          ${linkedEntries.map((entry) => renderGuideThumbCard(entry.card)).join("")}
        </div>
      ` : ""}
      ${missingEntries.length ? `
        <div class="guide-thumb-fallback">
          <span class="detail-label">${escapeHtml(category === "hero" ? "Unlinked Heroes" : "Unlinked Names")}</span>
          <div class="pill-row">
            ${missingEntries.map((value) => `<span class="pill is-muted">${escapeHtml(value)}</span>`).join("")}
          </div>
        </div>
      ` : ""}
    </section>
  `;
}

function renderGuideTierPlanSection(entries) {
  if (!entries?.length) {
    return "";
  }

  return `
    <section class="build-tier-plan-section">
      <div class="section-head build-guide-subhead">
        <div>
          <h3 class="subsection-title">Tier-By-Tier Tavern Plan</h3>
          <p class="filter-helper">Tier 3 onward: what to buy, how long to stay, and how aggressively to push for the next spike.</p>
        </div>
      </div>
      <div class="build-tier-grid">
        ${entries.map((entry) => {
          const linkedTargets = getResolvedBuildCards(entry.resolvedTargets);
          const missingTargets = getMissingBuildCards(entry.resolvedTargets);

          return `
            <article class="build-tier-card">
              <div class="section-head build-guide-subhead build-tier-head">
                <div>
                  <span class="detail-label">Tavern Tier ${entry.tier}</span>
                  <h4 class="build-tier-title">Priority ${escapeHtml(entry.importance)}</h4>
                </div>
                <div class="pill-row">
                  ${renderPillRow([
                    `${entry.importance} Priority`,
                    entry.turnWindow === "Finish here" ? entry.turnWindow : `Stay ${entry.turnWindow}`,
                    entry.pace
                  ], true)}
                </div>
              </div>
              <div class="build-tier-summary-grid">
                <article class="build-tier-summary">
                  <span class="detail-label">Board Goal</span>
                  <p>${escapeHtml(entry.goal)}</p>
                </article>
                <article class="build-tier-summary">
                  <span class="detail-label">Leveling Plan</span>
                  <p>${escapeHtml(entry.leveling)}</p>
                </article>
              </div>
              ${linkedTargets.length ? `
                <div class="guide-thumb-grid">
                  ${linkedTargets.map((target) => renderGuideThumbCard(target.card)).join("")}
                </div>
              ` : ""}
              ${missingTargets.length ? renderMissingCardPills(missingTargets, "Unlinked Target Cards") : ""}
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderGuidePillSection(title, description, items) {
  if (!items?.length) {
    return "";
  }

  return `
    <section class="build-list-card">
      <div class="section-head build-guide-subhead">
        <div>
          <h3 class="subsection-title">${escapeHtml(title)}</h3>
          <p class="filter-helper">${escapeHtml(description)}</p>
        </div>
      </div>
      <div class="guide-text-pill-row">
        ${items.map((item) => `<span class="guide-text-pill">${escapeHtml(item)}</span>`).join("")}
      </div>
    </section>
  `;
}

function renderBuildGuideSection(build, { standalone = false } = {}) {
  if (!build) {
    return `
      <section class="page-card build-guide-section">
        <div class="empty-state">
          <h3>Select A Build</h3>
          <p>Choose any build from the builds catalog to load the full guide with best-in-slot cards, signals, pivots, and phase-by-phase notes.</p>
        </div>
      </section>
    `;
  }

  const guideMissingCards = [
    ...new Set([
      ...getMissingBuildCards(build.bestInSlotResolved),
      ...getMissingBuildCards(build.signalResolved),
      ...getMissingBuildCards(build.pivotResolved)
    ])
  ];

  return `
    <section class="page-card build-guide-section">
      <div class="section-head build-guide-head">
        <div>
          <p class="eyebrow">${standalone ? "Build Guide" : "Selected Build Guide"}</p>
          <h2 class="section-title">${escapeHtml(build.buildName)}</h2>
          <p class="filter-helper">
            ${standalone
              ? "This dedicated guide turns the comp summary into a complete plan with priority pieces, commit signals, pivots, and phase-by-phase advice."
              : "The guide below always follows the highlighted build in the selector above. It turns the short summary into a complete plan with priority pieces, commit signals, pivots, and phase-by-phase advice."}
          </p>
        </div>
      </div>
      <div class="build-guide-overview">
        ${build.leadCard ? `
          <div class="build-guide-media">
            <img src="${escapeHtml(getCardImage(build.leadCard))}" alt="${escapeHtml(build.buildName)}">
          </div>
        ` : ""}
        <div class="build-guide-copy">
          <div class="detail-header build-guide-title">
            <span class="detail-label">${escapeHtml(buildsCatalog.season)}</span>
            <h3>${escapeHtml(build.buildName)}</h3>
            <div class="detail-pill-row">${renderPillRow([
              build.tribe,
              `${build.rating} Tier`,
              build.difficulty,
              `${build.games.toLocaleString("en-US")} games`,
              `Avg ${build.averagePlacement.toFixed(2)}`
            ])}</div>
          </div>
          <div class="build-guide-note-grid">
            <article class="build-note-card">
              <span class="detail-label">Core Loop</span>
              <p>${escapeHtml(build.howToPlay)}</p>
            </article>
            <article class="build-note-card">
              <span class="detail-label">Commit Point</span>
              <p>${escapeHtml(build.whenToCommit)}</p>
            </article>
          </div>
          <div class="build-package-grid">
            <div class="detail-section">
              <span class="detail-label">Core Engine</span>
              <div class="pill-row">
                ${build.coreCards.map((name) => `<span class="pill">${escapeHtml(name)}</span>`).join("")}
              </div>
            </div>
            <div class="detail-section">
              <span class="detail-label">Support Package</span>
              <div class="pill-row">
                ${build.addonCards.map((name) => `<span class="pill is-muted">${escapeHtml(name)}</span>`).join("")}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="build-insight-grid">
        <article class="build-insight-card">
          <span class="detail-label">Commit Signals</span>
          <p>${escapeHtml(build.signalsSummary)}</p>
        </article>
        <article class="build-insight-card">
          <span class="detail-label">Pivot Plan</span>
          <p>${escapeHtml(build.pivotPlan)}</p>
        </article>
        <article class="build-insight-card">
          <span class="detail-label">Positioning</span>
          <p>${escapeHtml(build.positioning)}</p>
        </article>
      </div>
      ${build.metaRead ? `
        <article class="detail-section build-meta-card">
          <span class="detail-label">Current Meta Read</span>
          <p>${escapeHtml(build.metaRead)}</p>
        </article>
      ` : ""}
      <div class="build-phase-grid">
        <article class="build-phase-card">
          <span class="detail-label">Early Game</span>
          <p>${escapeHtml(build.earlyGame)}</p>
        </article>
        <article class="build-phase-card">
          <span class="detail-label">Mid Game</span>
          <p>${escapeHtml(build.midGame)}</p>
        </article>
        <article class="build-phase-card">
          <span class="detail-label">Late Game</span>
          <p>${escapeHtml(build.lateGame)}</p>
        </article>
      </div>
      ${renderGuideTierPlanSection(build.tierPlan)}
      <div class="build-deep-dive-grid">
        ${renderGuideMentionListSection(
          "Timewarped Tavern Priorities",
          "Season 12-specific Chronum decisions that raise this build's cap or keep it alive long enough to matter.",
          build.timewarpPriorities,
          build.guideMentionCards
        )}
        ${renderGuideMentionListSection(
          "Openers And Stabilizers",
          "Early tavern patterns and pickups that keep the comp live without hard-forcing it too early.",
          build.openers,
          build.guideMentionCards
        )}
        ${renderGuideListSection(
          "Commit Checklist",
          "The practical conditions you want before turning a flexible board into a locked-in comp.",
          build.commitChecklist
        )}
        ${renderGuideListSection(
          "Cap Board",
          "What the highest-value endgame shell usually looks like once the build is fully online.",
          build.capBoard
        )}
        ${renderGuideThumbnailSection(
          "Hero Fit",
          "Heroes that naturally support the comp's economy, tempo pattern, or payoff timing.",
          build.heroFit,
          "hero"
        )}
        ${renderGuideListSection(
          "Tech Choices",
          "Flex decisions for specific lobby shapes, scam boards, or stat mirrors.",
          build.techChoices
        )}
        ${renderGuideListSection(
          "Common Mistakes",
          "The most common ways this comp loses tempo, misses its window, or caps too low.",
          build.commonMistakes
        )}
      </div>
      <div class="build-guide-card-layout">
        ${renderGuideCardSection(
          "Best In Slot Cards",
          "The premium final-board or core-engine pieces you want once the comp is fully online.",
          build.bestInSlotResolved,
          "Best In Slot"
        )}
        ${renderGuideCardSection(
          "Signal Cards",
          "The cards and pairings that tell you the build is strong enough to commit to.",
          build.signalResolved,
          "Signal Card"
        )}
        ${renderGuideCardSection(
          "Pivot And Flex Cards",
          "The bridge pieces that help you stabilize, pivot in, or pivot out when the main payoff is late.",
          build.pivotResolved,
          "Pivot Piece"
        )}
      </div>
      ${renderMissingCardPills(guideMissingCards)}
    </section>
  `;
}

function renderBuildGuidePage(build) {
  if (!build) {
    return `
      <div class="page-stack">
        <section class="page-card">
          <div class="empty-state">
            <h3>Build Guide Unavailable</h3>
            <p>The requested build guide could not be found in the current local snapshot.</p>
            <div class="hero-actions">
              <a class="button-link is-primary" href="${buildHash("builds")}">Back To Builds</a>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  return `
    <div class="page-stack">
      <section class="page-card build-guide-route-head">
        <div class="page-header">
          <p class="eyebrow">${escapeHtml(buildsCatalog.season)}</p>
          <h1 class="build-guide-route-title">${escapeHtml(build.buildName)}</h1>
          <p>${escapeHtml(build.howToPlay)}</p>
          <div class="detail-pill-row">${renderPillRow([
            build.tribe,
            `${build.rating} Tier`,
            build.difficulty,
            `${build.games.toLocaleString("en-US")} games`,
            `Avg ${build.averagePlacement.toFixed(2)}`
          ])}</div>
          <div class="hero-actions">
            <a class="button-link is-primary" href="${buildHash("builds")}">Back To Builds</a>
            ${renderSaveControl({
              itemType: "build",
              itemKey: build.rank,
              className: "build-save-button",
              savedText: "Saved To Library",
              unsavedText: "Save Build",
              pendingText: "Saving…"
            })}
          </div>
        </div>
      </section>
      ${renderBuildGuideSection(build, { standalone: true })}
      <section class="page-card">
        ${renderCommentSection({
          targetType: "build",
          targetKey: String(build.rank),
          title: "Build Comments",
          helper: "Share matchup reads, transition notes, and tech adjustments for this guide."
        })}
      </section>
    </div>
  `;
}

function renderCardTile(card, selectedId) {
  const active = selectedId === card.id ? " is-active" : "";
  const summary = truncateText(card.plainText || CATEGORY_NOTES[card.category], 118);
  const targetPage = getPageForCategory(card.category);
  const detailHref = buildHash(targetPage, card.id);

  return `
    <article class="card-tile${active}">
      <a class="card-tile-link" href="${detailHref}">
        <div class="card-tile-image">
          <img src="${escapeHtml(getCardImage(card))}" alt="${escapeHtml(card.name)}" loading="lazy">
        </div>
        <div class="library-card-copy">
          <div class="pill-row">${renderPillRow(getCardSummaryPills(card).slice(0, 3), true)}</div>
          <h4>${escapeHtml(card.name)}</h4>
          <p>${escapeHtml(summary)}</p>
        </div>
      </a>
      <div class="card-tile-actions">
        ${renderCommentLauncher({
          targetType: card.category,
          targetKey: String(card.id),
          title: card.name,
          contextLabel: `${getCommentTargetTypeLabel(card.category)} Comments`,
          detailHref
        })}
      </div>
    </article>
  `;
}

function renderHeroTile(hero, selectedId) {
  const active = selectedId === hero.id ? " is-active" : "";
  const power = getLinkedCard(hero.heroPowerId);
  const note = power?.plainText || "Open the hero detail panel for hero power and companion links.";
  const detailHref = buildHash(getPageForCategory(hero.category), hero.id);

  return `
    <article class="hero-tile${active}">
      <a class="hero-tile-link" href="${detailHref}">
        <div class="hero-tile-media">
          <img src="${escapeHtml(getCardImage(hero))}" alt="${escapeHtml(hero.name)}" loading="lazy">
        </div>
        <div class="hero-tile-copy">
          <div class="pill-row">${renderPillRow([hero.armor != null ? `${hero.armor} Armor` : null, getModeLabel(hero)], true)}</div>
          <h4>${escapeHtml(hero.name)}</h4>
          <p>${escapeHtml(truncateText(note, 88))}</p>
        </div>
      </a>
      <div class="hero-tile-actions">
        ${renderCommentLauncher({
          targetType: "hero",
          targetKey: String(hero.id),
          title: hero.name,
          contextLabel: "Hero Comments",
          detailHref
        })}
      </div>
    </article>
  `;
}

function renderLinkedCard(label, card, sourceCard = null) {
  if (!card) {
    return "";
  }

  const targetPage = card.category ? getPageForCategory(card.category) : null;
  const summary = truncateText(card.plainText || CATEGORY_NOTES[card.category] || "", 118);
  const openTag = targetPage ? "a" : "article";
  const closeTag = targetPage ? "a" : "article";
  const href = targetPage ? ` href="${buildHash(targetPage, card.id)}"` : "";
  const thumbnail = getLinkedCardThumbnail(card, sourceCard);
  const fallbackLabel = (card.name || label || "?").trim().charAt(0).toUpperCase() || "?";

  return `
    <${openTag} class="linked-card"${href}>
      <div class="linked-card-media${thumbnail.isCrop ? " is-crop" : ""}">
        ${thumbnail.src
          ? `<img src="${escapeHtml(thumbnail.src)}" alt="${escapeHtml(card.name)}" loading="lazy">`
          : `<span class="linked-card-media-fallback" aria-hidden="true">${escapeHtml(fallbackLabel)}</span>`}
      </div>
      <div>
        <span class="detail-label">${escapeHtml(label)}</span>
        <h4>${escapeHtml(card.name)}</h4>
        <p>${escapeHtml(summary)}</p>
      </div>
    </${closeTag}>
  `;
}

function renderCardDetail(card, hiddenByFilter = false) {
  if (!card) {
    return `
      <aside class="detail-panel">
        <div class="empty-state">
          <h3>Select A Card</h3>
          <p>Pick any Battlegrounds entry to inspect its full image, filters, and linked detail cards.</p>
        </div>
      </aside>
    `;
  }

  const linked = [
    { label: "Hero Power", card: getLinkedCard(card.heroPowerId) },
    { label: "Triple Card", card: getLinkedCard(card.upgradeId) },
    { label: "Companion", card: getLinkedCard(card.companionId) }
  ].filter((entry) => entry.card);

  return `
    <aside class="detail-panel">
      <div class="detail-media">
        <img src="${escapeHtml(getCardImage(card))}" alt="${escapeHtml(card.name)}">
      </div>
      <div class="detail-header">
        <span class="detail-label">${escapeHtml(getCategoryLabel(card.category))}</span>
        <h3>${escapeHtml(card.name)}</h3>
        <div class="detail-pill-row">${renderPillRow(getCardSummaryPills(card))}</div>
        <div class="detail-actions">
          ${renderSaveControl({
            itemType: card.category,
            itemKey: card.id,
            savedText: "Saved To Library",
            unsavedText: `Save ${card.category === "hero" ? "Hero" : "Card"}`,
            pendingText: "Saving…"
          })}
        </div>
      </div>
      ${hiddenByFilter ? `
        <div class="detail-section">
          <span class="detail-label">Filter Note</span>
          <p>This card is selected from the route, but the current filters hide it from the grid.</p>
        </div>
      ` : ""}
      <div class="detail-section">
        <span class="detail-label">Rules Text</span>
        <div class="detail-rules">${formatRulesHtml(card.text)}</div>
      </div>
      ${card.flavorText ? `
        <div class="detail-section">
          <span class="detail-label">Flavor</span>
          <p>${escapeHtml(card.flavorText)}</p>
        </div>
      ` : ""}
      ${linked.length > 0 ? `
        <div class="detail-section">
          <span class="detail-label">Linked Cards</span>
          <div class="linked-card-grid">
            ${linked.map((entry) => renderLinkedCard(entry.label, entry.card, card)).join("")}
          </div>
        </div>
      ` : ""}
      ${renderCommentSection({
        targetType: card.category,
        targetKey: String(card.id),
        title: "Item Comments",
        helper: "Discuss interactions, edge cases, and how this card fits the current meta."
      })}
    </aside>
  `;
}

function renderHeroDetail(hero, hiddenByFilter = false) {
  if (!hero) {
    return `
      <aside class="detail-panel">
        <div class="empty-state">
          <h3>Select A Hero</h3>
          <p>Choose a hero to inspect armor, hero power, and any linked companion card.</p>
        </div>
      </aside>
    `;
  }

  const heroPower = getLinkedCard(hero.heroPowerId);
  const companion = getLinkedCard(hero.companionId);

  return `
    <aside class="detail-panel">
      <div class="detail-media">
        <img src="${escapeHtml(getCardImage(hero))}" alt="${escapeHtml(hero.name)}">
      </div>
      <div class="detail-header">
        <span class="detail-label">Hero</span>
        <h3>${escapeHtml(hero.name)}</h3>
        <div class="detail-pill-row">${renderPillRow(getCardSummaryPills(hero))}</div>
        <div class="detail-actions">
          ${renderSaveControl({
            itemType: "hero",
            itemKey: hero.id,
            savedText: "Saved To Library",
            unsavedText: "Save Hero",
            pendingText: "Saving…"
          })}
        </div>
      </div>
      ${hiddenByFilter ? `
        <div class="detail-section">
          <span class="detail-label">Filter Note</span>
          <p>This hero is selected from the route, but the current hero filters hide it from the grid.</p>
        </div>
      ` : ""}
      <div class="hero-detail-layout">
        ${heroPower ? `
          <div class="hero-detail-section">
            <span class="detail-label">Hero Power</span>
            <div class="hero-power-card">
              <img src="${escapeHtml(getCardImage(heroPower))}" alt="${escapeHtml(heroPower.name)}">
              <div>
                <h4>${escapeHtml(heroPower.name)}</h4>
                <p class="hero-power-note">${heroPower.plainText ? escapeHtml(heroPower.plainText) : "The official detail entry is image-first for this card."}</p>
                ${heroPower.category ? `
                  <div class="detail-actions">
                    <a class="button-link" href="${buildHash(getPageForCategory(heroPower.category), heroPower.id)}">Open In Library</a>
                  </div>
                ` : ""}
              </div>
            </div>
          </div>
        ` : ""}
        ${companion ? `
          <div class="hero-detail-section">
            <span class="detail-label">Companion</span>
            <div class="hero-power-card">
              <img src="${escapeHtml(getCardImage(companion))}" alt="${escapeHtml(companion.name)}">
              <div>
                <h4>${escapeHtml(companion.name)}</h4>
                <p class="hero-power-note">${companion.plainText ? escapeHtml(companion.plainText) : "Open the card to inspect the full official image."}</p>
                ${companion.category ? `
                  <div class="detail-actions">
                    <a class="button-link" href="${buildHash(getPageForCategory(companion.category), companion.id)}">Open In Library</a>
                  </div>
                ` : ""}
              </div>
            </div>
          </div>
        ` : ""}
      </div>
      ${renderCommentSection({
        targetType: "hero",
        targetKey: String(hero.id),
        title: "Hero Comments",
        helper: "Use this thread for armor reads, hero-power lines, and lobby-specific notes."
      })}
    </aside>
  `;
}

function renderBuildsView() {
  refs.buildsView.classList.toggle("is-active", state.route.page === "builds");

  if (state.route.page !== "builds") {
    refs.buildsView.innerHTML = "";
    return;
  }

  const routeBuild = state.route.id ? buildsByRank.get(state.route.id) ?? null : null;
  if (state.route.id != null) {
    refs.buildsView.innerHTML = renderBuildGuidePage(routeBuild);
    return;
  }

  const visibleBuilds = getVisibleBuilds().slice().sort((left, right) => left.rank - right.rank);
  refs.buildsView.innerHTML = `
    <div class="page-stack">
      <section class="page-hero">
        <div class="page-hero-copy">
          <p class="eyebrow">Build Guide Index</p>
          <h1>${escapeHtml(buildsCatalog.season)}</h1>
          <p class="page-hero-lead">
            Track the current Battlegrounds comp board for ${escapeHtml(buildsCatalog.seasonTheme)}.
            Open any build from the ranked list below for its dedicated guide, pivots, tavern-tier pacing, and target cards.
          </p>
          <p class="filter-helper">Strategy snapshot updated ${escapeHtml(formatSyncDate(buildsCatalog.asOf))}.</p>
        </div>
        <div class="hero-logo-panel" aria-hidden="true">
          <div class="hero-logo-frame">
            <img src="./assets/atlas-compass-logo.svg?v=20260325t" alt="">
          </div>
        </div>
      </section>

      <section class="filter-toolbar">
        <div class="filter-grid build-filter-grid">
          <label class="filter-field">
            <span class="filter-label">Search Builds</span>
            <input id="builds-search" type="search" value="${escapeHtml(state.builds.search)}" placeholder="Search tribe, card, or build name">
          </label>

          <label class="filter-field">
            <span class="filter-label">Tribe</span>
            <select id="builds-tribe">
              ${buildTribeOptions.map((option) => `
                <option value="${escapeHtml(option)}" ${state.builds.tribe === option ? "selected" : ""}>
                  ${escapeHtml(option === "all" ? "All Tribes" : option)}
                </option>
              `).join("")}
            </select>
          </label>

          <label class="filter-field">
            <span class="filter-label">Difficulty</span>
            <select id="builds-difficulty">
              ${buildDifficultyOptions.map((option) => `
                <option value="${escapeHtml(option)}" ${state.builds.difficulty === option ? "selected" : ""}>
                  ${escapeHtml(option === "all" ? "All Difficulty" : option)}
                </option>
              `).join("")}
            </select>
          </label>

          <label class="filter-field">
            <span class="filter-label">Tier</span>
            <select id="builds-rating">
              ${buildRatingOptions.map((option) => `
                <option value="${escapeHtml(option)}" ${state.builds.rating === option ? "selected" : ""}>
                  ${escapeHtml(option === "all" ? "All Tiers" : `${option} Tier`)}
                </option>
              `).join("")}
            </select>
          </label>
        </div>

        <div class="results-bar">
          <div class="result-copy">
            Builds In View
            <strong>${formatCount(visibleBuilds.length)} current guides</strong>
          </div>
          <div class="result-actions">
            <button type="button" class="button-link" data-clear-builds="true">Reset Filters</button>
          </div>
        </div>
      </section>

      ${visibleBuilds.length === 0 ? `
        <div class="empty-state">
          <h3>No Builds Match These Filters</h3>
          <p>Reset the build filters or broaden the search to bring the current strategy board back into view.</p>
        </div>
      ` : `
        <section class="page-card build-catalog-section">
          <div class="section-head build-catalog-head">
            <div>
              <p class="eyebrow">Build Catalog</p>
              <h2 class="section-title">Choose A Build</h2>
              <p class="filter-helper">Select a build row to open a dedicated guide page for that comp.</p>
            </div>
          </div>
          <div class="build-table-scroll">
            <div class="build-table" role="table" aria-label="Build catalog">
              <div class="build-table-head" role="rowgroup">
                <div class="build-table-row build-table-row-head" role="row">
                  <span class="build-table-col build-table-col-logo" role="columnheader" aria-label="Build mark"></span>
                  <span class="build-table-col build-table-col-build" role="columnheader">Build</span>
                  <span class="build-table-col build-table-col-cards" role="columnheader">Best In Slot</span>
                  <span class="build-table-col build-table-col-stat" role="columnheader">Tier</span>
                  <span class="build-table-col build-table-col-stat" role="columnheader">Difficulty</span>
                  <span class="build-table-col build-table-col-stat" role="columnheader">Avg Place</span>
                  <span class="build-table-col build-table-col-stat" role="columnheader">Games Sampled</span>
                  <span class="build-table-col build-table-col-stat" role="columnheader">Comments</span>
                </div>
              </div>
              <div class="build-table-body" role="rowgroup">
                ${visibleBuilds.map((build) => renderBuildTile(build)).join("")}
              </div>
            </div>
          </div>
        </section>
      `}

    </div>
  `;
}

function getCategorySortOptions(category) {
  if (category === "hero") {
    return `
      <option value="name_asc">Name A-Z</option>
      <option value="name_desc">Name Z-A</option>
      <option value="armor_desc">Armor High To Low</option>
      <option value="armor_asc">Armor Low To High</option>
    `;
  }

  const tierOptionsMarkup = categorySupportsTier(category) ? `
      <option value="tier_asc">Tier Low To High</option>
      <option value="tier_desc">Tier High To Low</option>
    ` : "";
  const combatOptionsMarkup = category === "minion" ? `
      <option value="attack_desc">Attack High To Low</option>
      <option value="health_desc">Health High To Low</option>
    ` : "";

  return `
      <option value="name_asc">Name A-Z</option>
      <option value="name_desc">Name Z-A</option>
      ${tierOptionsMarkup}
      ${combatOptionsMarkup}
    `;
}

function renderCategoryView() {
  const routePage = getCategoryPage();
  if (!routePage || routePage.category === "hero") {
    refs.libraryView.classList.remove("is-active");
    refs.libraryView.innerHTML = "";
    return;
  }

  const view = getCategoryViewContext(routePage.category);
  if (!view) {
    refs.libraryView.classList.remove("is-active");
    refs.libraryView.innerHTML = "";
    return;
  }

  const {
    pageConfig,
    libraryState,
    results,
    page,
    startIndex,
    pageCards,
    selectedCard,
    hiddenByFilter,
    hasMinionTypeFilter,
    hasTierFilter,
    emptyLabel
  } = view;
  libraryState.page = page;

  refs.libraryView.classList.add("is-active");
  refs.libraryView.innerHTML = `
    <div class="page-stack">
      <section class="page-card">
        <div class="page-header">
          <p class="eyebrow">${escapeHtml(pageConfig.label)}</p>
          <h2>${escapeHtml(pageConfig.heading)}</h2>
          <p>${escapeHtml(CATEGORY_NOTES[pageConfig.category])} Every page now carries its own sorting tool instead of sharing one mixed catalog.</p>
        </div>
      </section>

      <section class="filter-toolbar">
        <div class="filter-grid">
          <label class="filter-field">
            <span class="filter-label">Search ${escapeHtml(pageConfig.label)}</span>
            <input id="cards-search" type="search" value="${escapeHtml(libraryState.search)}" placeholder="Search ${escapeHtml(pageConfig.label.toLowerCase())}">
          </label>

          ${hasMinionTypeFilter ? `
            <label class="filter-field">
              <span class="filter-label">Minion Type</span>
              <select id="cards-minion-type">
                ${minionTypeOptions.map((entry) => `
                  <option value="${escapeHtml(entry.slug)}" ${libraryState.minionType === entry.slug ? "selected" : ""}>
                    ${escapeHtml(entry.name)}
                  </option>
                `).join("")}
              </select>
            </label>
          ` : ""}

          ${hasTierFilter ? `
            <label class="filter-field">
              <span class="filter-label">Tavern Tier</span>
              <select id="cards-tier">
                <option value="all">All Tiers</option>
                ${tierOptions.map((value) => `
                  <option value="${value}" ${libraryState.tier === String(value) ? "selected" : ""}>Tier ${value}</option>
                `).join("")}
              </select>
            </label>
          ` : ""}

          <label class="filter-field">
            <span class="filter-label">Mode</span>
            <select id="cards-mode">
              <option value="all" ${libraryState.mode === "all" ? "selected" : ""}>All Modes</option>
              <option value="shared" ${libraryState.mode === "shared" ? "selected" : ""}>Shared</option>
              <option value="duos" ${libraryState.mode === "duos" ? "selected" : ""}>Duos Only</option>
              <option value="solos" ${libraryState.mode === "solos" ? "selected" : ""}>Solos Only</option>
            </select>
          </label>

          <label class="filter-field">
            <span class="filter-label">Sort</span>
            <select id="cards-sort">
              ${getCategorySortOptions(pageConfig.category).replace(`value="${libraryState.sort}"`, `value="${libraryState.sort}" selected`)}
            </select>
          </label>
        </div>

        <div class="results-bar">
          <div class="result-copy">
            ${escapeHtml(pageConfig.label)} In View
            <strong>
              ${formatCount(results.length)} showing ${results.length === 0 ? "0" : `${formatCount(startIndex + 1)}-${formatCount(Math.min(results.length, startIndex + pageCards.length))}`}
            </strong>
          </div>
          <div class="result-actions">
            <button type="button" class="button-link" data-clear-category="${escapeHtml(pageConfig.category)}">Reset Filters</button>
          </div>
        </div>
      </section>

      ${results.length === 0 ? `
        <div class="empty-state">
          <h3>No ${escapeHtml(pageConfig.label)} Match These Filters</h3>
          <p>Clear the search or relax the current ${escapeHtml(emptyLabel)} filters to bring results back into view.</p>
        </div>
      ` : `
        <div class="library-shell">
          ${renderCardDetail(selectedCard, hiddenByFilter)}
          <div class="grid-panel">
            <div class="library-grid">
              ${pageCards.map((card) => renderCardTile(card, selectedCard?.id ?? null)).join("")}
            </div>
            ${renderPagination("cards", results.length, cardsPageSize, page)}
          </div>
        </div>
      `}
    </div>
  `;
}

function renderHeroesView() {
  const {
    pageConfig,
    libraryState,
    results,
    page,
    startIndex,
    pageHeroes,
    selectedHero,
    hiddenByFilter
  } = getHeroesViewContext();
  libraryState.page = page;

  refs.heroesView.classList.toggle("is-active", state.route.page === "heroes");
  refs.heroesView.innerHTML = `
    <div class="page-stack">
      <section class="page-card">
        <div class="page-header">
          <p class="eyebrow">${escapeHtml(pageConfig.label)}</p>
          <h2>${escapeHtml(pageConfig.heading)}</h2>
          <p>
            ${escapeHtml(CATEGORY_NOTES.hero)} This page now stands on its own so the hero roster is never mixed into the minion or spell pages.
          </p>
        </div>
      </section>

      <section class="filter-toolbar">
        <div class="filter-grid">
          <label class="filter-field">
            <span class="filter-label">Search Heroes</span>
            <input id="heroes-search" type="search" value="${escapeHtml(libraryState.search)}" placeholder="Search the live hero roster">
          </label>

          <label class="filter-field">
            <span class="filter-label">Mode</span>
            <select id="heroes-mode">
              <option value="all" ${libraryState.mode === "all" ? "selected" : ""}>All Modes</option>
              <option value="shared" ${libraryState.mode === "shared" ? "selected" : ""}>Shared</option>
              <option value="duos" ${libraryState.mode === "duos" ? "selected" : ""}>Duos Only</option>
              <option value="solos" ${libraryState.mode === "solos" ? "selected" : ""}>Solos Only</option>
            </select>
          </label>

          <label class="filter-field">
            <span class="filter-label">Sort</span>
            <select id="heroes-sort">
              ${getCategorySortOptions("hero").replace(`value="${libraryState.sort}"`, `value="${libraryState.sort}" selected`)}
            </select>
          </label>
        </div>

        <div class="results-bar">
          <div class="result-copy">
            Heroes In View
            <strong>
              ${formatCount(results.length)} showing ${results.length === 0 ? "0" : `${formatCount(startIndex + 1)}-${formatCount(Math.min(results.length, startIndex + pageHeroes.length))}`}
            </strong>
          </div>
          <div class="result-actions">
            <button type="button" class="button-link" data-clear-category="hero">Reset Filters</button>
          </div>
        </div>
      </section>

      ${results.length === 0 ? `
        <div class="empty-state">
          <h3>No Heroes Match These Filters</h3>
          <p>Reset the hero filters to restore the full live roster.</p>
        </div>
      ` : `
        <div class="library-shell">
          ${renderHeroDetail(selectedHero, hiddenByFilter)}
          <div class="grid-panel">
            <div class="library-grid">
              ${pageHeroes.map((hero) => renderHeroTile(hero, selectedHero?.id ?? null)).join("")}
            </div>
            ${renderPagination("heroes", results.length, heroesPageSize, page)}
          </div>
        </div>
      `}
    </div>
  `;
}

function renderFooter() {
  refs.footer.innerHTML = `
    <p>
      <a href="${buildHash("support")}">Support Atlas</a>
      <span class="separator">•</span>
      <a href="${buildHash("privacy")}">Privacy</a>
      <span class="separator">•</span>
      <a href="${escapeHtml(catalog.source.page)}" target="_blank" rel="noreferrer">Blizzard Battlegrounds Library</a>
      <span class="separator">•</span>
      <a href="${escapeHtml(catalog.source.api)}?gameMode=battlegrounds&page=1&pageSize=1" target="_blank" rel="noreferrer">Blizzard Cards API</a>
    </p>
    <p>
      Live catalog synced ${escapeHtml(formatSyncDate(catalog.syncedAt))}.
    </p>
    <p>
      Totals in this local build:
      ${typeOptions.map((entry) => `${escapeHtml(entry.label)} ${formatCount(entry.count)}`).join(" • ")}.
    </p>
  `;
}

function getRouteCommentTargets() {
  if (state.route.page === "combos") {
    return {
      previewTargets: combos.map((combo) => ({
        targetType: "combo",
        targetKey: combo.key
      })),
      detailTargets: []
    };
  }

  if (state.route.page === "builds") {
    if (state.route.id != null) {
      const build = buildsByRank.get(state.route.id);
      return {
        previewTargets: [],
        detailTargets: build ? [{ targetType: "build", targetKey: String(build.rank) }] : []
      };
    }

    const visibleBuilds = getVisibleBuilds().slice().sort((left, right) => left.rank - right.rank);
    return {
      previewTargets: visibleBuilds.map((build) => ({
        targetType: "build",
        targetKey: String(build.rank)
      })),
      detailTargets: []
    };
  }

  if (state.route.page === "heroes") {
    const view = getHeroesViewContext();
    return {
      previewTargets: view.pageHeroes.map((hero) => ({
        targetType: "hero",
        targetKey: String(hero.id)
      })),
      detailTargets: view.selectedHero ? [{ targetType: "hero", targetKey: String(view.selectedHero.id) }] : []
    };
  }

  const categoryPage = getCategoryPage();
  if (categoryPage && categoryPage.category !== "hero") {
    const view = getCategoryViewContext(categoryPage.category);
    return {
      previewTargets: view?.pageCards?.map((card) => ({
        targetType: card.category,
        targetKey: String(card.id)
      })) ?? [],
      detailTargets: view?.selectedCard ? [{
        targetType: view.selectedCard.category,
        targetKey: String(view.selectedCard.id)
      }] : []
    };
  }

  return {
    previewTargets: [],
    detailTargets: []
  };
}

function ensureCommentsForActiveRoute() {
  const { previewTargets, detailTargets } = getRouteCommentTargets();

  const missingPreviewTargets = previewTargets.filter((target) => {
    const threadKey = buildCommentThreadKey(target.targetType, target.targetKey);
    return !commentState.threads.has(threadKey) && !commentState.loadingKeys.has(threadKey);
  });

  if (missingPreviewTargets.length) {
    void loadCommentThreads(missingPreviewTargets, {
      limit: 1,
      sort: DEFAULT_COMMENT_SORT
    });
  }

  detailTargets.forEach((target) => {
    const thread = getCommentThreadState(target.targetType, target.targetKey);
    if (thread.loading || thread.loadedLimit >= 20) {
      return;
    }

    void loadCommentThreads([target], {
      limit: 20,
      force: thread.loadedLimit < 20,
      sort: thread.sort
    });
  });
}

function trackRouteView() {
  const routeKey = `${state.route.page}:${state.route.segments?.join("/") ?? ""}:${state.route.id ?? ""}`;
  if (state.analytics.lastRouteKey === routeKey) {
    return;
  }

  state.analytics.lastRouteKey = routeKey;
  const telemetry = getTelemetryRoute();
  postTelemetry("/api/analytics/view", {
    page: telemetry.page,
    routeId: telemetry.routeId
  });
}

function getTelemetryRoute() {
  if (state.route.page === "community") {
    return {
      page: "community",
      routeId: state.route.segments?.[0] === "profile" && state.route.id != null ? String(state.route.id) : ""
    };
  }

  if (state.route.page === "account") {
    return {
      page: "account",
      routeId: ""
    };
  }

  return {
    page: state.route.page,
    routeId: state.route.id == null ? "" : String(state.route.id)
  };
}

function render() {
  const previousRoute = state.route;
  const nextRoute = parseHash();
  const routeChanged = previousRoute.page !== nextRoute.page || previousRoute.id !== nextRoute.id;

  state.route = nextRoute;
  if (routeChanged) {
    commentState.drawer = null;
  }
  renderNav();
  renderBuildsView();
  renderCombosView();
  renderCommunityView();
  renderSupportView();
  renderPrivacyView();
  renderCategoryView();
  renderHeroesView();
  renderAdPlacements();
  renderFooter();
  renderCommentDrawer();
  ensureCommentsForActiveRoute();
  trackRouteView();

  if (routeChanged) {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }
}

function resetBuildFilters() {
  state.builds.search = "";
  state.builds.tribe = "all";
  state.builds.difficulty = "all";
  state.builds.rating = "all";
  render();
}

function resetCategoryFilters(category) {
  const targetState = getLibraryState(category);
  if (!targetState) {
    return;
  }

  targetState.search = "";
  targetState.mode = "all";
  targetState.sort = getDefaultLibrarySort(category);
  targetState.page = 1;

  if (categorySupportsMinionType(category)) {
    targetState.minionType = "all";
  }

  if (categorySupportsTier(category)) {
    targetState.tier = "all";
  }

  render();
}

function handleClick(event) {
  const saveButton = event.target.closest("[data-save-item]");
  if (saveButton) {
    event.preventDefault();

    if (!accountController) {
      return;
    }

    void accountController.toggleSaved({
      itemType: saveButton.dataset.saveType,
      itemKey: saveButton.dataset.saveKey
    }).catch(() => {});
    return;
  }

  const commentToggle = event.target.closest("[data-comment-toggle]");
  if (commentToggle) {
    event.preventDefault();

    const target = normalizeCommentTarget(commentToggle.dataset.commentType, commentToggle.dataset.commentKey);
    if (!target) {
      return;
    }

    const threadKey = buildCommentThreadKey(target.targetType, target.targetKey);
    const expanded = commentState.expandedKeys.has(threadKey);
    if (expanded) {
      commentState.expandedKeys.delete(threadKey);
      render();
      return;
    }

    commentState.expandedKeys.add(threadKey);
    const thread = getCommentThreadState(target.targetType, target.targetKey);
    const limit = getExpandedCommentLoadLimit(thread.totalComments);
    render();
    void loadCommentThreads([target], {
      limit,
      force: thread.loadedLimit < limit,
      sort: thread.sort
    });
    return;
  }

  const commentSortButton = event.target.closest("[data-comment-sort]");
  if (commentSortButton) {
    event.preventDefault();

    const target = normalizeCommentTarget(commentSortButton.dataset.commentType, commentSortButton.dataset.commentKey);
    if (!target) {
      return;
    }

    const thread = getCommentThreadState(target.targetType, target.targetKey);
    const sort = normalizeCommentSort(commentSortButton.dataset.commentSort);
    const limit = Math.max(getExpandedCommentLoadLimit(thread.totalComments), thread.loadedLimit);

    if (thread.loading || (thread.sort === sort && thread.loadedLimit >= limit)) {
      return;
    }

    void loadCommentThreads([target], {
      limit,
      force: true,
      sort
    });
    return;
  }

  const commentOpenButton = event.target.closest("[data-comment-open]");
  if (commentOpenButton) {
    event.preventDefault();
    openCommentDrawer({
      targetType: commentOpenButton.dataset.commentType,
      targetKey: commentOpenButton.dataset.commentKey,
      title: commentOpenButton.dataset.commentTitle,
      contextLabel: commentOpenButton.dataset.commentLabel,
      detailHref: commentOpenButton.dataset.commentDetail
    });
    return;
  }

  const commentCloseButton = event.target.closest("[data-comment-close]");
  if (commentCloseButton) {
    event.preventDefault();
    closeCommentDrawer();
    return;
  }

  const pinCommentButton = event.target.closest("[data-comment-pin]");
  if (pinCommentButton) {
    event.preventDefault();
    const commentId = Number(pinCommentButton.dataset.commentPin);
    const target = normalizeCommentTarget(pinCommentButton.dataset.commentType, pinCommentButton.dataset.commentKey);

    if (!commentId || !target || commentState.pendingPinIds.has(commentId)) {
      return;
    }

    const thread = getCommentThreadState(target.targetType, target.targetKey);
    const nextPinned = pinCommentButton.dataset.commentPinned !== "true";
    commentState.pendingPinIds.add(commentId);
    render();

    void commentsApi(`/api/comments/${commentId}/pin`, {
      method: "POST",
      body: {
        pinned: nextPinned,
        limit: getCommentMutationLimit(thread),
        sort: thread.sort
      }
    }).then((payload) => {
      if (payload.thread) {
        storeCommentThread(payload.thread);
      }
    }).catch((error) => {
      const threadKey = buildCommentThreadKey(target.targetType, target.targetKey);
      commentState.errors.set(threadKey, error instanceof Error ? error.message : "Failed to update comment pin.");
    }).finally(() => {
      commentState.pendingPinIds.delete(commentId);
      render();
    });
    return;
  }

  const deleteCommentButton = event.target.closest("[data-comment-delete]");
  if (deleteCommentButton) {
    event.preventDefault();
    const commentId = Number(deleteCommentButton.dataset.commentDelete);
    const target = normalizeCommentTarget(deleteCommentButton.dataset.commentType, deleteCommentButton.dataset.commentKey);

    if (!commentId || !target || commentState.pendingDeleteIds.has(commentId)) {
      return;
    }

    const thread = getCommentThreadState(target.targetType, target.targetKey);
    commentState.pendingDeleteIds.add(commentId);
    render();

    void commentsApi(`/api/comments/${commentId}`, {
      method: "DELETE",
      body: {
        limit: getCommentMutationLimit(thread),
        sort: thread.sort
      }
    })
      .then((payload) => {
        if (payload.thread) {
          storeCommentThread(payload.thread);
        }
      })
      .catch((error) => {
        const threadKey = buildCommentThreadKey(target.targetType, target.targetKey);
        commentState.errors.set(threadKey, error instanceof Error ? error.message : "Failed to delete comment.");
      })
      .finally(() => {
        commentState.pendingDeleteIds.delete(commentId);
        render();
      });
    return;
  }

  if (communityController?.handleClick(event)) {
    return;
  }

  const buildLink = event.target.closest("[data-build-link]");
  if (buildLink) {
    event.preventDefault();
    const href = buildLink.dataset.buildLink;
    if (href) {
      location.hash = href;
    }
    return;
  }

  const navButton = event.target.closest("[data-nav-page]");
  if (navButton) {
    event.preventDefault();
    navigate(navButton.dataset.navPage);
    return;
  }

  const clearCategory = event.target.closest("[data-clear-category]");
  if (clearCategory) {
    event.preventDefault();
    resetCategoryFilters(clearCategory.dataset.clearCategory);
    return;
  }

  const clearBuilds = event.target.closest("[data-clear-builds]");
  if (clearBuilds) {
    event.preventDefault();
    resetBuildFilters();
    return;
  }

  const cardsPage = event.target.closest("[data-cards-page]");
  if (cardsPage) {
    event.preventDefault();
    const categoryPage = getCategoryPage();
    if (!categoryPage) {
      return;
    }
    getLibraryState(categoryPage.category).page = Number(cardsPage.dataset.cardsPage) || 1;
    render();
    return;
  }

  const heroesPage = event.target.closest("[data-heroes-page]");
  if (heroesPage) {
    event.preventDefault();
    getLibraryState("hero").page = Number(heroesPage.dataset.heroesPage) || 1;
    render();
  }
}

function handleSubmit(event) {
  const commentForm = event.target.closest("[data-comment-form]");
  if (commentForm) {
    event.preventDefault();

    const target = normalizeCommentTarget(commentForm.dataset.commentType, commentForm.dataset.commentKey);
    if (!target) {
      return;
    }

    const threadKey = buildCommentThreadKey(target.targetType, target.targetKey);
    if (commentState.pendingSubmitKeys.has(threadKey)) {
      return;
    }
    const values = Object.fromEntries(new FormData(commentForm).entries());
    const thread = getCommentThreadState(target.targetType, target.targetKey);
    commentState.pendingSubmitKeys.add(threadKey);
    commentState.expandedKeys.add(threadKey);
    commentState.errors.delete(threadKey);

    void commentsApi("/api/comments", {
      method: "POST",
      body: {
        targetType: target.targetType,
        targetKey: target.targetKey,
        body: values.body,
        limit: getCommentMutationLimit(thread),
        sort: thread.sort
      }
    }).then((payload) => {
      if (payload.thread) {
        storeCommentThread(payload.thread);
      }
      commentForm.reset();
    }).catch((error) => {
      commentState.errors.set(threadKey, error instanceof Error ? error.message : "Failed to post comment.");
    }).finally(() => {
      commentState.pendingSubmitKeys.delete(threadKey);
      render();
    });
    return;
  }

  if (communityController?.handleSubmit(event)) {
    return;
  }
}

function handleKeyDown(event) {
  if (event.key === "Escape" && commentState.drawer) {
    event.preventDefault();
    closeCommentDrawer();
    return;
  }

  const buildLink = event.target.closest("[data-build-link]");
  if (!buildLink || event.target !== buildLink) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    const href = buildLink.dataset.buildLink;
    if (href) {
      location.hash = href;
    }
  }
}

function handleInput(event) {
  if (event.target.id === "builds-search") {
    state.builds.search = normalizeLookupText(event.target.value);
    render();
    return;
  }

  if (event.target.id === "cards-search") {
    const categoryPage = getCategoryPage();
    if (!categoryPage) {
      return;
    }
    const libraryState = getLibraryState(categoryPage.category);
    libraryState.search = event.target.value.trim().toLowerCase();
    libraryState.page = 1;
    render();
    return;
  }

  if (event.target.id === "heroes-search") {
    const heroState = getLibraryState("hero");
    heroState.search = event.target.value.trim().toLowerCase();
    heroState.page = 1;
    render();
  }
}

function handleChange(event) {
  const categoryPage = getCategoryPage();
  const libraryState = categoryPage ? getLibraryState(categoryPage.category) : null;

  switch (event.target.id) {
    case "builds-tribe":
      state.builds.tribe = event.target.value;
      render();
      break;
    case "builds-difficulty":
      state.builds.difficulty = event.target.value;
      render();
      break;
    case "builds-rating":
      state.builds.rating = event.target.value;
      render();
      break;
    case "cards-minion-type":
      if (libraryState) {
        libraryState.minionType = event.target.value;
        libraryState.page = 1;
        render();
      }
      break;
    case "cards-tier":
      if (libraryState) {
        libraryState.tier = event.target.value;
        libraryState.page = 1;
        render();
      }
      break;
    case "cards-mode":
      if (libraryState) {
        libraryState.mode = event.target.value;
        libraryState.page = 1;
        render();
      }
      break;
    case "cards-sort":
      if (libraryState) {
        libraryState.sort = event.target.value;
        libraryState.page = 1;
        render();
      }
      break;
    case "heroes-mode":
      getLibraryState("hero").mode = event.target.value;
      getLibraryState("hero").page = 1;
      render();
      break;
    case "heroes-sort":
      getLibraryState("hero").sort = event.target.value;
      getLibraryState("hero").page = 1;
      render();
      break;
    default:
      break;
  }
}

let resizeFrame = 0;
function handleResize() {
  if (resizeFrame) {
    cancelAnimationFrame(resizeFrame);
  }

  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0;
    render();
  });
}

accountController = typeof window.createAtlasAccountController === "function"
  ? window.createAtlasAccountController()
  : null;

communityController = typeof window.createAtlasCommunityController === "function"
  ? window.createAtlasCommunityController({
      account: accountController,
      buildHash,
      buildHashParts,
      escapeHtml,
      formatSyncDate,
      navigateParts,
      renderPillRow,
      resolveSavedItem
    })
  : null;

if (accountController) {
  accountController.subscribe(() => {
    render();
  });
  void accountController.bootstrap();
}

window.addEventListener("hashchange", render);
window.addEventListener("resize", handleResize);
document.addEventListener("click", handleClick);
document.addEventListener("keydown", handleKeyDown);
document.addEventListener("input", handleInput);
document.addEventListener("change", handleChange);
document.addEventListener("submit", handleSubmit);

if (!location.hash) {
  navigate("builds");
} else {
  render();
}
