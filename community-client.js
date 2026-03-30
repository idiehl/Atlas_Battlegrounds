window.createAtlasCommunityController = function createAtlasCommunityController(deps) {
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });

  const state = {
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
    adminDashboard: null,
    featuredMembers: [],
    selectedProfile: null,
    conversation: [],
    loading: false,
    ready: false,
    error: "",
    notice: "",
    lastLoadedKey: "",
    pendingKey: "",
    currentRoute: {
      page: "community",
      id: null,
      segments: []
    }
  };

  let lastMount = null;
  let noticeTimeout = 0;

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

  function getActiveSession() {
    return state.session ?? getAccountState().session ?? null;
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

  function clearNotice() {
    state.notice = "";
    if (noticeTimeout) {
      clearTimeout(noticeTimeout);
      noticeTimeout = 0;
    }
  }

  function setNotice(message, duration = 3200) {
    state.notice = message;
    state.error = "";

    if (noticeTimeout) {
      clearTimeout(noticeTimeout);
    }

    noticeTimeout = window.setTimeout(() => {
      noticeTimeout = 0;
      state.notice = "";
      renderIntoLastMount();
    }, duration);
  }

  function setError(message) {
    clearNotice();
    state.error = message;
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

  function categoryLabel(category) {
    return {
      build: "Build Post",
      combo: "Combo Post",
      general: "Forum Post"
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

  function routePageLabel(page) {
    return {
      account: "Account",
      builds: "Builds",
      combos: "Combos",
      community: "Community",
      support: "Support",
      heroes: "Heroes",
      minions: "Minions",
      quests: "Quests",
      rewards: "Rewards",
      anomalies: "Anomalies",
      spells: "Spells",
      trinkets: "Trinkets",
      timewarp: "Timewarp"
    }[page] ?? page;
  }

  function eventLabel(eventType) {
    return {
      route_view: "Route View",
      auth_login: "Login",
      auth_register: "Registration",
      community_post_create: "Forum Post",
      comment_create: "Comment",
      direct_message_create: "Direct Message",
      submission_create: "Submission",
      submission_review: "Submission Review",
      profile_update: "Profile Update",
      admin_user_manage: "User Management",
      password_change: "Password Change"
    }[eventType] ?? eventType;
  }

  function buildHash(page, id = null) {
    return deps.buildHash(page, id);
  }

  function buildHashParts(page, ...parts) {
    return deps.buildHashParts(page, ...parts);
  }

  function navigateParts(page, ...parts) {
    deps.navigateParts(page, ...parts);
  }

  function buildCommunityHash(section = "builds", extra = null) {
    return extra ? buildHashParts("community", section, extra) : buildHashParts("community", section);
  }

  function buildProfileHash(userId) {
    return buildHashParts("community", "profile", userId);
  }

  function buildAccountHash(section = null) {
    return section ? buildHashParts("account", section) : buildHash("account");
  }

  function getCommunitySection(route = state.currentRoute) {
    const [primary = "", secondary = ""] = route?.segments ?? [];

    if (primary === "combos") {
      return secondary === "new" ? "compose-combo" : "combos";
    }

    if (primary === "forum") {
      return secondary === "new" ? "compose-forum" : "forum";
    }

    if (primary === "profile" && route?.id) {
      return "profile";
    }

    return secondary === "new" ? "compose-build" : "builds";
  }

  function getAccountSection(route = state.currentRoute) {
    const session = getActiveSession();
    if (!session) {
      return "auth";
    }

    const requested = route?.segments?.[0] || "profile";
    if (requested === "library" || requested === "security") {
      return requested;
    }
    if (requested === "admin" && session.isAdmin) {
      return "admin";
    }
    return "profile";
  }

  function getLoadRequest(route) {
    if (route.page === "account") {
      const section = getAccountSection(route);
      const params = new URLSearchParams({
        category: "all",
        profile: "self"
      });

      return {
        key: `account:${section}`,
        params
      };
    }

    const section = getCommunitySection(route);
    const params = new URLSearchParams({
      category: section === "forum" || section === "compose-forum" ? "general" : "all"
    });

    if (section === "profile" && route.id) {
      params.set("profileId", String(route.id));
    }

    return {
      key: `community:${section}:${route.id ?? ""}:${params.get("category")}`,
      params
    };
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

  async function load(route, { force = false } = {}) {
    const request = getLoadRequest(route);
    const communitySection = getCommunitySection(route);
    const accountSection = getAccountSection(route);
    if (!force && state.ready && state.lastLoadedKey === request.key) {
      return;
    }
    if (state.loading && state.pendingKey === request.key) {
      return;
    }

    state.loading = true;
    state.pendingKey = request.key;
    state.currentRoute = route;
    if (communitySection === "profile" && state.selectedProfile?.id !== route.id) {
      state.selectedProfile = null;
      state.conversation = [];
    } else if (route.page === "account" && accountSection === "profile") {
      const session = getActiveSession();
      if (!session || state.selectedProfile?.id !== session.id) {
        state.selectedProfile = null;
      }
    }
    renderIntoLastMount();

    try {
      const payload = await api(`/api/community/bootstrap?${request.params.toString()}`);
      state.session = payload.session;
      state.stats = payload.stats ?? state.stats;
      state.feed = payload.feed ?? [];
      state.approvedBuildSubmissions = payload.approvedBuildSubmissions ?? [];
      state.approvedComboSubmissions = payload.approvedComboSubmissions ?? [];
      state.mySubmissions = payload.mySubmissions ?? [];
      state.reviewQueue = payload.reviewQueue ?? [];
      state.adminDashboard = payload.adminDashboard ?? null;
      state.featuredMembers = payload.featuredMembers ?? [];
      state.selectedProfile = payload.selectedProfile ?? null;
      state.conversation = payload.conversation ?? [];
      state.ready = true;
      state.loading = false;
      state.pendingKey = "";
      state.lastLoadedKey = request.key;
      renderIntoLastMount();
    } catch (error) {
      state.loading = false;
      state.pendingKey = "";
      setError(error instanceof Error ? error.message : "Failed to load Atlas social data.");
      renderIntoLastMount();
    }
  }

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

  function renderCommunityTabs(section) {
    const activeKey = section === "combos" || section === "compose-combo"
      ? "combos"
      : section === "forum" || section === "compose-forum"
        ? "forum"
        : section === "profile"
          ? ""
          : "builds";
    const entries = [
      { key: "builds", label: "Community Builds", href: buildCommunityHash("builds") },
      { key: "combos", label: "Community Combos", href: buildCommunityHash("combos") },
      { key: "forum", label: "Forum", href: buildCommunityHash("forum") }
    ];

    return `
      <div class="tab-strip community-route-strip">
        ${entries.map((entry) => `
          <a class="tab-button${activeKey === entry.key ? " is-active" : ""}" href="${entry.href}">
            ${escape(entry.label)}
          </a>
        `).join("")}
      </div>
    `;
  }

  function renderAccountTabs(section, session) {
    if (!session) {
      return "";
    }

    const entries = [
      { key: "profile", label: "Profile", href: buildAccountHash("profile") },
      { key: "library", label: "Library", href: buildAccountHash("library") },
      { key: "security", label: "Security", href: buildAccountHash("security") }
    ];

    if (session.isAdmin) {
      entries.push({ key: "admin", label: "Admin", href: buildAccountHash("admin") });
    }

    return `
      <div class="tab-strip community-route-strip">
        ${entries.map((entry) => `
          <a class="tab-button${section === entry.key ? " is-active" : ""}" href="${entry.href}">
            ${escape(entry.label)}
          </a>
        `).join("")}
      </div>
    `;
  }

  function renderCommunityHero(section) {
    const content = {
      builds: {
        eyebrow: "Atlas Community",
        title: "Community Builds",
        lead: "User-created Battlegrounds build guides that made it through review and are easy to browse separately from the official board.",
        helper: "Post a build from the builds page, then track its approval status from your Account tab."
      },
      combos: {
        eyebrow: "Atlas Community",
        title: "Community Combos",
        lead: "Combo writeups from Atlas members, organized as their own page instead of being mixed into the general forum.",
        helper: "Use this section for real combo packages with cards, timing, and payoff notes."
      },
      forum: {
        eyebrow: "Atlas Community",
        title: "Forum",
        lead: "The general discussion board for patch reads, questions, hero takes, and broader strategy conversation.",
        helper: "Forum posts publish immediately. Builds and combos go through review so the public strategy pages stay useful."
      },
      "compose-build": {
        eyebrow: "Post A Build",
        title: "Submit Community Build",
        lead: "Send a build writeup into the moderation queue from its own page instead of posting it inline on your profile.",
        helper: "Once approved, it appears on the Community Builds page."
      },
      "compose-combo": {
        eyebrow: "Post A Combo",
        title: "Submit Community Combo",
        lead: "Create a combo writeup with cards, timing, and payoff notes from a dedicated submission page.",
        helper: "Approved combos appear on the Community Combos page."
      },
      "compose-forum": {
        eyebrow: "New Forum Post",
        title: "Create Forum Thread",
        lead: "Start a text post for questions, patch reactions, hero thoughts, or broader strategy discussion.",
        helper: "Forum posts publish immediately to the public forum."
      },
      profile: {
        eyebrow: "Community Profile",
        title: "Profile",
        lead: "Public player profiles live separately from the account dashboard so they can feel more like actual social pages.",
        helper: "Browse posts, follow buddies, and message users directly from here."
      }
    }[section];

    const actionHref = {
      builds: buildCommunityHash("builds", "new"),
      combos: buildCommunityHash("combos", "new"),
      forum: buildCommunityHash("forum", "new")
    }[section];
    const actionLabel = {
      builds: "Create a Build",
      combos: "Create a Combo",
      forum: "Create a Post"
    }[section];
    const actionTarget = getActiveSession() ? actionHref : buildAccountHash();
    const heroAside = ["builds", "combos", "forum"].includes(section)
      ? `
        <div class="community-hero-cta">
          <a class="button-link is-primary community-hero-button" href="${actionTarget}">
            ${escape(getActiveSession() ? actionLabel : "Open Account")}
          </a>
        </div>
      `
      : `
        <div class="stat-rail">
          <article class="summary-card">
            <span class="summary-label">Members</span>
            <strong>${escape(String(state.stats.members || 0))}</strong>
            <p>Registered community accounts.</p>
          </article>
          <article class="summary-card">
            <span class="summary-label">Forum Posts</span>
            <strong>${escape(String(state.stats.byCategory?.general || 0))}</strong>
            <p>General discussion threads.</p>
          </article>
          <article class="summary-card">
            <span class="summary-label">Buddies</span>
            <strong>${escape(String(state.stats.buddies || 0))}</strong>
            <p>Mutual connections between members.</p>
          </article>
          ${actionHref ? `
            <article class="summary-card community-action-card">
              <span class="summary-label">Create</span>
              <strong>${escape(actionLabel)}</strong>
              <p>${getActiveSession() ? "Open the dedicated composer." : "Log in from Account before posting."}</p>
              <a class="button-link is-primary" href="${actionTarget}">
                ${escape(getActiveSession() ? actionLabel : "Open Account")}
              </a>
            </article>
          ` : ""}
        </div>
      `;

    return `
      <section class="page-hero community-page-hero${["builds", "combos", "forum"].includes(section) ? " is-feed-page" : ""}">
        <div class="page-hero-copy">
          <p class="eyebrow">${escape(content.eyebrow)}</p>
          <h1>${escape(content.title)}</h1>
          <p class="page-hero-lead">${escape(content.lead)}</p>
          <p class="filter-helper">${escape(content.helper)}</p>
          ${renderCommunityTabs(section)}
        </div>
        ${heroAside}
      </section>
    `;
  }

  function renderAccountHero(section) {
    const session = getActiveSession();
    const profile = state.selectedProfile;

    if (!session) {
      return `
        <section class="page-hero community-page-hero">
          <div class="page-hero-copy">
            <p class="eyebrow">Account</p>
            <h1>Account</h1>
            <p class="page-hero-lead">
              Create an account or log in to save Atlas items, post in Community, manage your profile, and access admin tools.
            </p>
            <p class="filter-helper">Account is the home for auth, your profile settings, library, password changes, and the admin dashboard.</p>
          </div>
          <div class="stat-rail">
            <article class="summary-card">
              <span class="summary-label">Saved Library</span>
              <strong>${escape(String(getAccountState().savedItems?.length || 0))}</strong>
              <p>Builds, combos, heroes, and cards you have saved.</p>
            </article>
            <article class="summary-card">
              <span class="summary-label">Community</span>
              <strong>${escape(String(state.stats.members || 0))}</strong>
              <p>Members currently using Atlas Community.</p>
            </article>
          </div>
        </section>
      `;
    }

    return `
      <section class="page-hero community-page-hero">
        <div class="page-hero-copy">
          <div class="community-profile-summary">
            ${getAvatarMarkup(profile || session, "community-avatar is-large")}
            <div class="community-profile-copy">
              <p class="eyebrow">Account</p>
              <h1>${escape(session.displayName)}</h1>
              <p class="community-profile-handle">@${escape(session.username)}</p>
              <p>${escape((profile?.bio || session.bio || "No profile bio yet."))}</p>
            </div>
          </div>
          ${renderAccountTabs(section, session)}
        </div>
        <div class="stat-rail">
          <article class="summary-card">
            <span class="summary-label">Saved Items</span>
            <strong>${escape(String(getAccountState().savedItems?.length || 0))}</strong>
            <p>Your current library.</p>
          </article>
          <article class="summary-card">
            <span class="summary-label">Submissions</span>
            <strong>${escape(String(state.mySubmissions.length || 0))}</strong>
            <p>Build and combo submissions tied to this account.</p>
          </article>
          <article class="summary-card">
            <span class="summary-label">Access</span>
            <strong>${session.isAdmin ? "Admin" : "Member"}</strong>
            <p>${session.isAdmin ? "This account can review submissions and manage users." : "Standard community account access."}</p>
          </article>
          <article class="summary-card community-action-card">
            <span class="summary-label">Public Page</span>
            <strong>Profile</strong>
            <p>Open the public version of your profile page.</p>
            <div class="community-profile-actions">
              <a class="button-link" href="${buildProfileHash(session.id)}">View Profile</a>
              <button class="button-link" type="button" data-community-logout="true">Log Out</button>
            </div>
          </article>
        </div>
      </section>
    `;
  }

  function renderLoggedOutAccountSection() {
    return `
      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Account Access</p>
            <h2 class="section-title">Register Or Log In</h2>
            <p class="filter-helper">Accounts unlock saving, posting, buddies, profile pages, direct messages, and admin access where applicable.</p>
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
            <p class="community-helper">Successful logins now disappear after a few seconds instead of leaving a stale banner on the page.</p>
          </form>
        </div>
      </section>
    `;
  }

  function renderAccountProfileSection() {
    const session = getActiveSession();
    if (!session) {
      return "";
    }

    return `
      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Profile Settings</p>
            <h2 class="section-title">Edit Profile</h2>
            <p class="filter-helper">Keep your public profile concise. This is the page other Atlas users will see.</p>
          </div>
        </div>
        <form class="community-form-card" id="community-profile-form">
          <label class="community-field">
            <span class="filter-label">Display Name</span>
            <input name="displayName" type="text" maxlength="48" value="${escape(session.displayName || "")}">
          </label>
          <label class="community-field">
            <span class="filter-label">Profile Picture URL</span>
            <input name="avatarUrl" type="url" maxlength="280" value="${escape(session.avatarUrl || "")}" placeholder="https://...">
          </label>
          <label class="community-field">
            <span class="filter-label">Status</span>
            <input name="statusText" type="text" maxlength="140" value="${escape(session.statusText || "")}" placeholder="What are you testing right now?">
          </label>
          <label class="community-field">
            <span class="filter-label">Bio</span>
            <textarea name="bio" rows="5" maxlength="400">${escape(session.bio || "")}</textarea>
          </label>
          <div class="community-profile-actions">
            <button class="button-link is-primary" type="submit">Save Profile</button>
            <a class="button-link" href="${buildProfileHash(session.id)}">View Public Profile</a>
          </div>
        </form>
      </section>
    `;
  }

  function renderSecuritySection() {
    const session = getActiveSession();
    if (!session) {
      return "";
    }

    return `
      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Account Security</p>
            <h2 class="section-title">Change Password</h2>
            <p class="filter-helper">This is the right place to rotate the admin password or update your own member account credentials.</p>
          </div>
        </div>
        <div class="community-security-grid">
          <form class="community-form-card" id="community-password-form">
            <span class="detail-label">Update Password</span>
            <label class="community-field">
              <span class="filter-label">Current Password</span>
              <input name="currentPassword" type="password" minlength="8" placeholder="Current password">
            </label>
            <label class="community-field">
              <span class="filter-label">New Password</span>
              <input name="newPassword" type="password" minlength="8" placeholder="At least 8 characters">
            </label>
            <label class="community-field">
              <span class="filter-label">Confirm New Password</span>
              <input name="confirmPassword" type="password" minlength="8" placeholder="Repeat new password">
            </label>
            <button class="button-link is-primary" type="submit">Update Password</button>
          </form>
        </div>
      </section>
    `;
  }

  function renderAdminEventCard(event) {
    const actorLabel = event.actor?.displayName || event.actor?.username || "Guest";
    const details = [];

    if (event.routePage) {
      details.push(`${routePageLabel(event.routePage)}${event.routeId ? ` / ${event.routeId}` : ""}`);
    }
    if (event.subject?.username) {
      details.push(`target @${event.subject.username}`);
    }
    if (event.meta?.status) {
      details.push(`status ${event.meta.status}`);
    }
    if (event.meta?.role) {
      details.push(`role ${event.meta.role}`);
    }
    if (typeof event.meta?.isDisabled === "boolean") {
      details.push(event.meta.isDisabled ? "suspended" : "active");
    }

    return `
      <article class="community-admin-event-item">
        <div class="community-post-meta">
          <strong>${escape(eventLabel(event.eventType))}</strong>
          <span class="community-post-date">${escape(formatDate(event.createdAt))}</span>
        </div>
        <p>${escape(actorLabel)}${details.length ? ` • ${escape(details.join(" • "))}` : ""}</p>
      </article>
    `;
  }

  function renderAdminOverviewSection() {
    const dashboard = state.adminDashboard;
    if (!getActiveSession()?.isAdmin || !dashboard) {
      return "";
    }

    const overview = dashboard.overview ?? {};
    const routeViews = dashboard.routeViews ?? [];
    const recentEvents = dashboard.recentEvents ?? [];

    return `
      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Admin Dashboard</p>
            <h2 class="section-title">Site Overview</h2>
            <p class="filter-helper">This is app-level Atlas activity, not a third-party analytics suite.</p>
          </div>
        </div>

        <div class="community-admin-overview-grid">
          <article class="summary-card community-admin-metric">
            <span class="summary-label">Views (7d)</span>
            <strong>${escape(String(overview.views7d || 0))}</strong>
            <p>Tracked Atlas route views.</p>
          </article>
          <article class="summary-card community-admin-metric">
            <span class="summary-label">Profiles (7d)</span>
            <strong>${escape(String(overview.profileViews7d || 0))}</strong>
            <p>Public profile opens.</p>
          </article>
          <article class="summary-card community-admin-metric">
            <span class="summary-label">Logins (7d)</span>
            <strong>${escape(String(overview.logins7d || 0))}</strong>
            <p>Successful account logins.</p>
          </article>
          <article class="summary-card community-admin-metric">
            <span class="summary-label">Registrations (7d)</span>
            <strong>${escape(String(overview.registrations7d || 0))}</strong>
            <p>New account creation.</p>
          </article>
          <article class="summary-card community-admin-metric">
            <span class="summary-label">Active Sessions</span>
            <strong>${escape(String(overview.activeSessions || 0))}</strong>
            <p>Sessions that are still valid.</p>
          </article>
          <article class="summary-card community-admin-metric">
            <span class="summary-label">Users</span>
            <strong>${escape(String(overview.activeUsers || 0))}</strong>
            <p>${escape(String(overview.suspendedUsers || 0))} suspended.</p>
          </article>
          <article class="summary-card community-admin-metric">
            <span class="summary-label">Pending Review</span>
            <strong>${escape(String(overview.pendingSubmissions || 0))}</strong>
            <p>Community builds and combos waiting on moderation.</p>
          </article>
          <article class="summary-card community-admin-metric">
            <span class="summary-label">Comments (7d)</span>
            <strong>${escape(String(overview.comments7d || 0))}</strong>
            <p>Official-item comments created this week.</p>
          </article>
        </div>

        <div class="community-admin-breakdown-grid">
          <article class="community-admin-panel">
            <div class="community-post-meta">
              <strong>Views By Page</strong>
              <span class="community-post-date">Last 7 days</span>
            </div>
            ${routeViews.length ? `
              <div class="community-admin-route-list">
                ${routeViews.map((entry) => `
                  <div class="community-admin-route-item">
                    <span>${escape(routePageLabel(entry.page))}</span>
                    <strong>${escape(String(entry.count))}</strong>
                  </div>
                `).join("")}
              </div>
            ` : `<p class="community-helper">No route view events yet.</p>`}
          </article>

          <article class="community-admin-panel">
            <div class="community-post-meta">
              <strong>Recent Activity</strong>
              <span class="community-post-date">Latest events</span>
            </div>
            ${recentEvents.length ? `
              <div class="community-admin-event-list">
                ${recentEvents.map((event) => renderAdminEventCard(event)).join("")}
              </div>
            ` : `<p class="community-helper">No tracked events yet.</p>`}
          </article>
        </div>
      </section>
    `;
  }

  function renderAdminUserCard(user) {
    const session = getActiveSession();
    const viewingSelf = Boolean(session && session.id === user.id);

    return `
      <article class="community-user-card">
        <div class="community-submission-meta">
          <div class="community-author">
            ${getAvatarMarkup(user)}
            <div class="community-author-copy">
              <strong>${escape(user.displayName)}</strong>
              <span>@${escape(user.username)} • ${escape(user.email)}</span>
            </div>
          </div>
          <div class="community-post-meta-copy">
            <span class="pill is-muted">${escape(user.role === "admin" ? "Admin" : "Member")}</span>
            <span class="community-status-pill ${user.isDisabled ? "is-rejected" : "is-approved"}">
              ${user.isDisabled ? "Suspended" : "Active"}
            </span>
          </div>
        </div>

        <div class="community-user-stats">
          <span>${escape(String(user.postCount || 0))} posts</span>
          <span>${escape(String(user.commentCount || 0))} comments</span>
          <span>${escape(String(user.submissionCount || 0))} submissions</span>
          <span>${escape(String(user.activeSessionCount || 0))} sessions</span>
        </div>

        <p class="community-helper">
          Created ${escape(formatDate(user.createdAt))}
          ${user.lastLoginAt ? ` • Last login ${escape(formatDate(user.lastLoginAt))}` : " • No successful login recorded yet"}
        </p>

        <form class="community-review-form" data-community-action="manage-user" data-user-id="${user.id}">
          <div class="community-admin-user-controls">
            <label class="community-field">
              <span class="filter-label">Role</span>
              <select name="role" ${viewingSelf ? "disabled" : ""}>
                <option value="member" ${user.role === "member" ? "selected" : ""}>Member</option>
                <option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin</option>
              </select>
            </label>
            <label class="community-field">
              <span class="filter-label">Account Status</span>
              <select name="accountState" ${viewingSelf ? "disabled" : ""}>
                <option value="active" ${!user.isDisabled ? "selected" : ""}>Active</option>
                <option value="disabled" ${user.isDisabled ? "selected" : ""}>Suspended</option>
              </select>
            </label>
          </div>
          <label class="community-field">
            <span class="filter-label">Admin Notes</span>
            <textarea name="adminNote" rows="4" maxlength="400" placeholder="Internal moderation note for this user.">${escape(user.adminNote || "")}</textarea>
          </label>
          ${viewingSelf ? `<p class="community-helper">Your own admin role and suspension state cannot be changed from this panel.</p>` : ""}
          <button class="button-link is-primary" type="submit">Save User Settings</button>
        </form>
      </article>
    `;
  }

  function renderAdminUsersSection() {
    const dashboard = state.adminDashboard;
    if (!getActiveSession()?.isAdmin || !dashboard) {
      return "";
    }

    const users = dashboard.users ?? [];
    return `
      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Admin Dashboard</p>
            <h2 class="section-title">User Management</h2>
            <p class="filter-helper">Promote members, suspend accounts, and keep internal moderation notes here.</p>
          </div>
        </div>
        ${users.length ? `
          <div class="community-user-grid">
            ${users.map((user) => renderAdminUserCard(user)).join("")}
          </div>
        ` : `
          <div class="empty-state">
            <h3>No Users Found</h3>
            <p>User management data will appear here after the first account is created.</p>
          </div>
        `}
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
            <article class="community-submission-panel">
              <span class="detail-label">Reviewed By</span>
              <p>${escape(submission.reviewer.displayName)}</p>
              ${submission.reviewedAt ? `<span class="community-post-date">${escape(formatDate(submission.reviewedAt))}</span>` : ""}
            </article>
          ` : ""}
        </div>
      `
      : "";

    const reviewForm = includeReviewForm ? `
      <form class="community-review-form" data-community-action="review-submission" data-submission-id="${submission.id}">
        <div class="community-admin-user-controls">
          <label class="community-field">
            <span class="filter-label">Decision</span>
            <select name="status">
              <option value="approved">Approve</option>
              <option value="rejected">Reject</option>
            </select>
          </label>
          <label class="community-field">
            <span class="filter-label">Review Notes</span>
            <textarea name="reviewNotes" rows="3" maxlength="400" placeholder="Optional moderation note for the submitter."></textarea>
          </label>
        </div>
        <button class="button-link is-primary" type="submit">Save Review</button>
      </form>
    ` : "";

    return `
      <article class="community-submission-card">
        <div class="community-submission-meta">
          <div class="community-author">
            ${getAvatarMarkup(submission.author)}
            <div class="community-author-copy">
              <strong>${escape(submission.author.displayName)}</strong>
              <a href="${buildProfileHash(submission.author.id)}">@${escape(submission.author.username)}</a>
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
          <p>${escape(submission.payload?.summary || "No summary provided yet.")}</p>
        </div>
        ${renderSubmissionDetailSections(submission)}
        ${reviewMeta}
        ${reviewForm}
      </article>
    `;
  }

  function renderApprovedSubmissionSection({
    eyebrow,
    title,
    helper,
    items,
    emptyTitle,
    emptyBody,
    actionHref = "",
    actionLabel = "",
    hideHeader = false
  }) {
    return `
      <section class="page-card${hideHeader ? " community-feed-card" : ""}">
        ${hideHeader ? "" : `
          <div class="section-head">
            <div>
              <p class="eyebrow">${escape(eyebrow)}</p>
              <h2 class="section-title">${escape(title)}</h2>
              <p class="filter-helper">${escape(helper)}</p>
            </div>
            ${actionHref ? `
              <a class="button-link is-primary" href="${actionHref}">
                ${escape(actionLabel)}
              </a>
            ` : ""}
          </div>
        `}
        ${items.length ? `
          <div class="community-submission-grid">
            ${items.map((submission) => renderSubmissionCard(submission)).join("")}
          </div>
        ` : `
          <div class="empty-state">
            <h3>${escape(emptyTitle)}</h3>
            <p>${escape(emptyBody)}</p>
          </div>
        `}
      </section>
    `;
  }

  function renderMySubmissionsSection() {
    const session = getActiveSession();
    if (!session) {
      return "";
    }

    return `
      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">My Community Activity</p>
            <h2 class="section-title">My Submissions</h2>
            <p class="filter-helper">Track build and combo submissions that are waiting on approval or already published.</p>
          </div>
        </div>
        ${state.mySubmissions.length ? `
          <div class="community-submission-grid">
            ${state.mySubmissions.map((submission) => renderSubmissionCard(submission, { includeReviewMeta: true })).join("")}
          </div>
        ` : `
          <div class="empty-state">
            <h3>No Submissions Yet</h3>
            <p>Post a community build or combo from the Community section to start your queue.</p>
          </div>
        `}
      </section>
    `;
  }

  function renderReviewQueueSection() {
    if (!getActiveSession()?.isAdmin) {
      return "";
    }

    return `
      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Moderation</p>
            <h2 class="section-title">Review Queue</h2>
            <p class="filter-helper">Pending community build and combo submissions waiting on admin action.</p>
          </div>
        </div>
        ${state.reviewQueue.length ? `
          <div class="community-submission-grid">
            ${state.reviewQueue.map((submission) => renderSubmissionCard(submission, { includeReviewForm: true })).join("")}
          </div>
        ` : `
          <div class="empty-state">
            <h3>Queue Is Clear</h3>
            <p>There are no pending build or combo submissions right now.</p>
          </div>
        `}
      </section>
    `;
  }

  function renderPostCard(post, { showCategory = false } = {}) {
    return `
      <article class="community-post-card">
        <div class="community-post-meta">
          <div class="community-author">
            ${getAvatarMarkup(post.author)}
            <div class="community-author-copy">
              <strong>${escape(post.author.displayName)}</strong>
              <a href="${buildProfileHash(post.author.id)}">@${escape(post.author.username)}</a>
            </div>
          </div>
          <div class="community-post-meta-copy">
            ${showCategory ? `<span class="pill is-muted">${escape(categoryLabel(post.category))}</span>` : ""}
            <span class="community-post-date">${escape(formatDate(post.createdAt))}</span>
          </div>
        </div>
        <div class="community-post-copy">
          <h3>${escape(post.title)}</h3>
          <p>${escape(post.body)}</p>
        </div>
        <div class="community-post-actions">
          <button
            class="button-link${post.viewerHasLiked ? " is-primary" : ""}"
            type="button"
            data-community-like="${post.id}"
            data-liked="${post.viewerHasLiked ? "true" : "false"}"
          >
            Like • ${escape(String(post.likeCount || 0))}
          </button>
          <a class="button-link" href="${buildProfileHash(post.author.id)}">View Profile</a>
        </div>
      </article>
    `;
  }

  function renderForumSection() {
    return `
      <section class="page-card community-feed-card">
        ${state.feed.length ? `
          <div class="community-feed-list">
            ${state.feed.map((post) => renderPostCard(post)).join("")}
          </div>
        ` : `
          <div class="empty-state">
            <h3>No Forum Posts Yet</h3>
            <p>Start the first discussion thread in the Atlas forum.</p>
          </div>
        `}
      </section>
    `;
  }

  function renderPublicProfileSection() {
    const profile = state.selectedProfile;
    if (!profile) {
      if (state.loading) {
        return `
          <section class="page-card">
            <p>Loading profile…</p>
          </section>
        `;
      }
      return `
        <div class="empty-state">
          <h3>Profile Not Found</h3>
          <p>The requested community profile does not exist.</p>
        </div>
      `;
    }

    const session = getActiveSession();
    const viewingOwnProfile = Boolean(session && session.id === profile.id);
    const showMessageComposer = Boolean(session && !viewingOwnProfile);
    const authoredBuilds = state.approvedBuildSubmissions.filter((submission) => submission.author.id === profile.id);
    const authoredCombos = state.approvedComboSubmissions.filter((submission) => submission.author.id === profile.id);

    return `
      <div class="page-stack">
        <section class="page-card community-profile-shell">
          <div class="community-profile-hero">
            ${getAvatarMarkup(profile, "community-avatar is-large")}
            <div class="community-profile-copy">
              <h2>${escape(profile.displayName)}</h2>
              <p class="community-profile-handle">@${escape(profile.username)}</p>
              ${profile.statusText ? `<p class="community-profile-meta">${escape(profile.statusText)}</p>` : ""}
              <p class="community-profile-bio">${escape(profile.bio || "No profile bio yet.")}</p>
            </div>
            <div class="community-profile-actions">
              <a class="button-link" href="${buildCommunityHash("forum")}">Back To Community</a>
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
        </section>
        ${authoredBuilds.length ? renderApprovedSubmissionSection({
          eyebrow: "Community Builds",
          title: `${profile.displayName}'s Builds`,
          helper: "Approved community build guides from this player.",
          items: authoredBuilds,
          emptyTitle: "",
          emptyBody: ""
        }) : ""}

        ${authoredCombos.length ? renderApprovedSubmissionSection({
          eyebrow: "Community Combos",
          title: `${profile.displayName}'s Combos`,
          helper: "Approved community combo writeups from this player.",
          items: authoredCombos,
          emptyTitle: "",
          emptyBody: ""
        }) : ""}

        <section class="page-card">
          <div class="section-head">
            <div>
              <p class="eyebrow">Forum Activity</p>
              <h2 class="section-title">${escape(profile.displayName)}'s Posts</h2>
              <p class="filter-helper">Recent public discussion threads from this account.</p>
            </div>
          </div>
          ${profile.posts?.length ? `
            <div class="community-feed-list">
              ${profile.posts.map((post) => renderPostCard(post, { showCategory: true })).join("")}
            </div>
          ` : `
            <div class="empty-state">
              <h3>No Public Posts Yet</h3>
              <p>This profile has not created any public forum posts yet.</p>
            </div>
          `}
        </section>

        ${showMessageComposer ? `
          <section class="page-card">
            <div class="section-head">
              <div>
                <p class="eyebrow">Direct Messages</p>
                <h2 class="section-title">Message ${escape(profile.displayName)}</h2>
                <p class="filter-helper">Private messages live here, not on the public profile itself.</p>
              </div>
            </div>
            <div class="community-message-shell">
              <div class="community-conversation">
                ${state.conversation.length
                  ? state.conversation.map((message) => `
                      <article class="community-message${message.sender.id === session.id ? " is-mine" : ""}">
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
          </section>
        ` : ""}
      </div>
    `;
  }

  function renderBuildSubmissionFormPage() {
    if (!getActiveSession()) {
      return `
        <section class="page-card">
          <div class="empty-state">
            <h3>Account Required</h3>
            <p>Log in from the Account tab before submitting a community build.</p>
            <a class="button-link is-primary" href="${buildAccountHash()}">Open Account</a>
          </div>
        </section>
      `;
    }

    return `
      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Community Builds</p>
            <h2 class="section-title">Submit A Build</h2>
            <p class="filter-helper">Build submissions go into moderation first, then appear publicly after approval.</p>
          </div>
          <a class="button-link" href="${buildCommunityHash("builds")}">Back To Builds</a>
        </div>
        <form class="community-form-card" id="community-build-submission-form">
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
            <textarea name="body" rows="8" maxlength="4000" placeholder="Walk through the line, timing, and what the board is trying to stabilize with."></textarea>
          </label>
          <label class="community-field">
            <span class="filter-label">Core Cards</span>
            <textarea name="coreCardsText" rows="3" maxlength="400" placeholder="Fleet Admiral Tethys, Brann Bronzebeard"></textarea>
          </label>
          <label class="community-field">
            <span class="filter-label">Support Cards</span>
            <textarea name="supportCardsText" rows="3" maxlength="400" placeholder="Visionary Shipman, Peggy Sturdybone"></textarea>
          </label>
          <button class="button-link is-primary" type="submit">Submit Build</button>
        </form>
      </section>
    `;
  }

  function renderComboSubmissionFormPage() {
    if (!getActiveSession()) {
      return `
        <section class="page-card">
          <div class="empty-state">
            <h3>Account Required</h3>
            <p>Log in from the Account tab before submitting a community combo.</p>
            <a class="button-link is-primary" href="${buildAccountHash()}">Open Account</a>
          </div>
        </section>
      `;
    }

    return `
      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Community Combos</p>
            <h2 class="section-title">Submit A Combo</h2>
            <p class="filter-helper">Use this page for real combo packages, not general discussion threads.</p>
          </div>
          <a class="button-link" href="${buildCommunityHash("combos")}">Back To Combos</a>
        </div>
        <form class="community-form-card" id="community-combo-submission-form">
          <label class="community-field">
            <span class="filter-label">Title</span>
            <input name="title" type="text" maxlength="120" placeholder="Drakkari Gem Relay">
          </label>
          <label class="community-field">
            <span class="filter-label">Summary</span>
            <textarea name="summary" rows="3" maxlength="320" placeholder="Explain the shell at a high level."></textarea>
          </label>
          <label class="community-field">
            <span class="filter-label">Cards</span>
            <textarea name="cardsText" rows="3" maxlength="400" placeholder="Drakkari Enchanter, Gem Day Miner, Prickly Piper"></textarea>
          </label>
          <label class="community-field">
            <span class="filter-label">Tags</span>
            <textarea name="tagsText" rows="2" maxlength="200" placeholder="economy, gem, end of turn"></textarea>
          </label>
          <label class="community-field">
            <span class="filter-label">Why It Works</span>
            <textarea name="whyItWorks" rows="5" maxlength="1200" placeholder="Why the package is real and what makes it worth buying into."></textarea>
          </label>
          <label class="community-field">
            <span class="filter-label">When To Take It</span>
            <textarea name="whenToTake" rows="4" maxlength="800" placeholder="Explain the trigger window or board state that justifies the line."></textarea>
          </label>
          <label class="community-field">
            <span class="filter-label">Payoff</span>
            <textarea name="payoff" rows="4" maxlength="800" placeholder="Explain what the board becomes after the combo is online."></textarea>
          </label>
          <button class="button-link is-primary" type="submit">Submit Combo</button>
        </form>
      </section>
    `;
  }

  function renderForumComposerPage() {
    if (!getActiveSession()) {
      return `
        <section class="page-card">
          <div class="empty-state">
            <h3>Account Required</h3>
            <p>Log in from the Account tab before creating a forum post.</p>
            <a class="button-link is-primary" href="${buildAccountHash()}">Open Account</a>
          </div>
        </section>
      `;
    }

    return `
      <section class="page-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Forum</p>
            <h2 class="section-title">Create Forum Post</h2>
            <p class="filter-helper">Use the forum for questions, patch thoughts, hero takes, and broader strategy discussion.</p>
          </div>
          <a class="button-link" href="${buildCommunityHash("forum")}">Back To Forum</a>
        </div>
        <form class="community-form-card" id="community-post-form">
          <input type="hidden" name="category" value="general">
          <label class="community-field">
            <span class="filter-label">Title</span>
            <input name="title" type="text" maxlength="120" placeholder="What are you sharing?">
          </label>
          <label class="community-field">
            <span class="filter-label">Post</span>
            <textarea name="body" rows="10" maxlength="4000" placeholder="Write a patch thought, question, hero discussion, or general strategy topic."></textarea>
          </label>
          <button class="button-link is-primary" type="submit">Publish Post</button>
        </form>
      </section>
    `;
  }

  function renderCommunityBody(section) {
    if (section === "profile") {
      return renderPublicProfileSection();
    }

    if (section === "compose-build") {
      return renderBuildSubmissionFormPage();
    }

    if (section === "compose-combo") {
      return renderComboSubmissionFormPage();
    }

    if (section === "compose-forum") {
      return renderForumComposerPage();
    }

    if (section === "combos") {
      return renderApprovedSubmissionSection({
        eyebrow: "Approved Combos",
        title: "Community Combo Picks",
        helper: "User-created combo writeups that made it through review.",
        items: state.approvedComboSubmissions,
        emptyTitle: "No Community Combos Yet",
        emptyBody: "Approved community combos will appear here after review.",
        hideHeader: true
      });
    }

    if (section === "forum") {
      return renderForumSection();
    }

    return renderApprovedSubmissionSection({
      eyebrow: "Approved Builds",
      title: "Community Build Picks",
      helper: "User-created build guides that made it through review and now live on their own page.",
      items: state.approvedBuildSubmissions,
      emptyTitle: "No Community Builds Yet",
      emptyBody: "Approved community builds will appear here after review.",
      hideHeader: true
    });
  }

  function renderAccountBody(section) {
    const session = getActiveSession();
    if (!session) {
      return renderLoggedOutAccountSection();
    }

    if (section === "library") {
      return renderLibrarySection();
    }

    if (section === "security") {
      return renderSecuritySection();
    }

    if (section === "admin") {
      return `
        <div class="page-stack">
          ${renderAdminOverviewSection()}
          ${renderAdminUsersSection()}
          ${renderReviewQueueSection()}
        </div>
      `;
    }

    return `
      <div class="page-stack">
        ${renderAccountProfileSection()}
        ${renderMySubmissionsSection()}
      </div>
    `;
  }

  function renderMarkup() {
    const route = state.currentRoute;
    const page = route.page === "account" ? "account" : "community";
    const communitySection = getCommunitySection(route);
    const accountSection = getAccountSection(route);

    return `
      <div class="page-stack">
        ${page === "account" ? renderAccountHero(accountSection) : renderCommunityHero(communitySection)}
        ${renderNotice()}
        ${page === "account" ? renderAccountBody(accountSection) : renderCommunityBody(communitySection)}

        ${state.loading ? `
          <section class="page-card">
            <p>Loading Atlas social content…</p>
          </section>
        ` : ""}
      </div>
    `;
  }

  async function refresh(force = true) {
    await load(state.currentRoute, { force });
  }

  function handleSubmit(event) {
    const form = event.target.closest("form");
    if (!form) {
      return false;
    }

    const supportedFormIds = [
      "community-register-form",
      "community-login-form",
      "community-password-form",
      "community-post-form",
      "community-profile-form",
      "community-message-form",
      "community-build-submission-form",
      "community-combo-submission-form"
    ];
    const supportedActions = new Set(["review-submission", "manage-user"]);

    if (!supportedFormIds.includes(form.id) && !supportedActions.has(form.dataset.communityAction || "")) {
      return false;
    }

    event.preventDefault();
    state.error = "";
    clearNotice();

    void (async () => {
      try {
        const values = Object.fromEntries(new FormData(form).entries());
        let redirect = null;

        if (form.id === "community-register-form") {
          await api("/api/auth/register", { method: "POST", body: values });
          await deps.account?.bootstrap?.({ force: true });
          state.session = getAccountState().session ?? null;
          setNotice("Account created.");
          redirect = { page: "account", parts: ["profile"] };
        } else if (form.id === "community-login-form") {
          await api("/api/auth/login", { method: "POST", body: values });
          await deps.account?.bootstrap?.({ force: true });
          state.session = getAccountState().session ?? null;
          setNotice("Logged in.");
          redirect = { page: "account", parts: ["profile"] };
        } else if (form.id === "community-password-form") {
          if (values.newPassword !== values.confirmPassword) {
            throw new Error("New password and confirmation do not match.");
          }
          await api("/api/auth/password", {
            method: "POST",
            body: {
              currentPassword: values.currentPassword,
              newPassword: values.newPassword
            }
          });
          form.reset();
          setNotice("Password updated.");
        } else if (form.id === "community-post-form") {
          await api("/api/community/posts", { method: "POST", body: values });
          form.reset();
          setNotice("Forum post published.");
          redirect = { page: "community", parts: ["forum"] };
        } else if (form.id === "community-build-submission-form") {
          await api("/api/community/submissions", {
            method: "POST",
            body: {
              ...values,
              submissionType: "build"
            }
          });
          form.reset();
          setNotice("Build submitted for review.");
          redirect = { page: "account", parts: ["profile"] };
        } else if (form.id === "community-combo-submission-form") {
          await api("/api/community/submissions", {
            method: "POST",
            body: {
              ...values,
              submissionType: "combo"
            }
          });
          form.reset();
          setNotice("Combo submitted for review.");
          redirect = { page: "account", parts: ["profile"] };
        } else if (form.id === "community-profile-form") {
          await api("/api/community/profile", { method: "POST", body: values });
          setNotice("Profile updated.");
        } else if (form.id === "community-message-form") {
          const recipientId = Number(form.dataset.recipientId);
          await api(`/api/community/messages/${recipientId}`, { method: "POST", body: values });
          form.reset();
          setNotice("Message sent.");
        } else if (form.dataset.communityAction === "review-submission") {
          const submissionId = Number(form.dataset.submissionId);
          await api(`/api/community/submissions/${submissionId}/review`, { method: "POST", body: values });
          form.reset();
          setNotice("Submission review saved.");
        } else if (form.dataset.communityAction === "manage-user") {
          const userId = Number(form.dataset.userId);
          await api(`/api/admin/users/${userId}`, {
            method: "POST",
            body: {
              role: values.role,
              isDisabled: values.accountState === "disabled",
              adminNote: values.adminNote
            }
          });
          setNotice("User settings updated.");
        }

        if (redirect) {
          navigateParts(redirect.page, ...redirect.parts);
          return;
        }

        await refresh(true);
      } catch (error) {
        setError(error instanceof Error ? error.message : "Community request failed.");
        renderIntoLastMount();
      }
    })();

    return true;
  }

  function handleClick(event) {
    const logoutButton = event.target.closest("[data-community-logout]");
    if (logoutButton) {
      event.preventDefault();
      void (async () => {
        try {
          await api("/api/auth/logout", { method: "POST" });
          await deps.account?.bootstrap?.({ force: true });
          state.session = null;
          state.selectedProfile = null;
          state.mySubmissions = [];
          state.reviewQueue = [];
          state.adminDashboard = null;
          setNotice("Logged out.");
          navigateParts("account");
        } catch (error) {
          setError(error instanceof Error ? error.message : "Logout failed.");
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
          setError(error instanceof Error ? error.message : "Like action failed.");
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
          setError(error instanceof Error ? error.message : "Buddy action failed.");
          renderIntoLastMount();
        }
      })();
      return true;
    }

    return false;
  }

  return {
    render({ isActive, route, mount }) {
      if (!isActive) {
        mount.innerHTML = "";
        if (lastMount === mount) {
          lastMount = null;
        }
        return;
      }

      lastMount = mount;
      state.currentRoute = route;
      mount.innerHTML = renderMarkup();
      void load(route, { force: !state.ready });
    },
    handleClick,
    handleSubmit
  };
};
