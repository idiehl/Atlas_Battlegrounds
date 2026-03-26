const catalog = window.BATTLEGROUNDS_CATALOG;
const buildsCatalog = window.BATTLEGROUNDS_BUILDS;
const buildGuideCatalog = window.BATTLEGROUNDS_BUILD_GUIDES ?? {};
const buildTierPlanCatalog = window.BATTLEGROUNDS_BUILD_TIER_PLANS ?? {};

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

const NAV_PAGES = [
  BUILDS_PAGE,
  ...CATEGORY_PAGES.map((entry) => ({
    key: entry.key,
    label: entry.label,
    kind: entry.detailKind,
    category: entry.category
  }))
];

const PAGE_BY_KEY = new Map(NAV_PAGES.map((entry) => [entry.key, entry]));
const PAGE_BY_CATEGORY = new Map(CATEGORY_PAGES.map((entry) => [entry.category, entry]));
const LEGACY_PAGE_ALIASES = new Map([
  ["overview", "builds"],
  ["build", "builds"],
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
            sort: "name_asc",
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
  libraryView: document.getElementById("library-view"),
  heroesView: document.getElementById("heroes-view"),
  footer: document.getElementById("app-footer")
};

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
  const id = parts[1] ? Number(parts[1]) : null;
  let normalizedPage = LEGACY_PAGE_ALIASES.get(rawPage) ?? rawPage;

  if (rawPage === "cards" && Number.isFinite(id) && cardsById.has(id)) {
    normalizedPage = getPageForCategory(cardsById.get(id).category);
  }

  const page = PAGE_BY_KEY.has(normalizedPage) ? normalizedPage : "builds";

  return {
    page,
    id: Number.isFinite(id) ? id : null
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

function navigate(page, id = null) {
  const nextHash = buildHash(page, id);
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
const buildTribeOptions = ["all", ...new Set(builds.map((build) => build.tribe))];
const buildDifficultyOptions = ["all", ...BUILD_DIFFICULTY_ORDER.filter((difficulty) => builds.some((build) => build.difficulty === difficulty))];
const buildRatingOptions = ["all", ...BUILD_RATING_ORDER.filter((rating) => builds.some((build) => build.rating === rating))];

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
    return `<a class="nav-link${active}" href="${buildHash(entry.key)}">${entry.label}</a>`;
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
    .filter((card) => category !== "minion" || libraryState.minionType === "all" || card.minionTypeSlug === libraryState.minionType)
    .filter((card) => category !== "minion" || libraryState.tier === "all" || String(card.tier) === libraryState.tier)
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
  "APM Pirates": { cardName: "Fleet Admiral Tethys", position: "50% 18%", scale: 1.74 },
  "Stuntdrake Dragons": { cardName: "Stuntdrake", position: "54% 15%", scale: 1.88 },
  "Attack Undead": { cardName: "Forsaken Weaver", position: "38% 17%", scale: 2.02 },
  "Refresh Elementals": { cardName: "Acid Rainfall", position: "50% 19%", scale: 1.74 },
  "Boost Shop Quilboar": { cardName: "Felboar", position: "54% 18%", scale: 1.84 },
  "End of Turn Murlocs": { cardName: "Magicfin Mycologist", position: "49% 18%", scale: 1.82 },
  "End of Turn Nagas": { cardName: "Fauna Whisperer", position: "48% 18%", scale: 1.82 },
  "Beasts Beetles": { cardName: "Rylak Metalhead", position: "50% 17%", scale: 1.78 },
  "Bomber Mechs": { cardName: "Photobomber", position: "48% 17%", scale: 1.78 },
  "Lord of Ruins Demons": { cardName: "Lord of the Ruins", position: "53% 18%", scale: 1.82 }
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
    position: preset?.position ?? "50% 20%",
    scale: preset?.scale ?? 1
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

  return `
    <a
      class="build-list-item ${escapeHtml(tierClass)}"
      href="${buildHash("builds", build.rank)}"
      aria-label="Open ${escapeHtml(build.buildName)} guide"
      role="row"
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
      <span class="build-row-stat" role="cell">
        <span class="detail-label">Difficulty</span>
        <strong>${escapeHtml(build.difficulty)}</strong>
      </span>
      <span class="build-row-stat" role="cell">
        <span class="detail-label">Avg Place</span>
        <strong>${build.averagePlacement.toFixed(2)}</strong>
      </span>
      <span class="build-row-stat" role="cell">
        <span class="detail-label">Sample</span>
        <strong>${build.games.toLocaleString("en-US")}</strong>
      </span>
    </a>
  `;
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
          </div>
        </div>
      </section>
      ${renderBuildGuideSection(build, { standalone: true })}
    </div>
  `;
}

function renderCardTile(card, selectedId) {
  const active = selectedId === card.id ? " is-active" : "";
  const summary = truncateText(card.plainText || CATEGORY_NOTES[card.category], 118);
  const targetPage = getPageForCategory(card.category);

  return `
    <a class="card-tile${active}" href="${buildHash(targetPage, card.id)}">
      <div class="card-tile-image">
        <img src="${escapeHtml(getCardImage(card))}" alt="${escapeHtml(card.name)}" loading="lazy">
      </div>
      <div class="library-card-copy">
        <div class="pill-row">${renderPillRow(getCardSummaryPills(card).slice(0, 3), true)}</div>
        <h4>${escapeHtml(card.name)}</h4>
        <p>${escapeHtml(summary)}</p>
        <div class="pill-row">
          <span class="pill is-muted">${active ? "Selected" : "View Details"}</span>
        </div>
      </div>
    </a>
  `;
}

function renderHeroTile(hero, selectedId) {
  const active = selectedId === hero.id ? " is-active" : "";
  const power = getLinkedCard(hero.heroPowerId);
  const note = power?.plainText || "Open the hero detail panel for hero power and companion links.";

  return `
    <a class="hero-tile${active}" href="${buildHash(getPageForCategory(hero.category), hero.id)}">
      <div class="hero-tile-media">
        <img src="${escapeHtml(getCardImage(hero))}" alt="${escapeHtml(hero.name)}" loading="lazy">
      </div>
      <div class="hero-tile-copy">
        <div class="pill-row">${renderPillRow([hero.armor != null ? `${hero.armor} Armor` : null, getModeLabel(hero)], true)}</div>
        <h4>${escapeHtml(hero.name)}</h4>
        <p>${escapeHtml(truncateText(note, 88))}</p>
      </div>
    </a>
  `;
}

function renderLinkedCard(label, card) {
  if (!card) {
    return "";
  }

  const targetPage = card.category ? getPageForCategory(card.category) : null;
  const summary = truncateText(card.plainText || CATEGORY_NOTES[card.category] || "", 118);
  const openTag = targetPage ? "a" : "article";
  const closeTag = targetPage ? "a" : "article";
  const href = targetPage ? ` href="${buildHash(targetPage, card.id)}"` : "";

  return `
    <${openTag} class="linked-card"${href}>
      <img src="${escapeHtml(getCardImage(card))}" alt="${escapeHtml(card.name)}" loading="lazy">
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
            ${linked.map((entry) => renderLinkedCard(entry.label, entry.card)).join("")}
          </div>
        </div>
      ` : ""}
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

  const tierOptionsMarkup = category === "minion" ? `
      <option value="tier_asc">Tier Low To High</option>
      <option value="tier_desc">Tier High To Low</option>
      <option value="attack_desc">Attack High To Low</option>
      <option value="health_desc">Health High To Low</option>
    ` : "";

  return `
      <option value="name_asc">Name A-Z</option>
      <option value="name_desc">Name Z-A</option>
      ${tierOptionsMarkup}
    `;
}

function renderCategoryView() {
  const pageConfig = getCategoryPage();
  if (!pageConfig || pageConfig.category === "hero") {
    refs.libraryView.classList.remove("is-active");
    refs.libraryView.innerHTML = "";
    return;
  }

  const libraryState = getLibraryState(pageConfig.category);
  const results = getVisibleCards(pageConfig.category);
  const { page } = clampPage(results.length, cardsPageSize, libraryState.page);
  libraryState.page = page;
  const startIndex = (page - 1) * cardsPageSize;
  const pageCards = results.slice(startIndex, startIndex + cardsPageSize);

  const routeCard = state.route.id && cardsById.has(state.route.id)
    ? cardsById.get(state.route.id)
    : null;
  const selectedCard = routeCard?.category === pageConfig.category
    ? routeCard
    : results[0] ?? null;
  const hiddenByFilter = Boolean(selectedCard && !results.some((card) => card.id === selectedCard.id));
  const isMinionPage = pageConfig.category === "minion";
  const emptyLabel = pageConfig.label.toLowerCase();

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

          ${isMinionPage ? `
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
  const pageConfig = getCategoryPage("heroes");
  const libraryState = getLibraryState("hero");
  const results = getVisibleCards("hero");
  const { page } = clampPage(results.length, heroesPageSize, libraryState.page);
  libraryState.page = page;
  const startIndex = (page - 1) * heroesPageSize;
  const pageHeroes = results.slice(startIndex, startIndex + heroesPageSize);

  const routeHero = state.route.id && cardsById.has(state.route.id)
    ? cardsById.get(state.route.id)
    : null;
  const selectedHero = routeHero?.category === "hero"
    ? routeHero
    : results[0] ?? null;
  const hiddenByFilter = Boolean(selectedHero && !results.some((hero) => hero.id === selectedHero.id));

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
      Live catalog synced ${escapeHtml(formatSyncDate(catalog.syncedAt))}.
      <span class="separator">•</span>
      <a href="${escapeHtml(catalog.source.page)}" target="_blank" rel="noreferrer">Blizzard Battlegrounds Library</a>
      <span class="separator">•</span>
      <a href="${escapeHtml(catalog.source.api)}?gameMode=battlegrounds&page=1&pageSize=1" target="_blank" rel="noreferrer">Blizzard Cards API</a>
    </p>
    <p>
      Totals in this local build:
      ${typeOptions.map((entry) => `${escapeHtml(entry.label)} ${formatCount(entry.count)}`).join(" • ")}.
    </p>
  `;
}

function render() {
  const previousRoute = state.route;
  const nextRoute = parseHash();
  const routeChanged = previousRoute.page !== nextRoute.page || previousRoute.id !== nextRoute.id;

  state.route = nextRoute;
  renderNav();
  renderBuildsView();
  renderCategoryView();
  renderHeroesView();
  renderFooter();

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
  targetState.sort = "name_asc";
  targetState.page = 1;

  if (category === "minion") {
    targetState.minionType = "all";
    targetState.tier = "all";
  }

  render();
}

function handleClick(event) {
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

window.addEventListener("hashchange", render);
document.addEventListener("click", handleClick);
document.addEventListener("input", handleInput);
document.addEventListener("change", handleChange);

if (!location.hash) {
  navigate("builds");
} else {
  render();
}
