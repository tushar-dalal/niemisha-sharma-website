// Shared header, footer and page rendering for Niemisha Sharma's site.
// Content comes from js/store.js: Supabase when connected, otherwise the starter content in js/data.js.
(async function () {
  const page = document.body.dataset.page;
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const qs = (k) => new URLSearchParams(location.search).get(k);
  const preview = qs("preview") === "1";
  let io; // scroll-reveal observer, created on first use
  document.documentElement.classList.add("js");

  const D = await window.Store.load({ drafts: preview });
  const S = D.site || {}, A = D.about || {};
  const SECTIONS = D.sections || [];
  const P = D.works.filter((w) => w.kind === "practice");
  const C = D.works.filter((w) => w.kind === "curating");
  const W = D.posts;
  S.heroImage = S.heroImage || {};
  S.socials = S.socials || [];
  const sectionTitle = (id) => (SECTIONS.find((s) => s.id === id) || {}).title || "";

  const anyPlaceholder = [...P, ...C, ...W, A].some((r) => r.placeholder) || !S.heroImage.src;
  const ph = (r) => (r && r.placeholder ? ` <span class="ph-tag">To select</span>` : "");
  const draft = (r) => (r && r.published === false ? ` <span class="ph-tag">Draft</span>` : "");

  // An image slot: the real image, or a labelled empty box. Never a generated stand-in (brief §06).
  const img = (im, label) => im && im.src
    ? `<div class="img"><img src="${esc(im.src)}" alt="${esc(im.alt || "")}" loading="lazy"></div>`
    : `<div class="img empty"><span>${esc(label || (im && im.kind) || "Image")} · to be supplied</span></div>`;
  const fig = (im) => `<figure class="reveal">${img(im, im.kind)}${im.caption ? `<figcaption>${im.kind ? `<b>${esc(im.kind)}.</b> ` : ""}${esc(im.caption)}</figcaption>` : ""}</figure>`;
  const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const year = (d) => String(d || "").slice(0, 4);
  const statusLabel = { note: "Working note", draft: "Draft", excerpt: "Excerpt" };
  const list = (items) => `<ul class="cv-list">${(items || []).map((x) => `<li><span class="yr">${esc(x.years)}</span><span>${esc(x.text)}</span></li>`).join("")}</ul>`;
  const blocks = (r) => window.Blocks.render(r.blocks);
  const notFound = (back, label) => `<section class="page-head"><a class="crumb" href="${back}">← ${label}</a><h1>This page <em>isn't here.</em></h1><p class="lede">It may have moved. The link above goes back to the index.</p></section>`;

  // ---------- header / footer ----------
  const NAV = [
    ["index.html", "Home", ["home"]],
    ["practice.html", "Practice", ["practice", "project"]],
    ["curating.html", "Curating", ["curating", "exhibition"]],
    ["writing.html", "Writing & Research", ["writing", "entry"]],
    ["about.html", "About", ["about"]],
    ["contact.html", "Contact", ["contact"]],
  ];
  const keep = (href) => (preview ? href + (href.includes("?") ? "&" : "?") + "preview=1" : href);
  $("#head").outerHTML =
    `<a class="skip" href="#main">Skip to content</a>` +
    (preview ? `<div class="draft-bar">Preview: drafts are shown. Visitors only see published items.</div>`
      : anyPlaceholder ? `<div class="draft-bar">Design preview: titles, texts and images marked “To select” are placeholders for Niemisha's real work.</div>` : "") +
    `<header class="site-head"><div class="wrap">
      <a class="mark" href="${keep("index.html")}"><b>${esc(S.name)}</b><small>${esc(S.descriptor)}</small></a>
      <button class="menu-btn" aria-expanded="false" aria-controls="nav">Menu</button>
      <nav class="nav" id="nav" aria-label="Main">${NAV.map(([h, l, p]) => `<a href="${keep(h)}"${p.includes(page) ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
    </div></header>`;
  const cvLink = S.cv ? `<a href="${esc(S.cv)}" download>Download CV${S.cvUpdated ? ` (updated ${esc(S.cvUpdated)})` : ""}</a>` : `<span>CV coming soon</span>`;
  const invite = esc(S.invite || "");
  $("#foot").outerHTML = `<footer class="site-foot"><div class="wrap">
      <div class="invite"><h2>${invite.includes("glad") ? invite.replace("glad", "<em>glad</em>") : invite}</h2><a class="btn line" style="color:#f7f1e7;box-shadow:inset 0 0 0 1px #f7f1e7" href="contact.html">Get in touch →</a></div>
      <div class="foot-grid">
        <div><p class="serif" style="font-size:22px;color:#f7f1e7;margin:0">${esc(S.name)}</p><p class="meta" style="margin:4px 0 16px">${esc(S.descriptor)}</p>
          <a href="mailto:${esc(S.email)}">${esc(S.email)}</a></div>
        <ul>${NAV.map(([h, l]) => `<li><a href="${h}">${l}</a></li>`).join("")}</ul>
        <ul><li>${cvLink}</li>${S.socials.map((s) => `<li><a href="${esc(s.url)}" rel="noopener">${esc(s.label)}</a></li>`).join("")}</ul>
      </div>
      <div class="foot-small"><span>© ${new Date().getFullYear()} ${esc(S.name)}. Images © the artist unless credited otherwise.</span><span>This site uses no tracking or cookies. · <a href="admin/index.html">Admin</a></span></div>
      <div class="powered"><a href="https://devindi.in" target="_blank" rel="noopener" aria-label="Powered by devIndi (opens devindi.in in a new tab)">
        <span>Powered by</span><img src="assets/devindi-wordmark-light.png" alt="devIndi" width="93" height="25"></a></div>
    </div></footer>`;

  const btn = $(".menu-btn"), nav = $("#nav");
  btn.addEventListener("click", () => { const open = nav.classList.toggle("open"); btn.setAttribute("aria-expanded", String(open)); btn.textContent = open ? "Close" : "Menu"; });
  const head = $(".site-head");
  addEventListener("scroll", () => head.classList.toggle("scrolled", scrollY > 8), { passive: true });

  // Page intros are editable in the admin; the HTML text is only the fallback.
  const intro = $("#intro"), introText = S.intros && S.intros[page];
  if (intro && introText) intro.textContent = introText;

  // ---------- shared building blocks ----------
  const SIZES = ["lg", "md offset", "md", "lg offset"]; // rows of 7+5 and 5+7 columns, for varied image scale
  const workTile = (p, i) => `<a class="work reveal ${SIZES[i % 4]}" href="${keep("project.html?id=" + encodeURIComponent(p.slug))}">
      ${img((p.images || [])[0], "Artwork")}
      <div class="info"><h3>${esc(p.title)}${ph(p)}${draft(p)}</h3><p class="meta">${[p.years, sectionTitle(p.section_id)].filter(Boolean).map(esc).join(" · ")}</p></div></a>`;
  const feature = (c) => `<a class="feature reveal" href="${keep("exhibition.html?id=" + encodeURIComponent(c.slug))}">
      ${img((c.images || [])[0], "Installation view")}
      <div><p class="label">${esc(c.role)} · ${esc(c.year)}</p><h3>${esc(c.title)}${ph(c)}${draft(c)}</h3><p>${esc(c.summary)}</p>
        <dl class="facts"><dt>Venue</dt><dd>${[c.venue, c.city].filter(Boolean).map(esc).join(", ")}</dd><dt>Role</dt><dd>${esc(c.role)}</dd></dl>
        <p style="margin:20px 0 0"><span class="more">Read about the exhibition →</span></p></div></a>`;
  const entryHref = (e) => (e.url ? esc(e.url) : keep(`entry.html?slug=${encodeURIComponent(e.slug)}`));
  const entryRow = (e) => `<li class="reveal"><a href="${entryHref(e)}"${e.url ? ' rel="noopener"' : ""}>
      <span class="type">${esc(e.type)}${statusLabel[e.status] ? `<br><span class="tag ${e.status === "draft" ? "draft" : ""}">${statusLabel[e.status]}</span>` : ""}</span>
      <div><h3>${esc(e.title)}${ph(e)}${draft(e)}${e.url ? " ↗" : ""}</h3><p>${esc(e.summary || window.Blocks.text(e.blocks).slice(0, 220))}</p><p class="meta" style="margin-top:6px">${esc(e.context)}</p></div>
      <span class="yr">${year(e.date)}</span></a></li>`;
  const findRef = (r) => {
    const w = D.works.find((x) => x.slug === (r.slug || r.id));
    if (!w) return null;
    return w.kind === "practice"
      ? { href: keep(`project.html?id=${w.slug}`), label: w.title, kind: "Artistic practice" }
      : { href: keep(`exhibition.html?id=${w.slug}`), label: w.title, kind: "Curatorial project" };
  };

  // ---------- pages ----------
  if (page === "home") {
    $("#heroImg").innerHTML = `<figure>${img(S.heroImage, "Hero image")}${S.heroImage.caption ? `<figcaption>${esc(S.heroImage.caption)}</figcaption>` : ""}</figure>`;
    if (S.tagline) $(".hero-title").innerHTML = esc(S.tagline).replace(/^(.*?, )(.*?,)( .*)$/, "$1<em>$2</em>$3");
    if (S.years) $("#years").textContent = "Selected work / " + S.years;
    $("#homeWorks").innerHTML = P.slice(0, 4).map(workTile).join("");
    $("#homeCurating").innerHTML = C.slice(0, 3).map(feature).join("");
    const note = W.find((e) => e.question) || W[0];
    $("#inquiry").innerHTML = note ? `<div><p class="label"><span class="n">04</span>Current inquiry</p>${note.placeholder ? '<span class="ph-tag">To select</span>' : ""}</div>
      <div><blockquote>${esc(note.question || note.summary)}</blockquote><p style="margin-top:24px"><a class="more" href="${entryHref(note)}">Read the note →</a></p></div>` : "";
    $("#homeWriting").innerHTML = W.slice(0, 3).map(entryRow).join("");
    $("#aboutImg").innerHTML = img(A.portrait, "Portrait or studio image (optional)");
    $("#aboutShort").innerHTML = `${esc(A.short)}${ph(A)}`;
  }

  if (page === "practice") {
    // Works are grouped under the gallery sections set in the admin, in the admin's order.
    const groups = SECTIONS.map((s) => ({ ...s, works: P.filter((p) => p.section_id === s.id) })).filter((g) => g.works.length);
    const loose = P.filter((p) => !SECTIONS.some((s) => s.id === p.section_id));
    if (loose.length) groups.push({ id: "other", title: groups.length ? "Other work" : "", description: "", works: loose });
    const bar = $("#filters"), wrap = $("#works");
    const render = (id) => {
      wrap.innerHTML = groups.filter((g) => id === "all" || g.id === id).map((g) => `
        <section class="work-section" id="s-${esc(g.id)}">
          ${g.title ? `<div class="head-row"><div><h2>${esc(g.title)}</h2>${g.description ? `<p class="lede" style="margin-top:12px;color:var(--muted)">${esc(g.description)}</p>` : ""}</div></div>` : ""}
          <div class="works">${g.works.map(workTile).join("")}</div>
        </section>`).join("");
      watch();
    };
    if (groups.length > 1) {
      bar.innerHTML = [{ id: "all", title: "All" }, ...groups].map((g) => `<button class="filter" data-id="${esc(g.id)}" aria-pressed="${g.id === "all"}">${esc(g.title || "Other work")}</button>`).join("");
      bar.addEventListener("click", (e) => {
        const b = e.target.closest(".filter"); if (!b) return;
        bar.querySelectorAll(".filter").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        render(b.dataset.id);
      });
    }
    render("all");
  }

  if (page === "project") {
    const p = P.find((x) => x.slug === qs("id")), el = $("#main");
    if (!p) el.innerHTML = notFound("practice.html", "Practice");
    else {
      document.title = `${p.title} · ${S.name}`;
      const imgs = p.images || [];
      const related = P.filter((x) => x !== p && x.section_id === p.section_id).concat(P.filter((x) => x !== p && x.section_id !== p.section_id)).slice(0, 2);
      el.innerHTML = `<div class="wrap">
        <section class="page-head" style="padding-bottom:0"><a class="crumb" href="${keep("practice.html")}">← Artistic Practice</a></section>
        <div class="detail-head">
          <div><p class="label">${esc(sectionTitle(p.section_id))}</p><h1>${esc(p.title)}${ph(p)}${draft(p)}</h1><p class="lede" style="margin-top:18px">${esc(p.summary)}</p></div>
          <div class="metablock"><dl>${p.years ? `<dt>Year</dt><dd>${esc(p.years)}</dd>` : ""}${p.medium ? `<dt>Medium</dt><dd>${esc(p.medium)}</dd>` : ""}${p.series ? `<dt>Series</dt><dd>${esc(p.series)}</dd>` : ""}</dl></div>
        </div>
        ${imgs.length ? `<div class="lead">${fig(imgs[0])}</div><div class="sequence">${imgs.slice(1).map(fig).join("")}</div>` : ""}
        <section class="reading"><div><p class="label">About the work</p></div>
          <div class="prose">${blocks(p)}
          ${(p.credits || []).length ? `<ul class="credits">${p.credits.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}</div></section>
        ${related.length ? `<section class="related"><div class="head-row"><h2>Related <em>work</em></h2><a class="more" href="${keep("practice.html")}">Back to all work →</a></div>
          <div class="works">${related.map((r, k) => workTile(r, k + 1)).join("")}</div></section>` : ""}
      </div>`;
    }
  }

  if (page === "curating") $("#features").innerHTML = C.map(feature).join("");

  if (page === "exhibition") {
    const c = C.find((x) => x.slug === qs("id")), el = $("#main");
    if (!c) el.innerHTML = notFound("curating.html", "Curatorial Practice");
    else {
      document.title = `${c.title} · ${S.name}`;
      const imgs = c.images || [];
      const writing = W.filter((e) => (e.related || []).some((r) => (r.slug || r.id) === c.slug));
      el.innerHTML = `<div class="wrap">
        <section class="page-head" style="padding-bottom:0"><a class="crumb" href="${keep("curating.html")}">← Curatorial Practice</a></section>
        <div class="detail-head">
          <div><p class="label">${esc(c.role)} · ${esc(c.year)}</p><h1>${esc(c.title)}${ph(c)}${draft(c)}</h1><p class="lede" style="margin-top:18px">${esc(c.summary)}</p></div>
          <div class="metablock"><dl>
            <dt>Role</dt><dd>${esc(c.role)}</dd>${c.dates ? `<dt>Dates</dt><dd>${esc(c.dates)}</dd>` : ""}<dt>Venue</dt><dd>${[c.venue, c.city].filter(Boolean).map(esc).join(", ")}</dd>
            ${(c.artists || []).length ? `<dt>Artists</dt><dd>${c.artists.map(esc).join(", ")}</dd>` : ""}
            ${(c.collaborators || []).length ? `<dt>With</dt><dd>${c.collaborators.map(esc).join(", ")}</dd>` : ""}
          </dl></div>
        </div>
        ${imgs.length ? `<div class="lead">${fig(imgs[0])}</div>` : ""}
        <section class="reading"><div><p class="label">Curatorial text</p></div>
          <div class="prose">${blocks(c)}</div></section>
        <div class="sequence">${imgs.slice(1).map(fig).join("")}</div>
        <section class="reading"><div><p class="label">Credits &amp; links</p></div><div>
          ${(c.credits || []).length ? `<ul class="credits">${c.credits.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="meta">Credits to be added.</p>`}
          ${(c.links || []).map((l) => `<p><a href="${esc(l.url)}" rel="noopener">${esc(l.label)} ↗</a></p>`).join("")}
          ${writing.map((e) => `<p><a href="${entryHref(e)}">${esc(e.type)}: ${esc(e.title)} →</a></p>`).join("")}
        </div></section>
        <section class="related" style="padding-bottom:0"><div class="head-row"><a class="more" href="${keep("curating.html")}">← All curatorial projects</a><a class="more" href="about.html#cv">CV &amp; contact →</a></div></section>
      </div>`;
    }
  }

  if (page === "writing") $("#entries").innerHTML = W.map(entryRow).join("");

  if (page === "entry") {
    const e = W.find((x) => x.slug === qs("slug")), el = $("#main");
    if (!e) el.innerHTML = notFound("writing.html", "Writing & Research");
    else {
      document.title = `${e.title} · ${S.name}`;
      const rel = (e.related || []).map(findRef).filter(Boolean);
      el.innerHTML = `<div class="wrap"><div class="entry">
        <section class="page-head"><a class="crumb" href="${keep("writing.html")}">← Writing &amp; Research</a>
          <p class="label">${esc(e.type)}${statusLabel[e.status] ? ` · <span class="tag ${e.status === "draft" ? "draft" : ""}">${statusLabel[e.status]}</span>` : ""}</p>
          <h1>${esc(e.title)}${ph(e)}${draft(e)}</h1>
          <p class="meta" style="margin-top:16px"><time datetime="${esc(e.date)}">${fmtDate(e.date)}</time>${e.context ? ` · ${esc(e.context)}` : ""}</p></section>
        ${e.cover && e.cover.src ? `<figure class="b-img size-wide entry-cover"><img src="${esc(e.cover.src)}" alt="${esc(e.cover.alt || "")}">${e.cover.caption ? `<figcaption>${esc(e.cover.caption)}</figcaption>` : ""}</figure>` : ""}
        <article class="prose">${e.question ? `<p class="serif" style="font-size:26px;line-height:1.3">${esc(e.question)}</p>` : ""}${blocks(e)}</article>
        ${rel.length ? `<section class="related"><p class="label">Related</p>${rel.map((r) => `<p style="margin:0 0 8px"><span class="meta">${r.kind}:</span> <a href="${r.href}">${esc(r.label)} →</a></p>`).join("")}</section>` : ""}
      </div></div>`;
    }
  }

  if (page === "about") {
    $("#portrait").innerHTML = `<figure>${img(A.portrait, "Portrait or studio image (optional)")}</figure>`;
    $("#bio").innerHTML = `${esc(A.short)}${ph(A)}`;
    $("#practiceText").textContent = A.practice || "";
    $("#curatorialText").textContent = A.curatorial || "";
    $("#education").innerHTML = list(A.education);
    $("#experience").innerHTML = list(A.experience);
    $("#selected").innerHTML = list(A.selected);
    $("#cvBtn").outerHTML = S.cv ? `<a class="btn" href="${esc(S.cv)}" download>Download CV (PDF)</a>` : `<span class="btn line" aria-disabled="true" style="cursor:default">CV coming soon</span>`;
  }

  if (page === "contact") {
    $("#mail").href = "mailto:" + S.email;
    $("#mail").textContent = S.email;
    const form = $("#contactForm"), status = $("#status");
    const fields = ["name", "email", "type", "message"];
    const check = (f) => {
      const el = form[f], v = el.value.trim();
      let msg = "";
      if (!v) msg = "Please fill this in.";
      else if (f === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) msg = "Please enter a valid email address.";
      el.setAttribute("aria-invalid", String(!!msg));
      $("#err-" + f).textContent = msg;
      return !msg;
    };
    fields.forEach((f) => form[f].addEventListener("blur", () => check(f)));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      status.className = "status";
      if (form.website.value) return; // honeypot: bots fill hidden fields
      const ok = fields.map(check).every(Boolean);
      if (!ok) { status.textContent = "Some fields need attention."; status.className = "status bad show"; form.querySelector('[aria-invalid="true"]').focus(); return; }
      const body = `${form.message.value.trim()}\n\n— ${form.name.value.trim()} (${form.email.value.trim()})`;
      location.href = `mailto:${S.email}?subject=${encodeURIComponent(form.type.value + " enquiry")}&body=${encodeURIComponent(body)}`;
      status.textContent = `Your email app should now open with your message ready to send. If it didn't, please write to ${S.email}.`;
      status.className = "status ok show";
    });
  }

  // ---------- subtle reveal ----------
  function watch() {
    const items = document.querySelectorAll(".reveal:not(.in)");
    if (!("IntersectionObserver" in window)) { items.forEach((n) => n.classList.add("in")); return; }
    io = io || new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -5% 0px" });
    items.forEach((n) => io.observe(n));
  }
  watch();
})();
