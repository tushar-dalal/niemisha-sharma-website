// Admin app for Niemisha Sharma's site: sign in, then edit the journal, artworks, gallery sections,
// exhibitions, site pages, About & CV, and the media library. Content is saved through js/store.js.
(function () {
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
  const app = document.getElementById("app");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clone = (o) => JSON.parse(JSON.stringify(o ?? null));
  const today = () => new Date().toISOString().slice(0, 10);
  const fmtDate = (d) => (d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
  const LOCAL = window.Store.mode === "local";

  let api, db, user;
  let dirty = false, currentHash = location.hash, ignoreHash = false, currentSave = null, editor = null;
  let recoveryMode = /type=recovery/.test(location.hash);

  // ---------- small helpers ----------
  let toastTimer;
  function toast(msg, bad) {
    const t = $("#toast"); t.textContent = msg; t.className = "show" + (bad ? " bad" : "");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = ""), bad ? 5000 : 2200);
  }
  function setDirty(v) {
    dirty = v;
    $$(".save-state").forEach((s) => { s.textContent = v ? "Unsaved changes" : "All changes saved"; s.classList.toggle("dirty", v); });
  }
  addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && currentSave) { e.preventDefault(); currentSave(); }
  });
  const loadScript = (src) => new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Couldn't load the Supabase library.")); document.head.appendChild(s);
  });
  const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
  const setPath = (o, p, v) => {
    const ks = p.split("."); let a = o;
    ks.slice(0, -1).forEach((k, i) => { if (a[k] == null || typeof a[k] !== "object") a[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; a = a[k]; });
    a[ks[ks.length - 1]] = v;
  };
  const uniqueSlug = (slug, list, id) => { let s = slug, n = 2; while (list.some((x) => x.slug === s && x.id !== id)) s = `${slug}-${n++}`; return s; };
  const firstImage = (r) => (r.cover && r.cover.src) || ((r.images || []).find((i) => i.src) || {}).src || (window.Blocks.images(r.blocks)[0] || {}).src || "";
  const thumb = (src) => (src ? `<img class="thumb" src="${esc(src)}" alt="">` : `<span class="thumb"></span>`);
  const pill = (pub) => `<span class="pill ${pub ? "pub" : "draft"}">${pub ? "Published" : "Draft"}</span>`;
  async function guard(fn, okMsg) {
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
    catch (err) { console.error(err); toast(err.message || "Something went wrong.", true); return undefined; }
  }

  // Form fields: <input data-f="path.to.value" data-type="bool|lines|pairs">
  function bindFields(root, obj, onChange) {
    $$("[data-f]", root).forEach((el) => {
      const p = el.dataset.f, t = el.dataset.type, v = getPath(obj, p);
      if (t === "bool") el.checked = !!v;
      else if (t === "lines") el.value = (v || []).join("\n");
      else if (t === "pairs") el.value = (v || []).map((x) => `${x.label} | ${x.url}`).join("\n");
      else el.value = v ?? "";
      const ev = el.tagName === "SELECT" || t === "bool" ? "change" : "input";
      el.addEventListener(ev, () => {
        let nv = el.value;
        if (t === "bool") nv = el.checked;
        else if (t === "lines") nv = el.value.split("\n").map((s) => s.trim()).filter(Boolean);
        else if (t === "pairs") nv = el.value.split("\n").map((l) => { const [label, ...rest] = l.split("|"); return { label: (label || "").trim(), url: rest.join("|").trim() }; }).filter((x) => x.label && x.url);
        setPath(obj, p, nv);
        onChange && onChange(p, nv);
      });
    });
    $$("textarea.title-input", root).forEach((ta) => { const fit = () => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; }; ta.addEventListener("input", fit); fit(); });
  }

  // ---------- image picker (upload or choose from the library) ----------
  function pickImages({ multiple = false } = {}) {
    return new Promise((resolve) => {
      const back = document.createElement("div");
      back.className = "modal-back";
      back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${multiple ? "Choose images" : "Choose an image"}">
        <header><h2>${multiple ? "Choose images" : "Choose an image"}</h2><button class="btn quiet sm" data-x>Close</button></header>
        <div class="body">
          <div class="dropzone" id="pz"><p style="margin:0 0 10px">Drop images here, or</p>
            <label class="btn sm line" style="display:inline-flex;cursor:pointer">Upload from your computer<input type="file" accept="image/*" ${multiple ? "multiple" : ""} hidden></label>
            <p class="hint" style="margin:10px 0 0">${LOCAL ? "Preview mode: images are stored in this browser at a reduced size." : "Very large images are resized to 2400px on the long side and saved as WebP."}</p></div>
          <h3 style="margin:22px 0 0">Or choose from your library</h3>
          <div class="media-grid" id="pg"><p class="muted">Loading…</p></div>
        </div>
        <footer><span class="muted small" id="pcount"></span><div style="display:flex;gap:8px"><button class="btn line" data-x>Cancel</button>${multiple ? `<button class="btn" data-use disabled>Add selected</button>` : ""}</div></footer></div>`;
      document.body.appendChild(back);
      const sel = new Map(), grid = $("#pg", back), dz = $("#pz", back), useBtn = $("[data-use]", back);
      let items = [];
      const onKey = (e) => { if (e.key === "Escape") close(null); };
      const close = (v) => { back.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
      document.addEventListener("keydown", onKey);
      const count = () => { $("#pcount", back).textContent = sel.size ? `${sel.size} selected` : ""; if (useBtn) useBtn.disabled = !sel.size; };
      const refresh = async () => {
        items = ((await guard(() => api.listMedia())) || []).filter((m) => /^image\//.test(m.type || "") || /\.(webp|jpe?g|png|gif|avif)$/i.test(m.path));
        grid.innerHTML = items.length
          ? items.map((m) => `<div class="media-item pickable${sel.has(m.path) ? " selected" : ""}" data-path="${esc(m.path)}" tabindex="0" role="button" aria-label="${esc(m.path)}"><img src="${esc(m.url)}" alt="" loading="lazy"></div>`).join("")
          : `<p class="muted">No images yet. Upload some above.</p>`;
      };
      const choose = (el) => {
        const m = items.find((x) => x.path === el.dataset.path); if (!m) return;
        if (!multiple) return close([m]);
        if (sel.has(m.path)) sel.delete(m.path); else sel.set(m.path, m);
        el.classList.toggle("selected"); count();
      };
      grid.addEventListener("click", (e) => { const it = e.target.closest(".media-item"); if (it) choose(it); });
      grid.addEventListener("keydown", (e) => { const it = e.target.closest(".media-item"); if (it && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); choose(it); } });
      back.addEventListener("click", (e) => {
        if (e.target === back || e.target.closest("[data-x]")) close(null);
        else if (e.target.closest("[data-use]")) close([...sel.values()]);
      });
      const upload = async (files) => {
        files = [...files].filter((f) => f.type.startsWith("image/")); if (!files.length) return;
        dz.classList.add("over"); const label = dz.firstElementChild.textContent;
        const up = [];
        for (let i = 0; i < files.length; i++) {
          dz.firstElementChild.textContent = `Uploading ${i + 1} of ${files.length}…`;
          const u = await guard(() => api.upload(files[i])); if (u) up.push(u);
        }
        dz.firstElementChild.textContent = label; dz.classList.remove("over");
        if (!multiple && up[0]) return close([up[0]]);
        up.forEach((u) => sel.set(u.path, u));
        await refresh(); count();
      };
      $("input[type=file]", back).addEventListener("change", (e) => upload(e.target.files));
      dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("over"); });
      dz.addEventListener("dragleave", () => dz.classList.remove("over"));
      dz.addEventListener("drop", (e) => { e.preventDefault(); dz.classList.remove("over"); upload(e.dataTransfer.files); });
      refresh();
    });
  }

  // A single image setting (cover, hero, portrait) stored at `path` on the draft.
  const imgField = (d, path, label = "Choose image") => {
    const im = getPath(d, path);
    return `<div class="imgfield" data-img="${path}">
      <div class="prev">${im && im.src ? `<img src="${esc(im.src)}" alt="">` : "No image yet"}</div>
      <div class="btns"><button type="button" class="btn sm line" data-pick>${im && im.src ? "Replace" : label}</button>${im && im.src ? `<button type="button" class="btn sm quiet" data-clear>Remove</button>` : ""}</div>
      ${im && im.src ? `<label>Caption<input data-f="${path}.caption"></label><label>Description for screen readers<input data-f="${path}.alt" placeholder="What the image shows"></label>` : ""}
    </div>`;
  };
  function wireImgFields(root, d, redraw) {
    root.addEventListener("click", async (e) => {
      const f = e.target.closest(".imgfield"); if (!f) return;
      const path = f.dataset.img;
      if (e.target.closest("[data-pick]")) {
        const res = await pickImages(); if (!res) return;
        setPath(d, path, { ...(getPath(d, path) || {}), src: res[0].url });
        setDirty(true); redraw();
      } else if (e.target.closest("[data-clear]")) {
        setPath(d, path, { src: "", alt: "", caption: "" }); setDirty(true); redraw();
      }
    });
  }

  // An ordered list of images with captions (artwork and exhibition pages).
  const imgList = (d) => `<div class="imglist">${(d.images || []).map((im, i, all) => `<div class="imgrow" data-ii="${i}">
      ${im.src ? `<img src="${esc(im.src)}" alt="">` : `<div class="noimg">${esc(im.kind || "Image")}<br>to be supplied</div>`}
      <div class="fields">
        <div class="fields two"><label>Type<input data-f="images.${i}.kind" placeholder="Artwork, Detail, Installation view…"></label>
          <label>Description for screen readers<input data-f="images.${i}.alt" placeholder="What the image shows"></label></div>
        <label>Caption<input data-f="images.${i}.caption" placeholder="Title, year. Medium, dimensions."></label>
        ${i === 0 ? `<span class="cover-badge">Cover image</span>` : ""}
      </div>
      <div class="ops"><button type="button" class="icon-btn" data-im="up" aria-label="Move up"${i === 0 ? " disabled" : ""}>↑</button><button type="button" class="icon-btn" data-im="down" aria-label="Move down"${i === all.length - 1 ? " disabled" : ""}>↓</button>
        <button type="button" class="icon-btn" data-im="replace" title="${im.src ? "Replace image" : "Add the image"}" aria-label="Replace image">⟳</button><button type="button" class="icon-btn danger" data-im="del" aria-label="Remove image">×</button></div>
    </div>`).join("") || `<p class="empty">No images yet.</p>`}</div>
    <div style="margin-top:12px"><button type="button" class="btn sm line" data-im="add">+ Add images</button></div>`;
  function wireImgList(root, d, redraw) {
    root.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-im]"); if (!b) return;
      d.images = d.images || [];
      const act = b.dataset.im, row = b.closest(".imgrow"), i = row ? +row.dataset.ii : -1;
      if (act === "add") {
        const res = await pickImages({ multiple: true }); if (!res) return;
        d.images.push(...res.map((r) => ({ src: r.url, kind: d.kind === "curating" ? "Installation view" : "Artwork", caption: "", alt: "" })));
      } else if (act === "replace") {
        const res = await pickImages(); if (!res) return; d.images[i].src = res[0].url;
      } else if (act === "del") {
        if (!confirm("Remove this image from the page? (It stays in your media library.)")) return; d.images.splice(i, 1);
      } else {
        const to = i + (act === "up" ? -1 : 1); [d.images[i], d.images[to]] = [d.images[to], d.images[i]];
      }
      setDirty(true); redraw();
    });
  }

  // Ordered rows of { years, text } for the CV.
  const rowsEdit = (d, key, ph) => `<div class="rows-edit">${(d[key] || []).map((r, i, all) => `<div class="r" data-key="${key}" data-ri="${i}">
      <input data-f="${key}.${i}.years" placeholder="Year" aria-label="Year"><input data-f="${key}.${i}.text" placeholder="${esc(ph)}" aria-label="Details">
      <div class="ops"><button type="button" class="icon-btn" data-row="up" aria-label="Move up"${i === 0 ? " disabled" : ""}>↑</button><button type="button" class="icon-btn" data-row="down" aria-label="Move down"${i === all.length - 1 ? " disabled" : ""}>↓</button><button type="button" class="icon-btn danger" data-row="del" aria-label="Remove">×</button></div>
    </div>`).join("")}</div><div style="margin-top:8px"><button type="button" class="btn sm line" data-row="add" data-key="${key}">+ Add a line</button></div>`;
  function wireRows(root, d, redraw) {
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-row]"); if (!b) return;
      const r = b.closest(".r"), key = r ? r.dataset.key : b.dataset.key, list = (d[key] = d[key] || []), i = r ? +r.dataset.ri : -1;
      if (b.dataset.row === "add") list.push({ years: "", text: "" });
      else if (b.dataset.row === "del") list.splice(i, 1);
      else { const to = i + (b.dataset.row === "up" ? -1 : 1); [list[i], list[to]] = [list[to], list[i]]; }
      setDirty(true); redraw();
    });
  }

  // ---------- layout ----------
  const NAV = [
    ["#/", "Overview", "◎", "overview"], ["#/journal", "Journal", "✎", "journal"], ["#/artworks", "Artworks", "▣", "artworks"],
    ["#/sections", "Gallery sections", "▤", "sections"], ["#/curating", "Curating", "◇", "curating"],
    ["#/pages", "Site & pages", "⚙", "pages"], ["#/about", "About & CV", "☺", "about"], ["#/media", "Media library", "▦", "media"],
  ];
  function shell(active, html) {
    app.className = "";
    app.innerHTML = `<div class="shell">
      <aside class="sidebar" id="sidebar">
        <div class="brand"><b>${esc((db.site && db.site.name) || "Niemisha Sharma")}</b><span>Site editor</span></div>
        ${NAV.map(([h, l, i, k]) => `<a class="nav-item" href="${h}"${k === active ? ' aria-current="page"' : ""}><i aria-hidden="true">${i}</i>${l}</a>`).join("")}
        <div class="sep"></div>
        <a class="nav-item" href="../index.html${LOCAL ? "" : ""}" target="_blank" rel="noopener"><i aria-hidden="true">↗</i>View the site</a>
        <div class="foot"><span>Signed in as<br>${esc(user.email)}</span><button type="button" id="signOut">Sign out</button></div>
      </aside>
      <div class="main">
        <div class="topbar"><b>Site editor</b><button type="button" id="menuBtn" aria-controls="sidebar">Menu</button></div>
        ${LOCAL ? `<div class="mode-bar"><b>Preview mode.</b> Changes are saved only in this browser on this computer. Connect Supabase (see README) to edit the live site.</div>` : ""}
        <div class="content">${html}</div>
      </div></div>`;
    $("#signOut").onclick = async () => {
      if (dirty && !confirm("You have unsaved changes. Sign out anyway?")) return;
      dirty = false; await api.signOut(); renderLogin();
    };
    $("#menuBtn").onclick = () => $("#sidebar").classList.toggle("open");
    return $(".content");
  }
  const keepScroll = (fn) => { const y = scrollY; fn(); scrollTo(0, y); };
  function go(hash) { dirty = false; if (location.hash === hash) route(); else location.hash = hash; }

  // ---------- router ----------
  async function route() {
    currentSave = null; editor = null;
    const h = location.hash || "#/";
    const [path, query] = h.slice(1).split("?");
    const [, sec = "", id = ""] = path.split("/");
    const q = new URLSearchParams(query || "");
    if (!db.seeded && sec !== "") { history.replaceState(null, "", "#/"); currentHash = "#/"; return viewOverview(); }
    try {
      switch (sec) {
        case "": return viewOverview();
        case "journal": return id ? viewPost(id) : viewPosts();
        case "artworks": return id ? viewWork("practice", id, q) : viewWorks("practice");
        case "curating": return id ? viewWork("curating", id, q) : viewWorks("curating");
        case "sections": return viewSections();
        case "pages": return viewSite();
        case "about": return viewAbout();
        case "media": return viewMedia();
        default: return go("#/");
      }
    } catch (err) {
      console.error(err);
      shell("", `<div class="card"><h2>Something went wrong</h2><p>${esc(err.message)}</p><a class="btn line" href="#/">Back to overview</a></div>`);
    }
  }
  addEventListener("hashchange", () => {
    if (ignoreHash) { ignoreHash = false; return; }
    if (!user || !location.hash.startsWith("#/")) return;
    if (dirty && !confirm("You have unsaved changes. Leave without saving?")) { ignoreHash = true; location.hash = currentHash; return; }
    dirty = false; currentHash = location.hash; scrollTo(0, 0); route();
  });

  // ---------- overview ----------
  function viewOverview() {
    if (!db.seeded) {
      const c = shell("overview", `<div class="page-title"><div><h1>Welcome</h1><p>The site isn't using the editor yet. Choose how to start. You can change everything afterwards.</p></div></div>
        <div class="card"><h2>Start from the current site</h2><p>Copies the current pages into the editor, including the placeholder entries marked “To select”, so you can replace them one by one.</p><button class="btn" id="seed">Import the current site</button></div>
        <div class="card"><h2>Start empty</h2><p>Keeps the site name, page texts and About page, but starts with no artworks, exhibitions or journal entries.</p><button class="btn line" id="empty">Start with an empty site</button></div>`);
      $("#seed", c).onclick = async (e) => { e.target.disabled = true; await guard(() => api.importStarter(), "Imported"); await reload(); route(); };
      $("#empty", c).onclick = async (e) => {
        e.target.disabled = true;
        const s = window.Store.fromStatic();
        await guard(async () => { await api.saveContent("site", s.site); await api.saveContent("about", s.about); }, "Ready");
        await reload(); route();
      };
      return;
    }
    const P = db.works.filter((w) => w.kind === "practice"), C = db.works.filter((w) => w.kind === "curating");
    const drafts = [...db.posts, ...db.works].filter((x) => !x.published).length;
    const recent = [...db.posts.map((p) => ({ ...p, _h: `#/journal/${p.id}`, _k: "Journal" })), ...db.works.map((w) => ({ ...w, _h: `#/${w.kind === "practice" ? "artworks" : "curating"}/${w.id}`, _k: w.kind === "practice" ? "Artwork" : "Exhibition" }))]
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""))).slice(0, 6);
    shell("overview", `<div class="page-title"><div><h1>Hello${db.site.name ? ", " + esc(db.site.name.split(" ")[0]) : ""}</h1><p>Everything on the site can be changed from here. Changes go live as soon as you save an item that's set to Published.</p></div>
        <div class="actions"><a class="btn" href="#/journal/new">New journal entry</a><a class="btn line" href="#/artworks/new">Add artwork</a></div></div>
      <div class="stats">
        <a class="stat" href="#/journal"><b>${db.posts.length}</b><span>Journal entries</span></a>
        <a class="stat" href="#/artworks"><b>${P.length}</b><span>Artworks</span></a>
        <a class="stat" href="#/sections"><b>${db.sections.length}</b><span>Gallery sections</span></a>
        <a class="stat" href="#/curating"><b>${C.length}</b><span>Exhibitions</span></a>
        <div class="stat"><b>${drafts}</b><span>Drafts (not on the site)</span></div>
      </div>
      <div class="card"><h2>Recently edited</h2>${recent.length ? `<ul class="rows">${recent.map((r) => `<li>${thumb(firstImage(r))}<div><a class="title" href="${r._h}">${esc(r.title || "Untitled")}</a><div class="sub">${r._k}${r.updated_at ? " · " + fmtDate(String(r.updated_at).slice(0, 10)) : ""}</div></div><div class="ops">${pill(r.published)}</div></li>`).join("")}</ul>` : `<p class="muted">Nothing yet.</p>`}</div>`);
  }

  // ---------- journal ----------
  const POST_TYPES = ["Journal", "Essay", "Research note", "Catalogue text", "Talk", "Publication", "Interview"];
  const POST_LABELS = [["published", "No label"], ["note", "Working note"], ["excerpt", "Excerpt"], ["draft", "Draft text"]];
  function viewPosts() {
    shell("journal", `<div class="page-title"><div><h1>Journal</h1><p>Writing, research notes and catalogue texts. Shown on the Writing &amp; Research page, newest first.</p></div>
      <div class="actions"><a class="btn" href="#/journal/new">New entry</a></div></div>
      <div class="card">${db.posts.length ? `<ul class="rows">${db.posts.map((p) => `<li>${thumb(firstImage(p))}
        <div><a class="title" href="#/journal/${p.id}">${esc(p.title || "Untitled")}</a><div class="sub">${esc(p.type || "")} · ${fmtDate(p.date)}</div></div>
        <div class="ops">${pill(p.published)}<a class="btn sm line" href="#/journal/${p.id}">Edit</a></div></li>`).join("")}</ul>` : `<p class="empty">No entries yet. <a href="#/journal/new">Write the first one.</a></p>`}</div>`);
  }

  function publishCard(d, isNew, what) {
    return `<div class="card"><div class="publish-row">${pill(d.published)}<span class="save-state">${isNew ? "Not saved yet" : "All changes saved"}</span></div>
      <label class="check"><input type="checkbox" data-f="published" data-type="bool"> Published, visible on the site</label>
      <div class="stack" style="margin-top:14px">
        <button type="button" class="btn wide" id="save">Save</button>
        <button type="button" class="btn line wide" id="preview">Save and preview</button>
        ${isNew ? "" : `<button type="button" class="btn danger wide" id="del">Delete this ${what}</button>`}
      </div><p class="hint" style="margin:10px 0 0">Tip: Ctrl+S saves.</p></div>`;
  }
  function wirePublish(c, { save, previewUrl, del }) {
    currentSave = save;
    $("#save", c).onclick = save;
    $("#preview", c).onclick = async () => {
      const w = window.open("about:blank", "_blank");
      const saved = await save();
      if (saved && w) w.location = previewUrl(saved); else if (w) w.close();
    };
    const d = $("#del", c); if (d) d.onclick = del;
  }
  const onField = (c) => (p, v) => {
    setDirty(true);
    if (p === "published") $(".publish-row .pill", c).outerHTML = pill(v);
  };

  function viewPost(id) {
    const isNew = id === "new";
    const orig = isNew ? null : db.posts.find((p) => p.id === id);
    if (!isNew && !orig) return go("#/journal");
    const d = isNew
      ? { id: window.Store.uid(), slug: "", published: false, date: today(), position: 0, title: "", type: "Journal", status: "published", context: "", url: "", summary: "", question: "", cover: null, blocks: [], related: [] }
      : clone(orig);
    const works = db.works;
    const draw = () => keepScroll(() => {
      const c = shell("journal", `<a class="back" href="#/journal">← All journal entries</a>
        <div class="edit"><div>
          <div class="card"><textarea class="title-input" data-f="title" rows="1" placeholder="Title"></textarea>
            <label style="margin-top:12px">Excerpt <span class="hint">One or two sentences shown in lists. If left empty, the start of the text is used.</span><textarea data-f="summary" rows="2"></textarea></label></div>
          <div class="card"><div class="card-head"><h2>Text and images</h2><span class="hint">Hover a block for its tools · drag ⠿ to move · + adds a block between</span></div><div id="ed"></div></div>
        </div>
        <div class="side">
          ${publishCard(d, isNew, "entry")}
          <div class="card"><h3>Details</h3><div class="fields">
            <label>Date<input type="date" data-f="date"></label>
            <label>Type<select data-f="type">${POST_TYPES.map((t) => `<option>${t}</option>`).join("")}${POST_TYPES.includes(d.type) ? "" : `<option>${esc(d.type)}</option>`}</select></label>
            <label>Label on the entry<select data-f="status">${POST_LABELS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select><span class="hint">Marks working notes and excerpts so they aren't mistaken for finished texts.</span></label>
            <label>Published in / context<input data-f="context" placeholder="Publication, event, or Working note"></label>
            <label>Web address<input data-f="slug" placeholder="Made from the title"><span class="hint">entry.html?slug=${esc(d.slug || "…")}</span></label>
            <label>Full text lives elsewhere?<input data-f="url" placeholder="https://…"><span class="hint">If set, the entry links straight to that page.</span></label>
          </div></div>
          <div class="card"><h3>Cover image</h3>${imgField(d, "cover", "Choose a cover image")}</div>
          <div class="card"><h3>Research question</h3><label><span class="hint">Optional. Shown large at the top of the entry, and on the home page under “Current inquiry”.</span><textarea data-f="question" rows="3"></textarea></label></div>
          <div class="card"><h3>Related work</h3>${works.length ? `<div class="stack">${works.map((w) => `<label class="check"><input type="checkbox" data-rel="${esc(w.slug)}" data-kind="${w.kind}"${(d.related || []).some((r) => (r.slug || r.id) === w.slug) ? " checked" : ""}> ${esc(w.title || "Untitled")} <span class="hint">${w.kind === "practice" ? "artwork" : "exhibition"}</span></label>`).join("")}</div>` : `<p class="muted small">No artworks or exhibitions yet.</p>`}</div>
        </div></div>`);
      bindFields(c, d, onField(c));
      wireImgFields(c, d, draw);
      c.addEventListener("change", (e) => {
        if (!e.target.dataset.rel) return;
        d.related = $$("[data-rel]:checked", c).map((x) => ({ kind: x.dataset.kind, slug: x.dataset.rel })); setDirty(true);
      });
      editor = new window.BlockEditor($("#ed", c), d.blocks, { onChange: (b) => { d.blocks = b; setDirty(true); }, pickImages, upload: (f) => api.upload(f) });
      wirePublish(c, {
        save: () => savePost(d, isNew),
        previewUrl: (s) => `../entry.html?slug=${encodeURIComponent(s.slug)}&preview=1`,
        del: async () => {
          if (!confirm(`Delete “${d.title || "this entry"}”? This can't be undone.`)) return;
          if (await guard(() => api.deletePost(d.id), "Deleted") !== undefined) { db.posts = db.posts.filter((p) => p.id !== d.id); go("#/journal"); }
        },
      });
      setDirty(dirty);
    });
    draw();
  }
  async function savePost(d, isNew) {
    if (!String(d.title || "").trim()) { toast("Add a title first.", true); return null; }
    if (editor) d.blocks = editor.value;
    d.slug = uniqueSlug(window.Store.slugify(d.slug || d.title), db.posts, d.id);
    d.placeholder = false;
    const saved = await guard(() => api.savePost(d), "Saved");
    if (!saved) return null;
    db.posts = db.posts.filter((p) => p.id !== saved.id).concat(saved).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    setDirty(false);
    if (isNew) { ignoreHash = true; location.hash = `#/journal/${saved.id}`; currentHash = location.hash; viewPost(saved.id); }
    else $$("[data-f=slug]").forEach((el) => (el.value = saved.slug));
    return saved;
  }

  // ---------- artworks & exhibitions ----------
  function viewWorks(kind) {
    const practice = kind === "practice";
    const all = db.works.filter((w) => w.kind === kind);
    const groups = practice
      ? db.sections.map((s) => ({ s, items: all.filter((w) => w.section_id === s.id) })).concat([{ s: null, items: all.filter((w) => !db.sections.some((s) => s.id === w.section_id)) }]).filter((g) => g.s || g.items.length)
      : [{ s: null, items: all }];
    const row = (w, i, list) => `<li data-id="${w.id}">${thumb(firstImage(w))}
      <div><a class="title" href="#/${practice ? "artworks" : "curating"}/${w.id}">${esc(w.title || "Untitled")}</a><div class="sub">${esc([practice ? w.years : w.role, practice ? w.medium : [w.venue, w.year].filter(Boolean).join(", ")].filter(Boolean).join(" · "))}</div></div>
      <div class="ops">${pill(w.published)}<button class="icon-btn" data-move="up" aria-label="Move up"${i === 0 ? " disabled" : ""}>↑</button><button class="icon-btn" data-move="down" aria-label="Move down"${i === list.length - 1 ? " disabled" : ""}>↓</button></div></li>`;
    const c = shell(practice ? "artworks" : "curating", `<div class="page-title"><div><h1>${practice ? "Artworks" : "Curating"}</h1>
        <p>${practice ? "Artworks and series, grouped by the sections they appear under on the Practice page. Use the arrows to change the order." : "Exhibitions and curatorial projects, in the order they appear on the Curating page."}</p></div>
        <div class="actions">${practice ? `<a class="btn line" href="#/sections">Manage sections</a>` : ""}<a class="btn" href="#/${practice ? "artworks" : "curating"}/new">${practice ? "Add artwork" : "Add exhibition"}</a></div></div>
      ${groups.map((g) => `<div class="card" data-group="${g.s ? g.s.id : ""}"><div class="card-head"><h2>${g.s ? esc(g.s.title) : practice ? "Not in a section" : "All exhibitions"}</h2>
          ${practice && g.s ? `<a class="btn sm line" href="#/artworks/new?section=${g.s.id}">+ Add to this section</a>` : ""}</div>
        ${g.items.length ? `<ul class="rows">${g.items.map(row).join("")}</ul>` : `<p class="empty">Nothing here yet.</p>`}</div>`).join("") || `<p class="empty">Nothing yet.</p>`}`);
    c.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-move]"); if (!b) return;
      const id = b.closest("li").dataset.id, g = groups.find((x) => x.items.some((w) => w.id === id)), i = g.items.findIndex((w) => w.id === id), to = i + (b.dataset.move === "up" ? -1 : 1);
      [g.items[i], g.items[to]] = [g.items[to], g.items[i]];
      const ids = groups.flatMap((x) => x.items.map((w) => w.id));
      ids.forEach((wid, n) => { db.works.find((w) => w.id === wid).position = n; });
      db.works.sort((a, b2) => a.position - b2.position);
      await guard(() => api.setPositions("works", ids), "Order saved");
      keepScroll(() => viewWorks(kind));
    });
  }

  function viewWork(kind, id, q) {
    const practice = kind === "practice", base = practice ? "#/artworks" : "#/curating";
    const isNew = id === "new";
    const orig = isNew ? null : db.works.find((w) => w.id === id && w.kind === kind);
    if (!isNew && !orig) return go(base);
    const maxPos = Math.max(-1, ...db.works.map((w) => w.position || 0));
    const d = isNew ? (practice
      ? { id: window.Store.uid(), slug: "", kind, section_id: q.get("section") || (db.sections[0] || {}).id || null, position: maxPos + 1, published: false, title: "", summary: "", years: "", medium: "", series: "", images: [], blocks: [], credits: [] }
      : { id: window.Store.uid(), slug: "", kind, section_id: null, position: maxPos + 1, published: false, title: "", summary: "", role: "Curator", year: "", dates: "", venue: "", city: "", artists: [], collaborators: [], images: [], blocks: [], credits: [], links: [] })
      : clone(orig);
    const draw = () => keepScroll(() => {
      const details = practice
        ? `<label>Gallery section<select data-f="section_id"><option value="">Not in a section</option>${db.sections.map((s) => `<option value="${s.id}">${esc(s.title)}</option>`).join("")}<option value="__new">+ New section…</option></select></label>
           <label>Year or years<input data-f="years" placeholder="2025 or 2023–2025"></label>
           <label>Medium and dimensions<input data-f="medium" placeholder="Gouache on paper, 40 × 50 cm"></label>
           <label>Series <span class="hint">optional</span><input data-f="series"></label>
           <label>Credits <span class="hint">one per line</span><textarea data-f="credits" data-type="lines" rows="3" placeholder="Photography: name"></textarea></label>`
        : `<label>Your role<input data-f="role" list="roles"><datalist id="roles"><option>Curator</option><option>Co-curator</option><option>Curatorial assistant</option><option>Contributor</option></datalist><span class="hint">Use the accurate term: curator, co-curator, assistant…</span></label>
           <div class="fields two"><label>Year<input data-f="year"></label><label>City<input data-f="city"></label></div>
           <label>Dates<input data-f="dates" placeholder="12 March – 30 April 2026"></label>
           <label>Venue<input data-f="venue"></label>
           <label>Artists <span class="hint">one per line</span><textarea data-f="artists" data-type="lines" rows="3"></textarea></label>
           <label>Collaborators <span class="hint">one per line</span><textarea data-f="collaborators" data-type="lines" rows="2"></textarea></label>
           <label>Credits <span class="hint">one per line</span><textarea data-f="credits" data-type="lines" rows="3" placeholder="Photography: name"></textarea></label>
           <label>Links <span class="hint">one per line, as: Label | https://…</span><textarea data-f="links" data-type="pairs" rows="2" placeholder="Press release | https://…"></textarea></label>`;
      const c = shell(practice ? "artworks" : "curating", `<a class="back" href="${base}">← ${practice ? "All artworks" : "All exhibitions"}</a>
        <div class="edit"><div>
          <div class="card"><textarea class="title-input" data-f="title" rows="1" placeholder="${practice ? "Artwork or series title" : "Exhibition title"}"></textarea>
            <label style="margin-top:12px">Short introduction <span class="hint">One or two plain sentences, shown under the title and in lists.</span><textarea data-f="summary" rows="2"></textarea></label></div>
          <div class="card"><div class="card-head"><h2>Images</h2><span class="hint">The first image is the cover. They appear in this order, with captions.</span></div><div id="imgs">${imgList(d)}</div></div>
          <div class="card"><div class="card-head"><h2>${practice ? "About the work" : "Curatorial text"}</h2><span class="hint">Write freely; place extra images anywhere in the text.</span></div><div id="ed"></div></div>
        </div>
        <div class="side">
          ${publishCard(d, isNew, practice ? "artwork" : "exhibition")}
          <div class="card"><h3>Details</h3><div class="fields">${details}
            <label>Web address<input data-f="slug" placeholder="Made from the title"><span class="hint">${practice ? "project" : "exhibition"}.html?id=${esc(d.slug || "…")}</span></label></div></div>
        </div></div>`);
      bindFields(c, d, async (p, v) => {
        onField(c)(p, v);
        if (p === "section_id" && v === "__new") {
          const title = prompt("Name of the new section (for example: Cyanotypes)");
          if (title && title.trim()) {
            const sec = { id: window.Store.uid(), title: title.trim(), description: "", position: db.sections.length };
            if (await guard(() => api.saveSection(sec), "Section added") !== undefined) { db.sections.push(sec); d.section_id = sec.id; }
          } else d.section_id = (orig && orig.section_id) || null;
          draw();
        }
      });
      wireImgList($("#imgs", c), d, draw);
      editor = new window.BlockEditor($("#ed", c), d.blocks, { onChange: (b) => { d.blocks = b; setDirty(true); }, pickImages, upload: (f) => api.upload(f) });
      wirePublish(c, {
        save: () => saveWork(d, isNew, base),
        previewUrl: (s) => `../${practice ? "project" : "exhibition"}.html?id=${encodeURIComponent(s.slug)}&preview=1`,
        del: async () => {
          if (!confirm(`Delete “${d.title || "this item"}”? This can't be undone.`)) return;
          if (await guard(() => api.deleteWork(d.id), "Deleted") !== undefined) { db.works = db.works.filter((w) => w.id !== d.id); go(base); }
        },
      });
      setDirty(dirty);
    });
    draw();
  }
  async function saveWork(d, isNew, base) {
    if (!String(d.title || "").trim()) { toast("Add a title first.", true); return null; }
    if (editor) d.blocks = editor.value;
    if (!d.section_id || d.section_id === "__new") d.section_id = null;
    d.slug = uniqueSlug(window.Store.slugify(d.slug || d.title), db.works, d.id);
    d.placeholder = false;
    const saved = await guard(() => api.saveWork(d), "Saved");
    if (!saved) return null;
    db.works = db.works.filter((w) => w.id !== saved.id).concat(saved).sort((a, b) => a.position - b.position);
    setDirty(false);
    if (isNew) { ignoreHash = true; location.hash = `${base}/${saved.id}`; currentHash = location.hash; viewWork(saved.kind, saved.id, new URLSearchParams()); }
    else $$("[data-f=slug]").forEach((el) => (el.value = saved.slug));
    return saved;
  }

  // ---------- gallery sections ----------
  function viewSections() {
    const count = (id) => db.works.filter((w) => w.kind === "practice" && w.section_id === id).length;
    const c = shell("sections", `<div class="page-title"><div><h1>Gallery sections</h1><p>Sections group artworks on the Practice page, for example Painting, Printmaking or Cyanotypes. Visitors can filter by them. Changes save when you leave a field.</p></div></div>
      <div class="card"><form id="addSec" style="display:flex;gap:8px;flex-wrap:wrap"><input name="secname" placeholder="New section name" aria-label="New section name" style="flex:1;min-width:200px" required><button class="btn" type="submit">Add section</button></form></div>
      ${db.sections.map((s, i) => `<div class="card sec" data-sid="${s.id}"><div class="fields">
          <label>Name<input data-s="title" value="${esc(s.title)}"></label>
          <label>Description <span class="hint">optional, shown under the name on the Practice page</span><textarea data-s="description" rows="2">${esc(s.description || "")}</textarea></label>
          <span class="count">${count(s.id)} artwork${count(s.id) === 1 ? "" : "s"} · <a href="#/artworks/new?section=${s.id}">Add an artwork here</a></span></div>
        <div class="stack"><button class="icon-btn" data-sm="up" aria-label="Move up"${i === 0 ? " disabled" : ""}>↑</button><button class="icon-btn" data-sm="down" aria-label="Move down"${i === db.sections.length - 1 ? " disabled" : ""}>↓</button><button class="icon-btn danger" data-sm="del" aria-label="Delete section">×</button></div>
      </div>`).join("") || `<p class="empty">No sections yet. Artworks without a section are shown together.</p>`}`);
    $("#addSec", c).onsubmit = async (e) => {
      e.preventDefault();
      const title = e.target.elements.secname.value.trim(); if (!title) return;
      const sec = { id: window.Store.uid(), title, description: "", position: db.sections.length };
      if (await guard(() => api.saveSection(sec), "Section added") !== undefined) { db.sections.push(sec); viewSections(); }
    };
    c.addEventListener("change", async (e) => {
      const f = e.target.dataset.s; if (!f) return;
      const s = db.sections.find((x) => x.id === e.target.closest("[data-sid]").dataset.sid);
      s[f] = e.target.value.trim();
      if (!s.title) { toast("A section needs a name.", true); return; }
      await guard(() => api.saveSection(s), "Saved");
    });
    c.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-sm]"); if (!b) return;
      const id = b.closest("[data-sid]").dataset.sid, i = db.sections.findIndex((s) => s.id === id), s = db.sections[i];
      if (b.dataset.sm === "del") {
        const n = count(id);
        if (!confirm(`Delete the section “${s.title}”?${n ? ` Its ${n} artwork${n === 1 ? "" : "s"} will stay on the site, without a section.` : ""}`)) return;
        if (await guard(() => api.deleteSection(id), "Section deleted") === undefined) return;
        db.sections.splice(i, 1); db.works.forEach((w) => { if (w.section_id === id) w.section_id = null; });
      } else {
        const to = i + (b.dataset.sm === "up" ? -1 : 1);
        [db.sections[i], db.sections[to]] = [db.sections[to], db.sections[i]];
        db.sections.forEach((x, n) => (x.position = n));
        await guard(() => api.setPositions("sections", db.sections.map((x) => x.id)), "Order saved");
      }
      keepScroll(viewSections);
    });
  }

  // ---------- site & pages ----------
  function viewSite() {
    const d = clone(db.site) || {};
    d.intros = d.intros || {}; d.heroImage = d.heroImage || { src: "" };
    const draw = () => keepScroll(() => {
      const c = shell("pages", `<div class="page-title"><div><h1>Site &amp; pages</h1><p>The name, home page, page introductions, contact details and CV.</p></div>
          <div class="actions"><span class="save-state">All changes saved</span><button class="btn" id="save">Save</button></div></div>
        <div class="card"><h2>Name and tagline</h2><div class="fields">
          <div class="fields two"><label>Name<input data-f="name"></label><label>Shown under the name<input data-f="descriptor" placeholder="Artist &amp; Curator"></label></div>
          <label>Home page headline <span class="hint">The phrase between the first two commas is set in italics.</span><input data-f="tagline"></label>
          <label>Years of work <span class="hint">optional, e.g. 2019–present</span><input data-f="years"></label></div></div>
        <div class="card"><h2>Home page image</h2><p class="hint" style="margin-top:-6px">A real artwork or installation view.</p>${imgField(d, "heroImage", "Choose the home page image")}</div>
        <div class="card"><h2>Page introductions</h2><div class="fields">
          <label>Practice page<textarea data-f="intros.practice" rows="4"></textarea></label>
          <label>Curating page<textarea data-f="intros.curating" rows="4"></textarea></label>
          <label>Writing &amp; Research page<textarea data-f="intros.writing" rows="3"></textarea></label></div></div>
        <div class="card"><h2>Contact</h2><div class="fields">
          <label>Email<input type="email" data-f="email"></label>
          <label>Invitation at the bottom of every page<input data-f="invite"></label>
          <label>Social links <span class="hint">one per line, as: Instagram | https://instagram.com/…</span><textarea data-f="socials" data-type="pairs" rows="3"></textarea></label></div></div>
        <div class="card"><h2>CV</h2><div class="fields">
          <p style="margin:0">${d.cv ? `Current CV: <a href="${esc(d.cv)}" target="_blank" rel="noopener">open the PDF ↗</a>` : "No CV uploaded yet. The site shows “CV coming soon”."}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="btn sm line" style="display:inline-flex;cursor:pointer">${d.cv ? "Replace the CV (PDF)" : "Upload the CV (PDF)"}<input type="file" id="cvFile" accept="application/pdf" hidden></label>${d.cv ? `<button class="btn sm quiet" id="cvRemove" type="button">Remove</button>` : ""}</div>
          <label>Last updated <span class="hint">shown next to the download link, e.g. October 2026</span><input data-f="cvUpdated"></label></div></div>`);
      bindFields(c, d, () => setDirty(true));
      wireImgFields(c, d, draw);
      $("#cvFile", c).onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        if (f.type !== "application/pdf") { toast("Please choose a PDF file.", true); return; }
        const u = await guard(() => api.upload(f), "CV uploaded. Save to publish it."); if (!u) return;
        d.cv = u.url; setDirty(true); draw();
      };
      const rm = $("#cvRemove", c); if (rm) rm.onclick = () => { d.cv = ""; setDirty(true); draw(); };
      const save = async () => {
        if (await guard(() => api.saveContent("site", d), "Saved") === undefined) return null;
        db.site = clone(d); setDirty(false); $(".sidebar .brand b").textContent = d.name || "Niemisha Sharma"; return d;
      };
      currentSave = save; $("#save", c).onclick = save;
      setDirty(dirty);
    });
    draw();
  }

  // ---------- about & CV ----------
  function viewAbout() {
    const d = clone(db.about) || {};
    d.portrait = d.portrait || { src: "" };
    const draw = () => keepScroll(() => {
      const c = shell("about", `<div class="page-title"><div><h1>About &amp; CV</h1><p>The About page: biography, the two sides of the practice, and the CV lists.</p></div>
          <div class="actions"><span class="save-state">All changes saved</span><a class="btn line" href="../about.html" target="_blank" rel="noopener">View page ↗</a><button class="btn" id="save">Save</button></div></div>
        <div class="card"><h2>Biography</h2><div class="fields">
          <label>Short biography <span class="hint">About 60–100 words, in the third person. Also shown on the home page.</span><textarea data-f="short" rows="5"></textarea></label></div></div>
        <div class="card"><h2>Portrait or studio image</h2><p class="hint" style="margin-top:-6px">Optional. Leave empty if none feels right.</p>${imgField(d, "portrait", "Choose an image")}</div>
        <div class="card"><h2>Practice and curating</h2><div class="fields two">
          <label>Artistic practice<textarea data-f="practice" rows="6"></textarea></label>
          <label>Curatorial interests<textarea data-f="curatorial" rows="6"></textarea></label></div></div>
        <div class="card"><h2>Education</h2>${rowsEdit(d, "education", "Degree, institution, city")}</div>
        <div class="card"><h2>Professional experience</h2>${rowsEdit(d, "experience", "Role, organisation")}</div>
        <div class="card"><h2>Selected exhibitions, publications &amp; collaborations</h2>${rowsEdit(d, "selected", "Exhibition, publication or collaboration")}</div>`);
      bindFields(c, d, () => setDirty(true));
      wireImgFields(c, d, draw);
      wireRows(c, d, draw);
      const save = async () => {
        d.placeholder = false;
        if (await guard(() => api.saveContent("about", d), "Saved") === undefined) return null;
        db.about = clone(d); setDirty(false); return d;
      };
      currentSave = save; $("#save", c).onclick = save;
      setDirty(dirty);
    });
    draw();
  }

  // ---------- media library ----------
  async function viewMedia() {
    const c = shell("media", `<div class="page-title"><div><h1>Media library</h1><p>Every image and file you've uploaded. Images can be used anywhere on the site.</p></div></div>
      <div class="dropzone" id="mz"><p style="margin:0 0 10px">Drop images or PDFs here, or</p><label class="btn sm line" style="display:inline-flex;cursor:pointer">Upload from your computer<input type="file" id="mf" accept="image/*,application/pdf" multiple hidden></label></div>
      <div class="media-grid" id="mg"><p class="muted">Loading…</p></div>`);
    const used = (url) => JSON.stringify({ s: db.site, a: db.about, w: db.works, p: db.posts }).split(url).length - 1;
    const grid = $("#mg", c), dz = $("#mz", c);
    const draw = async () => {
      const items = (await guard(() => api.listMedia())) || [];
      grid.innerHTML = items.length ? items.map((m) => {
        const isImg = /^image\//.test(m.type || "") || /\.(webp|jpe?g|png|gif|avif)$/i.test(m.path), n = used(m.url);
        return `<div class="media-item" data-path="${esc(m.path)}">${n ? `<span class="used">Used ${n}×</span>` : ""}
          ${isImg ? `<img src="${esc(m.url)}" alt="" loading="lazy">` : `<div class="file">${esc((m.path.split(".").pop() || "file").toUpperCase())}</div>`}
          <div class="info"><span class="name" title="${esc(m.path)}">${esc(m.path)}</span>${m.size ? `<span>${Math.round(m.size / 1024)} KB</span>` : ""}
            <div class="ops"><button class="btn sm line" data-copy="${esc(m.url)}">Copy link</button><button class="btn sm danger" data-delm>Delete</button></div></div></div>`;
      }).join("") : `<p class="muted">Nothing uploaded yet.</p>`;
    };
    grid.addEventListener("click", async (e) => {
      const cp = e.target.closest("[data-copy]");
      if (cp) { await guard(() => navigator.clipboard.writeText(cp.dataset.copy), "Link copied"); return; }
      if (e.target.closest("[data-delm]")) {
        const item = e.target.closest(".media-item"), path = item.dataset.path, url = item.querySelector("[data-copy]").dataset.copy, n = used(url);
        if (!confirm(n ? `This file is used in ${n} place${n === 1 ? "" : "s"} on the site. Deleting it will leave an empty space there. Delete anyway?` : "Delete this file? This can't be undone.")) return;
        if (await guard(() => api.deleteMedia(path), "Deleted") !== undefined) draw();
      }
    });
    const upload = async (files) => {
      files = [...files]; if (!files.length) return;
      for (let i = 0; i < files.length; i++) { dz.firstElementChild.textContent = `Uploading ${i + 1} of ${files.length}…`; await guard(() => api.upload(files[i])); }
      dz.firstElementChild.textContent = "Drop images or PDFs here, or"; toast("Uploaded"); draw();
    };
    $("#mf", c).onchange = (e) => upload(e.target.files);
    dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("over"); });
    dz.addEventListener("dragleave", () => dz.classList.remove("over"));
    dz.addEventListener("drop", (e) => { e.preventDefault(); dz.classList.remove("over"); upload(e.dataTransfer.files); });
    draw();
  }

  // ---------- sign in ----------
  function loginFrame(inner) {
    app.className = "";
    app.innerHTML = `<div class="login"><section class="side"><p style="margin:0">${esc((window.SITE && window.SITE.name) || "Niemisha Sharma")}</p>
      <div><h1>Site <em>editor.</em></h1><p>Sign in to write journal entries, add artworks and exhibitions, and change any page of the site.</p></div>
      <a href="../index.html" style="color:#c9bfb1">← Back to the site</a></section><section class="panel">${inner}</section></div>`;
  }
  function renderLogin(msg) {
    user = null; dirty = false;
    loginFrame(`<form id="lf" novalidate>
      ${LOCAL ? `<p class="mode-bar" style="border-radius:6px;margin:0">Preview mode on this computer: any email and password work, and changes stay in this browser.</p>` : ""}
      <h2>Sign in</h2>
      <label>Email<input type="email" name="email" autocomplete="username" required></label>
      <label>Password<input type="password" name="password" autocomplete="current-password" required></label>
      <button class="btn wide" type="submit">Sign in</button>
      <p class="error" id="lerr" role="alert">${esc(msg || "")}</p>
      ${LOCAL ? "" : `<button type="button" class="linkbtn" id="forgot">Forgot your password?</button>`}</form>`);
    const f = $("#lf");
    f.email.focus();
    f.onsubmit = async (e) => {
      e.preventDefault();
      const btn = f.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Signing in…";
      try { await api.signIn(f.email.value.trim(), f.password.value); await start(); }
      catch (err) { $("#lerr").textContent = /invalid login/i.test(err.message) ? "That email and password don't match." : err.message; btn.disabled = false; btn.textContent = "Sign in"; }
    };
    const fg = $("#forgot"); if (fg) fg.onclick = renderForgot;
  }
  function renderForgot() {
    loginFrame(`<form id="ff" novalidate><h2>Reset your password</h2><p class="muted" style="margin:0">Enter the email you sign in with, and we'll send a link to choose a new password.</p>
      <label>Email<input type="email" name="email" autocomplete="username" required></label>
      <button class="btn wide" type="submit">Send the link</button><p class="error" id="ferr" role="alert"></p>
      <button type="button" class="linkbtn" id="backLogin">← Back to sign in</button></form>`);
    $("#backLogin").onclick = () => renderLogin();
    $("#ff").onsubmit = async (e) => {
      e.preventDefault();
      try { await api.resetPassword(e.target.email.value.trim()); $("#ff").innerHTML = `<h2>Check your email</h2><p>If that address has an account, a link to reset the password is on its way. It opens this page.</p><button type="button" class="linkbtn" id="backLogin2">← Back to sign in</button>`; $("#backLogin2").onclick = () => renderLogin(); }
      catch (err) { $("#ferr").textContent = err.message; }
    };
  }
  function renderNewPassword() {
    loginFrame(`<form id="pf" novalidate><h2>Choose a new password</h2>
      <label>New password <span class="hint">at least 8 characters</span><input type="password" name="p1" autocomplete="new-password" required minlength="8"></label>
      <label>Type it again<input type="password" name="p2" autocomplete="new-password" required></label>
      <button class="btn wide" type="submit">Save the new password</button><p class="error" id="perr" role="alert"></p></form>`);
    $("#pf").onsubmit = async (e) => {
      e.preventDefault();
      const { p1, p2 } = e.target;
      if (p1.value.length < 8) { $("#perr").textContent = "Use at least 8 characters."; return; }
      if (p1.value !== p2.value) { $("#perr").textContent = "The two passwords don't match."; return; }
      try { await api.updatePassword(p1.value); recoveryMode = false; history.replaceState(null, "", location.pathname + "#/"); toast("Password changed"); await start(); }
      catch (err) { $("#perr").textContent = err.message; }
    };
  }
  function renderNotAdmin(s) {
    loginFrame(`<div style="max-width:380px"><h2>No editing access</h2><p>You're signed in as <b>${esc(s.email)}</b>, but this account can't edit the site.</p><p class="muted">The site owner adds editors in Supabase (see the README).</p><button class="btn line" id="so">Sign out</button></div>`);
    $("#so").onclick = async () => { await api.signOut(); renderLogin(); };
  }
  function renderSetup() {
    loginFrame(`<div style="max-width:420px"><h2>The editor isn't connected yet</h2>
      <p>This site needs a Supabase project to store content, images and the login. Once <code>js/config.js</code> has the project's address and key, this page becomes the sign-in screen.</p>
      <p class="muted">The README in the site's repository has the step-by-step setup.</p></div>`);
  }

  // ---------- start ----------
  async function reload() { db = await api.loadAll(); }
  async function start() {
    app.className = "boot"; app.innerHTML = "<p>Loading…</p>";
    try {
      const s = await api.session();
      if (!s) return renderLogin();
      if (recoveryMode) return renderNewPassword();
      if (!(await api.isAdmin())) return renderNotAdmin(s);
      user = s;
      await reload();
      if (!location.hash.startsWith("#/")) history.replaceState(null, "", location.pathname + location.search + "#/");
      currentHash = location.hash;
      route();
    } catch (err) {
      console.error(err);
      loginFrame(`<div style="max-width:420px"><h2>Couldn't load the editor</h2><p>${esc(err.message)}</p><p class="muted">If this keeps happening, check that supabase/setup.sql has been run in the Supabase project.</p><button class="btn line" onclick="location.reload()">Try again</button></div>`);
    }
  }
  async function boot() {
    if (window.Store.mode === "static") return renderSetup();
    try { if (window.Store.mode === "supabase" && !window.supabase) await loadScript(SUPABASE_JS); }
    catch (err) { return loginFrame(`<div><h2>Couldn't start the editor</h2><p>${esc(err.message)}</p></div>`); }
    api = window.Store.admin();
    api.onAuth((event) => {
      if (event === "PASSWORD_RECOVERY") { recoveryMode = true; renderNewPassword(); }
      else if (event === "SIGNED_OUT" && user) renderLogin();
    });
    start();
  }
  boot();
})();
