window.createAtlasCommunityController = function createAtlasCommunityController(deps) {
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });

  const state = {
    feedCategory: "all",
    session: null,
    stats: {
      members: 0,
      posts: 0,
      likes: 0,
      buddies: 0,
      messages: 0,
      byCategory: {
        build: 0,
        combo: 0,
        general: 0
      }
    },
    feed: [],
    approvedBuildSubmissions: [],
    approvedComboSubmissions: [],
    mySubmissions: [],
    reviewQueue: [],
    featuredMembers: [],
    selectedProfile: null,
    conversation: [],
    loading: false,
    ready: false,
    error: "",
    notice: "",
    lastLoadedKey: "",
    pendingKey: "",
    currentRouteId: null
  };

  function escape(value) {
    return deps.escapeHtml(value ?? "");
  }

  function getAccountState() {
    return deps.account?.getState?.() ?? {
      ready: false,
      loading: false,
      session: null,
      savedItems: []
    };
  }

  function formatDate(value) {
    if (!value) {
      return "";
    }

    try {
      return dateFormatter.format(new Date(value));
    } catch {
      return value;
    }
  }

  function getAvatarMarkup(user, className = "community-avatar") {
    const initials = String(user.displayName || user.username || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((chunk) => chunk[0]?.toUpperCase() ?? "")
      .join("");

    if (user.avatarUrl) {
      return `
        <span class="${className}">
          <img src="${escape(user.avatarUrl)}" alt="${escape(user.displayName || user.username)}" loading="lazy">
        </span>
      `;
    }

    return `
      <span class="${className} is-fallback">
        <span>${escape(initials || "AT")}</span>
      </span>
    `;
  }

  function categoryLabel(category) {
    return {
      build: "Build Post",
      combo: "Combo Post",
      general: "General Post",
      all: "All Posts"
    }[category] ?? category;
  }

  function submissionTypeLabel(submissionType) {
    return {
      build: "Community Build",
      combo: "Community Combo"
    }[submissionType] ?? submissionType;
  }

  function submissionStatusLabel(status) {
    return {
      pending: "Pending Review",
      approved: "Approved",
      rejected: "Rejected"
    }[status] ?? status;
  }

  function renderPillMarkup(items, { muted = true, className = "" } = {}) {
    const values = (items ?? []).map((item) => String(item || "").trim()).filter(Boolean);
    if (!values.length) {
      return "";
    }

    const pillClassName = [className, muted ? "pill is-muted" : "pill"]
      .filter(Boolean)
      .join(" ");

    return `
      <div class="pill-row">
        ${values.map((value) => `<span class="${pillClassName}">${escape(value)}</span>`).join("")}
      </div>
    `;
  }

  function getLoadKey(routeId) {
    return `${state.feedCategory}:${routeId ?? "feed"}`;
  }

  async function api(path, { method = "GET", body } = {}) {
    const response = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      credentials: "same-origin",
      body: body ? JSON.stringify(body) : undefined
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Request failed.");
    }
    return payload;
  }

  async function load(routeId, { force = false } = {}) {
    const loadKey = getLoadKey(routeId);
    if (!force && state.ready && state.lastLoadedKey === loadKey) {
      return;
    }
    if (state.loading && state.pendingKey === loadKey) {
      return;
    }

    state.loading = true;
    state.error = "";
    state.pendingKey = loadKey;
    state.currentRouteId = routeId ?? null;

    renderIntoLastMount();

    try {
      const params = new URLSearchParams({
        category: state.feedCategory
      });
      if (routeId) {
        params.set("profileId", String(routeId));
      }

      const payload = await api(`/api/community/bootstrap?${params.toString()}`);
      state.session = payload.session;
      state.stats = payload.stats ?? state.stats;
      state.feed = payload.feed ?? [];
      state.approvedBuildSubmissions = payload.approvedBuildSubmissions ?? [];
      state.approvedComboSubmissions = payload.approvedComboSubmissions ?? [];
      state.mySubmissions = payload.mySubmissions ?? [];
      state.reviewQueue = payload.reviewQueue ?? [];
      state.featuredMembers = payload.featuredMembers ?? [];
      state.selectedProfile = payload.selectedProfile ?? null;
      state.conversation = payload.conversation ?? [];
      state.ready = true;
      state.lastLoadedKey = loadKey;
      state.pendingKey = "";
      state.loading = false;
      renderIntoLastMount();
    } catch (error) {
      state.loading = false;
      state.pendingKey = "";
      state.error = error instanceof Error ? error.message : "Failed to load Community.";
      renderIntoLastMount();
    }
  }

  let lastMount = null;
  function renderIntoLastMount() {
    if (lastMount) {
      lastMount.innerHTML = renderMarkup();
    }
  }

  function renderNotice() {
    if (!state.notice && !state.error) {
      return "";
    }

    const body = state.error || state.notice;
    const className = state.error ? "community-alert is-error" : "community-alert";
    return `
      <section class="page-card ${className}">
        <p>${escape(body)}</p>
      </section>
    `;
  }

  function renderAuthSection() {
    if (state.session) {
      return `
        <section class="page-card">
          <div class="section-head">
            <div>
              <p class="eyebrow">Community Tools</p>
              <h2 class="section-title">Post And Profile</h2>
              <p class="filter-helper">Use build and combo posts for strategy writeups. Use general posts for broader discussions, patch reads, or questions.</p>
            </div>
          </div>
          <div class="community-auth-grid">
            <form class="community-form-card" id="community-post-form">
              <span class="detail-label">Create A Post</span>
              <label class="community-field">
                <span class="filter-label">Section</span>
                <select name="category">
                  <option value="build">Builds</option>
                  <option value="combo">Combos</option>
                  <option value="general">General</option>
                </select>
              </label>
              <label class="community-field">
                <span class="filter-label">Title</span>
                <input name="title" type="text" maxlength="120" placeholder="What are you sharing?">
              </label>
              <label class="community-field">
                <span class="filter-label">Post</span>
                <textarea name="body" rows="7" maxlength="4000" placeholder="Write a build guide, combo note, patch thought, or discussion topic."></textarea>
              </label>
              <button class="button-link is-primary" type="submit">Publish Post</button>
            </form>

            <form class="community-form-card" id="community-profile-form">
              <span class="detail-label">Edit Profile</span>
              <label class="community-field">
                <span class="filter-label">Display Name</span>
                <input name="displayName" type="text" maxlength="48" value="${escape(state.session.displayName || "")}">
              </label>
              <label class="community-field">
                <span class="filter-label">Profile Picture URL</span>
                <input name="avatarUrl" type="url" maxlength="280" value="${escape(state.session.avatarUrl || "")}" placeholder="https://...">
              </label>
              <label class="community-field">
                <span class="filter-label">Status</span>
                <input name="statusText" type="text" maxlength="140" value="${escape(state.session.statusText || "")}" placeholder="What are you testing right now?">
              </label>
              <label class="community-field">
                <span class="filter-label">Bio</span>
                <textarea name="bio" rows="5" maxlength="400">${escape(state.session.bio || "")}</textarea>
              </label>
              <div class="result-actions">
                <button class="button-link is-primary" type="submit">Save Profile</button>
                <a class="button-link" href="${deps.buildHash("community", state.session.id)}">View Profile</a>
                <button class="button-link" type="button" data-community-logout="true">Log Out</button>
              </div>
            </form>
          </div>
        </section>
      `;
    }

    return `
      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Join Community</p>
            <h2 class="section-title">Create An Account</h2>
            <p class="filter-helper">Accounts unlock posting, likes, buddies, profile pages, and direct messages.</p>
          </div>
        </div>
        <div class="community-auth-grid">
          <form class="community-form-card" id="community-register-form">
            <span class="detail-label">Register</span>
            <label class="community-field">
              <span class="filter-label">Username</span>
              <input name="username" type="text" maxlength="24" placeholder="tempoqueen">
            </label>
            <label class="community-field">
              <span class="filter-label">Display Name</span>
              <input name="displayName" type="text" maxlength="48" placeholder="Tempo Queen">
            </label>
            <label class="community-field">
              <span class="filter-label">Email</span>
              <input name="email" type="email" maxlength="160" placeholder="you@example.com">
            </label>
            <label class="community-field">
              <span class="filter-label">Password</span>
              <input name="password" type="password" minlength="8" placeholder="At least 8 characters">
            </label>
            <button class="button-link is-primary" type="submit">Create Account</button>
          </form>

          <form class="community-form-card" id="community-login-form">
            <span class="detail-label">Log In</span>
            <label class="community-field">
              <span class="filter-label">Username Or Email</span>
              <input name="identifier" type="text" maxlength="160" placeholder="tempoqueen">
            </label>
            <label class="community-field">
              <span class="filter-label">Password</span>
              <input name="password" type="password" minlength="8" placeholder="Your password">
            </label>
            <button class="button-link is-primary" type="submit">Log In</button>
            <p class="community-helper">Community is database-backed now, so posts, buddies, and messages persist across sessions.</p>
          </form>
        </div>
      </section>
    `;
  }

  function renderLibraryItem(entry) {
    const imageMarkup = entry.imageUrl
      ? `
        <span class="community-library-media">
          <img src="${escape(entry.imageUrl)}" alt="${escape(entry.title)}" loading="lazy">
        </span>
      `
      : `
        <span class="community-library-media is-fallback">
          <span>${escape((entry.title || "AT").slice(0, 2).toUpperCase())}</span>
        </span>
      `;

    return `
      <article class="community-library-item">
        <a class="community-library-link" href="${escape(entry.href)}">
          ${imageMarkup}
          <div class="community-library-copy">
            <span class="detail-label">${escape(entry.groupLabel)}</span>
            <strong>${escape(entry.title)}</strong>
            <span>${escape(entry.subtitle)}</span>
            <p>${escape(entry.summary)}</p>
          </div>
        </a>
        <button
          class="pill-button save-control is-active"
          type="button"
          data-save-item="true"
          data-save-type="${escape(entry.itemType)}"
          data-save-key="${escape(entry.itemKey)}"
        >
          Remove
        </button>
      </article>
    `;
  }

  function renderLibrarySection() {
    const accountState = getAccountState();

    if (!accountState.session) {
      return "";
    }

    const resolvedItems = (accountState.savedItems ?? [])
      .map((item) => deps.resolveSavedItem?.(item.itemType, item.itemKey))
      .filter(Boolean);

    const groupedItems = resolvedItems.reduce((accumulator, item) => {
      if (!accumulator.has(item.groupLabel)) {
        accumulator.set(item.groupLabel, []);
      }
      accumulator.get(item.groupLabel).push(item);
      return accumulator;
    }, new Map());

    return `
      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">My Library</p>
            <h2 class="section-title">Saved Atlas Items</h2>
            <p class="filter-helper">Anything you save from builds, combos, heroes, or catalog pages lands here.</p>
          </div>
        </div>
        ${accountState.loading && !accountState.ready ? `
          <p class="community-helper">Loading your saved library…</p>
        ` : ""}
        ${resolvedItems.length === 0 ? `
          <div class="empty-state">
            <h3>Your Library Is Empty</h3>
            <p>Save builds, combos, heroes, or cards from anywhere in Atlas and they will appear here.</p>
          </div>
        ` : `
          <div class="community-library-grid">
            ${[...groupedItems.entries()].map(([groupLabel, items]) => `
              <article class="community-library-card">
                <div class="community-library-head">
                  <strong>${escape(groupLabel)}</strong>
                  <span class="pill is-muted">${escape(String(items.length))}</span>
                </div>
                <div class="community-library-list">
                  ${items.map((item) => renderLibraryItem(item)).join("")}
                </div>
              </article>
            `).join("")}
          </div>
        `}
      </section>
    `;
  }

  function renderSubmissionDetailSections(submission) {
    const payload = submission.payload ?? {};

    if (submission.submissionType === "build") {
      return `
        <div class="community-submission-stack">
          ${payload.tribe ? renderPillMarkup([payload.tribe], { className: "community-submission-tag" }) : ""}
          ${payload.body ? `
            <article class="community-submission-panel">
              <span class="detail-label">Guide Notes</span>
              <p>${escape(payload.body)}</p>
            </article>
          ` : ""}
          <div class="community-submission-columns">
            <article class="community-submission-panel">
              <span class="detail-label">Core Cards</span>
              ${payload.coreCards?.length
                ? renderPillMarkup(payload.coreCards, { className: "community-submission-tag" })
                : "<p>No core cards listed.</p>"}
            </article>
            <article class="community-submission-panel">
              <span class="detail-label">Support Cards</span>
              ${payload.supportCards?.length
                ? renderPillMarkup(payload.supportCards, { className: "community-submission-tag" })
                : "<p>No support cards listed.</p>"}
            </article>
          </div>
        </div>
      `;
    }

    return `
      <div class="community-submission-stack">
        <article class="community-submission-panel">
          <span class="detail-label">Cards</span>
          ${payload.cards?.length
            ? renderPillMarkup(payload.cards, { className: "community-submission-tag" })
            : "<p>No combo cards listed.</p>"}
        </article>
        ${payload.tags?.length ? `
          <article class="community-submission-panel">
            <span class="detail-label">Tags</span>
            ${renderPillMarkup(payload.tags, { className: "community-submission-tag" })}
          </article>
        ` : ""}
        <div class="community-submission-columns">
          <article class="community-submission-panel">
            <span class="detail-label">Why It Works</span>
            <p>${escape(payload.whyItWorks || "No explanation added yet.")}</p>
          </article>
          <article class="community-submission-panel">
            <span class="detail-label">When To Take It</span>
            <p>${escape(payload.whenToTake || "No timing note added yet.")}</p>
          </article>
          <article class="community-submission-panel">
            <span class="detail-label">Payoff</span>
            <p>${escape(payload.payoff || "No payoff note added yet.")}</p>
          </article>
        </div>
      </div>
    `;
  }

  function renderSubmissionCard(submission, options = {}) {
    const {
      includeReviewMeta = false,
      includeReviewForm = false
    } = options;
    const payload = submission.payload ?? {};
    const statusClassName = `community-status-pill is-${submission.status || "pending"}`;
    const reviewMeta = includeReviewMeta && (submission.reviewNotes || submission.reviewer || submission.reviewedAt)
      ? `
        <div class="community-submission-review-meta">
          ${submission.reviewNotes ? `
            <article class="community-submission-panel">
              <span class="detail-label">Review Notes</span>
              <p>${escape(submission.reviewNotes)}</p>
            </article>
          ` : ""}
          ${submission.reviewer ? `
            <p class="community-helper">
              Reviewed by ${escape(submission.reviewer.displayName || submission.reviewer.username)}
              ${submission.reviewedAt ? `on ${escape(formatDate(submission.reviewedAt))}` : ""}.
            </p>
          ` : ""}
        </div>
      `
      : "";

    const reviewForm = includeReviewForm
      ? `
        <form class="community-review-form" data-community-action="review-submission" data-submission-id="${submission.id}">
          <label class="community-field">
            <span class="filter-label">Decision</span>
            <select name="status">
              <option value="approved">Approve</option>
              <option value="rejected">Reject</option>
            </select>
          </label>
          <label class="community-field">
            <span class="filter-label">Review Notes</span>
            <textarea name="reviewNotes" rows="4" maxlength="400" placeholder="Optional moderation note for the submitter."></textarea>
          </label>
          <button class="button-link is-primary" type="submit">Submit Review</button>
        </form>
      `
      : "";

    return `
      <article class="community-submission-card">
        <div class="community-submission-meta">
          <div class="community-author">
            ${getAvatarMarkup(submission.author)}
            <div class="community-author-copy">
              <strong>${escape(submission.author.displayName)}</strong>
              <span>@${escape(submission.author.username)}</span>
            </div>
          </div>
          <div class="community-post-meta-copy">
            <span class="pill is-muted">${escape(submissionTypeLabel(submission.submissionType))}</span>
            <span class="${statusClassName}">${escape(submissionStatusLabel(submission.status))}</span>
            <span class="community-post-date">${escape(formatDate(submission.createdAt))}</span>
          </div>
        </div>
        <div class="community-post-copy">
          <h3>${escape(submission.title)}</h3>
          <p>${escape(payload.summary || "No summary added yet.")}</p>
        </div>
        ${renderSubmissionDetailSections(submission)}
        ${reviewMeta}
        ${reviewForm}
      </article>
    `;
  }

  function renderSubmissionToolsSection() {
    if (!state.session) {
      return "";
    }

    return `
      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Submit Strategy</p>
            <h2 class="section-title">Community Builds And Combos</h2>
            <p class="filter-helper">Send your build guides and combo packages into the moderation queue. Approved entries appear below as community picks.</p>
          </div>
        </div>
        <div class="community-auth-grid">
          <form class="community-form-card" id="community-build-submission-form">
            <span class="detail-label">Submit A Build</span>
            <label class="community-field">
              <span class="filter-label">Title</span>
              <input name="title" type="text" maxlength="120" placeholder="Greedy Economy Pirates">
            </label>
            <label class="community-field">
              <span class="filter-label">Tribe Or Shell</span>
              <input name="tribe" type="text" maxlength="48" placeholder="Pirate">
            </label>
            <label class="community-field">
              <span class="filter-label">Summary</span>
              <textarea name="summary" rows="3" maxlength="320" placeholder="Explain the shell, what it is trying to do, and why it is useful."></textarea>
            </label>
            <label class="community-field">
              <span class="filter-label">Guide Notes</span>
              <textarea name="body" rows="6" maxlength="4000" placeholder="Write the actual build notes, setup logic, and stability concerns."></textarea>
            </label>
            <label class="community-field">
              <span class="filter-label">Core Cards</span>
              <textarea name="coreCardsText" rows="3" maxlength="400" placeholder="One per line or comma-separated."></textarea>
            </label>
            <label class="community-field">
              <span class="filter-label">Support Cards</span>
              <textarea name="supportCardsText" rows="3" maxlength="400" placeholder="One per line or comma-separated."></textarea>
            </label>
            <button class="button-link is-primary" type="submit">Submit Build For Review</button>
          </form>

          <form class="community-form-card" id="community-combo-submission-form">
            <span class="detail-label">Submit A Combo</span>
            <label class="community-field">
              <span class="filter-label">Title</span>
              <input name="title" type="text" maxlength="120" placeholder="Drakkari Gem Relay">
            </label>
            <label class="community-field">
              <span class="filter-label">Summary</span>
              <textarea name="summary" rows="3" maxlength="320" placeholder="Give the fast summary of the combo and what board it belongs in."></textarea>
            </label>
            <label class="community-field">
              <span class="filter-label">Cards</span>
              <textarea name="cardsText" rows="3" maxlength="320" placeholder="At least two cards. One per line or comma-separated."></textarea>
            </label>
            <label class="community-field">
              <span class="filter-label">Tags</span>
              <input name="tagsText" type="text" maxlength="160" placeholder="economy, end of turn, gems">
            </label>
            <label class="community-field">
              <span class="filter-label">Why It Works</span>
              <textarea name="whyItWorks" rows="4" maxlength="1200" placeholder="Explain the engine."></textarea>
            </label>
            <label class="community-field">
              <span class="filter-label">When To Take It</span>
              <textarea name="whenToTake" rows="4" maxlength="800" placeholder="Explain the timing and board conditions."></textarea>
            </label>
            <label class="community-field">
              <span class="filter-label">Payoff</span>
              <textarea name="payoff" rows="4" maxlength="800" placeholder="Explain what the finished package gives you."></textarea>
            </label>
            <button class="button-link is-primary" type="submit">Submit Combo For Review</button>
          </form>
        </div>
      </section>
    `;
  }

  function renderMySubmissionsSection() {
    if (!state.session) {
      return "";
    }

    return `
      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Submission History</p>
            <h2 class="section-title">My Community Submissions</h2>
            <p class="filter-helper">Track what is pending, what made it through review, and what still needs work.</p>
          </div>
        </div>
        ${state.mySubmissions.length
          ? `<div class="community-submission-grid">${state.mySubmissions.map((submission) => renderSubmissionCard(submission, { includeReviewMeta: true })).join("")}</div>`
          : `
            <div class="empty-state">
              <h3>No Submissions Yet</h3>
              <p>Submit a build or combo and it will show up here while it moves through review.</p>
            </div>
          `}
      </section>
    `;
  }

  function renderReviewQueueSection() {
    if (!state.session?.isAdmin) {
      return "";
    }

    return `
      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Admin Queue</p>
            <h2 class="section-title">Pending Submission Review</h2>
            <p class="filter-helper">Approve or reject community build and combo submissions before they become public picks.</p>
          </div>
        </div>
        ${state.reviewQueue.length
          ? `<div class="community-submission-grid">${state.reviewQueue.map((submission) => renderSubmissionCard(submission, { includeReviewForm: true })).join("")}</div>`
          : `
            <div class="empty-state">
              <h3>Queue Is Clear</h3>
              <p>There are no pending community submissions right now.</p>
            </div>
          `}
      </section>
    `;
  }

  function renderApprovedSubmissionSection(title, eyebrow, helper, submissions) {
    return `
      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">${escape(eyebrow)}</p>
            <h2 class="section-title">${escape(title)}</h2>
            <p class="filter-helper">${escape(helper)}</p>
          </div>
        </div>
        ${submissions.length
          ? `<div class="community-submission-grid">${submissions.map((submission) => renderSubmissionCard(submission)).join("")}</div>`
          : `
            <div class="empty-state">
              <h3>Nothing Approved Yet</h3>
              <p>Approved community submissions will appear here once they clear review.</p>
            </div>
          `}
      </section>
    `;
  }

  function renderApprovedSubmissionsSection() {
    return `
      <div class="community-section-stack">
        ${renderApprovedSubmissionSection(
          "Community Build Picks",
          "Approved Builds",
          "User-created build guides that made it through admin review.",
          state.approvedBuildSubmissions
        )}
        ${renderApprovedSubmissionSection(
          "Community Combo Picks",
          "Approved Combos",
          "User-created combo writeups that are visible to everyone in Community.",
          state.approvedComboSubmissions
        )}
      </div>
    `;
  }

  function renderPostCard(post) {
    return `
      <article class="community-post-card">
        <div class="community-post-meta">
          <div class="community-author">
            ${getAvatarMarkup(post.author)}
            <div class="community-author-copy">
              <strong>${escape(post.author.displayName)}</strong>
              <a href="${deps.buildHash("community", post.author.id)}">@${escape(post.author.username)}</a>
            </div>
          </div>
          <div class="community-post-meta-copy">
            <span class="pill is-muted">${escape(categoryLabel(post.category))}</span>
            <span class="community-post-date">${escape(formatDate(post.createdAt))}</span>
          </div>
        </div>
        <div class="community-post-copy">
          <h3>${escape(post.title)}</h3>
          <p>${escape(post.body)}</p>
        </div>
        <div class="community-post-actions">
          <button class="pill-button${post.viewerHasLiked ? " is-active" : ""}" type="button" data-community-like="${post.id}" data-liked="${post.viewerHasLiked ? "true" : "false"}">
            ${post.viewerHasLiked ? "Unlike" : "Like"} • ${post.likeCount}
          </button>
          <a class="pill-button" href="${deps.buildHash("community", post.author.id)}">View Profile</a>
        </div>
      </article>
    `;
  }

  function renderFeedSection() {
    return `
      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Community Feed</p>
            <h2 class="section-title">Browse Posts</h2>
            <p class="filter-helper">Build and combo posts are meant for strategy content. General posts are for everything else.</p>
          </div>
          <div class="tab-strip">
            ${["all", "build", "combo", "general"].map((category) => `
              <button
                type="button"
                class="tab-button${state.feedCategory === category ? " is-active" : ""}"
                data-community-feed="${category}"
              >
                ${escape(categoryLabel(category))}
              </button>
            `).join("")}
          </div>
        </div>
        ${state.feed.length
          ? `<div class="community-feed-list">${state.feed.map((post) => renderPostCard(post)).join("")}</div>`
          : `
            <div class="empty-state">
              <h3>No Community Posts Yet</h3>
              <p>Create the first post in this section or switch back to another category.</p>
            </div>
          `}
      </section>
    `;
  }

  function renderProfileSection() {
    const profile = state.selectedProfile;
    if (!profile) {
      return "";
    }

    const viewingOwnProfile = Boolean(state.session && state.session.id === profile.id);
    const showMessageComposer = Boolean(state.session && !viewingOwnProfile);

    return `
      <section class="page-card">
        <div class="community-profile-head">
          <div class="community-profile-summary">
            ${getAvatarMarkup(profile, "community-avatar is-large")}
            <div class="community-profile-copy">
              <p class="eyebrow">Profile</p>
              <h2>${escape(profile.displayName)}</h2>
              <p class="community-profile-handle">@${escape(profile.username)}</p>
              <p>${escape(profile.statusText || "No status set yet.")}</p>
              <p>${escape(profile.bio || "No profile bio yet.")}</p>
            </div>
          </div>
          <div class="community-profile-actions">
            <a class="button-link" href="${deps.buildHash("community")}">Back To Feed</a>
            ${showMessageComposer ? `
              <button
                type="button"
                class="button-link${profile.isBuddy ? " is-primary" : ""}"
                data-community-buddy="${profile.id}"
                data-buddy-state="${profile.isBuddy ? "remove" : "add"}"
              >
                ${profile.isBuddy ? "Remove Buddy" : "Add Buddy"}
              </button>
            ` : ""}
          </div>
        </div>

        <div class="community-profile-stats">
          <article class="summary-card">
            <span class="summary-label">Posts</span>
            <strong>${escape(String(profile.postCount || 0))}</strong>
          </article>
          <article class="summary-card">
            <span class="summary-label">Likes Earned</span>
            <strong>${escape(String(profile.likeCount || 0))}</strong>
          </article>
          <article class="summary-card">
            <span class="summary-label">Buddies</span>
            <strong>${escape(String(profile.buddyCount || 0))}</strong>
          </article>
        </div>

        ${profile.posts?.length ? `
          <div class="community-profile-posts">
            <div class="section-head">
              <div>
                <p class="eyebrow">Recent Activity</p>
                <h3 class="section-title">Posts By ${escape(profile.displayName)}</h3>
              </div>
            </div>
            <div class="community-feed-list">
              ${profile.posts.map((post) => renderPostCard(post)).join("")}
            </div>
          </div>
        ` : ""}

        ${showMessageComposer ? `
          <div class="community-message-shell">
            <div class="community-conversation">
              ${state.conversation.length
                ? state.conversation.map((message) => `
                    <article class="community-message${message.sender.id === state.session.id ? " is-mine" : ""}">
                      <span class="detail-label">${escape(message.sender.displayName)}</span>
                      <p>${escape(message.body)}</p>
                      <span class="community-post-date">${escape(formatDate(message.createdAt))}</span>
                    </article>
                  `).join("")
                : `<p class="community-helper">No direct messages yet. Start the conversation.</p>`}
            </div>
            <form class="community-form-card" id="community-message-form" data-recipient-id="${profile.id}">
              <span class="detail-label">Send A Message</span>
              <label class="community-field">
                <span class="filter-label">Private Message</span>
                <textarea name="body" rows="6" maxlength="1000" placeholder="Send a private message to ${escape(profile.displayName)}."></textarea>
              </label>
              <button class="button-link is-primary" type="submit">Send Message</button>
            </form>
          </div>
        ` : ""}
      </section>
    `;
  }

  function renderMembersSection() {
    return `
      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Members</p>
            <h2 class="section-title">Featured Community Profiles</h2>
            <p class="filter-helper">Browse player profiles, follow their posts, and message them directly once you have an account.</p>
          </div>
        </div>
        <div class="community-member-grid">
          ${state.featuredMembers.map((member) => `
            <article class="community-member-card">
              <div class="community-author">
                ${getAvatarMarkup(member)}
                <div class="community-author-copy">
                  <strong>${escape(member.displayName)}</strong>
                  <span>@${escape(member.username)}</span>
                </div>
              </div>
              <p>${escape(member.statusText || "No status set yet.")}</p>
              <div class="pill-row">
                ${deps.renderPillRow([
                  `${member.postCount ?? 0} posts`,
                  `${member.likeCount ?? 0} likes`,
                  `${member.buddyCount ?? 0} buddies`
                ], true)}
              </div>
              <a class="button-link" href="${deps.buildHash("community", member.id)}">Open Profile</a>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderMarkup() {
    const selectedProfile = state.selectedProfile;
    const hasProfileError = state.currentRouteId && !selectedProfile && state.ready && !state.loading;

    return `
      <div class="page-stack">
        <section class="page-hero">
          <div class="page-hero-copy">
            <p class="eyebrow">Atlas Community</p>
            <h1>Community</h1>
            <p class="page-hero-lead">
              Share build guides, combo discoveries, patch takes, profile updates, and direct messages without mixing community content into the official curated board.
            </p>
            <p class="filter-helper">This section is backed by the live Atlas app server, not static catalog data.</p>
          </div>
          <div class="stat-rail">
            <article class="summary-card">
              <span class="summary-label">Members</span>
              <strong>${escape(String(state.stats.members || 0))}</strong>
              <p>Registered community accounts.</p>
            </article>
            <article class="summary-card">
              <span class="summary-label">Posts</span>
              <strong>${escape(String(state.stats.posts || 0))}</strong>
              <p>Build, combo, and general posts.</p>
            </article>
            <article class="summary-card">
              <span class="summary-label">Buddies</span>
              <strong>${escape(String(state.stats.buddies || 0))}</strong>
              <p>Mutual connections between members.</p>
            </article>
          </div>
        </section>

        ${renderNotice()}

        ${hasProfileError ? `
          <div class="empty-state">
            <h3>Profile Not Found</h3>
            <p>The requested community profile does not exist.</p>
          </div>
        ` : ""}

        ${renderAuthSection()}
        ${renderLibrarySection()}
        ${renderSubmissionToolsSection()}
        ${renderMySubmissionsSection()}
        ${renderReviewQueueSection()}
        ${renderApprovedSubmissionsSection()}
        ${renderProfileSection()}
        ${renderFeedSection()}
        ${renderMembersSection()}

        ${state.loading ? `
          <section class="page-card">
            <p>Loading Community…</p>
          </section>
        ` : ""}
      </div>
    `;
  }

  async function refresh(force = true) {
    await load(state.currentRouteId, { force });
  }

  function handleSubmit(event) {
    const form = event.target.closest("form");
    if (!form) {
      return false;
    }

    if (![
      "community-register-form",
      "community-login-form",
      "community-post-form",
      "community-profile-form",
      "community-message-form",
      "community-build-submission-form",
      "community-combo-submission-form"
    ].includes(form.id) && form.dataset.communityAction !== "review-submission") {
      return false;
    }

    event.preventDefault();
    state.notice = "";
    state.error = "";

    void (async () => {
      try {
        const values = Object.fromEntries(new FormData(form).entries());

        if (form.id === "community-register-form") {
          await api("/api/auth/register", { method: "POST", body: values });
          await deps.account?.bootstrap?.({ force: true });
          state.notice = "Account created. You can now post and use the Community tab fully.";
        } else if (form.id === "community-login-form") {
          await api("/api/auth/login", { method: "POST", body: values });
          await deps.account?.bootstrap?.({ force: true });
          state.notice = "Logged in.";
        } else if (form.id === "community-post-form") {
          await api("/api/community/posts", { method: "POST", body: values });
          form.reset();
          state.notice = "Post published.";
        } else if (form.id === "community-build-submission-form") {
          await api("/api/community/submissions", {
            method: "POST",
            body: {
              ...values,
              submissionType: "build"
            }
          });
          form.reset();
          state.notice = "Build submitted for admin review.";
        } else if (form.id === "community-combo-submission-form") {
          await api("/api/community/submissions", {
            method: "POST",
            body: {
              ...values,
              submissionType: "combo"
            }
          });
          form.reset();
          state.notice = "Combo submitted for admin review.";
        } else if (form.id === "community-profile-form") {
          await api("/api/community/profile", { method: "POST", body: values });
          state.notice = "Profile updated.";
        } else if (form.id === "community-message-form") {
          const recipientId = Number(form.dataset.recipientId);
          await api(`/api/community/messages/${recipientId}`, { method: "POST", body: values });
          form.reset();
          state.notice = "Message sent.";
        } else if (form.dataset.communityAction === "review-submission") {
          const submissionId = Number(form.dataset.submissionId);
          await api(`/api/community/submissions/${submissionId}/review`, { method: "POST", body: values });
          form.reset();
          state.notice = "Submission review saved.";
        }

        await refresh(true);
      } catch (error) {
        state.error = error instanceof Error ? error.message : "Community request failed.";
        renderIntoLastMount();
      }
    })();

    return true;
  }

  function handleClick(event) {
    const feedButton = event.target.closest("[data-community-feed]");
    if (feedButton) {
      event.preventDefault();
      state.feedCategory = feedButton.dataset.communityFeed || "all";
      void refresh(true);
      return true;
    }

    const logoutButton = event.target.closest("[data-community-logout]");
    if (logoutButton) {
      event.preventDefault();
      void (async () => {
        try {
          await api("/api/auth/logout", { method: "POST" });
          await deps.account?.bootstrap?.({ force: true });
          state.notice = "Logged out.";
          await refresh(true);
        } catch (error) {
          state.error = error instanceof Error ? error.message : "Logout failed.";
          renderIntoLastMount();
        }
      })();
      return true;
    }

    const likeButton = event.target.closest("[data-community-like]");
    if (likeButton) {
      event.preventDefault();
      void (async () => {
        try {
          const postId = Number(likeButton.dataset.communityLike);
          const method = likeButton.dataset.liked === "true" ? "DELETE" : "POST";
          await api(`/api/community/posts/${postId}/like`, { method });
          await refresh(true);
        } catch (error) {
          state.error = error instanceof Error ? error.message : "Like action failed.";
          renderIntoLastMount();
        }
      })();
      return true;
    }

    const buddyButton = event.target.closest("[data-community-buddy]");
    if (buddyButton) {
      event.preventDefault();
      void (async () => {
        try {
          const profileId = Number(buddyButton.dataset.communityBuddy);
          const method = buddyButton.dataset.buddyState === "remove" ? "DELETE" : "POST";
          await api(`/api/community/buddies/${profileId}`, { method });
          await refresh(true);
        } catch (error) {
          state.error = error instanceof Error ? error.message : "Buddy action failed.";
          renderIntoLastMount();
        }
      })();
      return true;
    }

    return false;
  }

  return {
    render({ isActive, routeId, mount }) {
      lastMount = mount;
      state.currentRouteId = routeId ?? null;

      if (!isActive) {
        mount.innerHTML = "";
        return;
      }

      mount.innerHTML = renderMarkup();
      void load(routeId, { force: !state.ready });
    },
    handleClick,
    handleSubmit
  };
};
