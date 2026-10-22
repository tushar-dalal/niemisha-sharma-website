// Data layer shared by the public site and the admin.
//
// Three modes, picked automatically:
//   supabase — js/config.js is filled in: content, images and login live in Supabase.
//   local    — not connected, on this computer (localhost): the admin saves to this browser, for previewing.
//   static   — not connected, on the live site: shows the starter content in js/data.js.
(function () {
  const cfg = window.NS_CONFIG || {};
  const LOCALHOST = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const MODE = cfg.supabaseUrl && cfg.anonKey ? "supabase" : LOCALHOST ? "local" : "static";
  const LOCAL_KEY = "ns-preview-db-v1";
  const BUCKET = "media";

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const slugify = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "untitled";
  const paras = (arr) => (arr || []).map((t) => ({ type: "paragraph", html: esc(t) }));
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ---------- row <-> record ----------
  const WORK_COLS = ["id", "slug", "kind", "section_id", "position", "published"];
  const POST_COLS = ["id", "slug", "published", "date", "position"];
  const flat = (row) => ({ ...(row.data || {}), ...Object.fromEntries(Object.entries(row).filter(([k]) => k !== "data" && k !== "created_at")) });
  const toRow = (rec, cols) => {
    const row = { data: {} };
    for (const [k, v] of Object.entries(rec)) {
      if (cols.includes(k)) row[k] = v;
      else if (k !== "updated_at" && k !== "created_at") row.data[k] = v;
    }
    row.updated_at = new Date().toISOString();
    return row;
  };
  const sortAll = (d) => {
    d.sections.sort((a, b) => a.position - b.position);
    d.works.sort((a, b) => a.position - b.position);
    d.posts.sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.position - b.position);
    return d;
  };

  // ---------- starter content from js/data.js ----------
  function fromStatic() {
    const S = window.SITE || {}, P = window.PRACTICE || [], C = window.CURATING || [], W = window.WRITING || [], A = window.ABOUT || {};
    const cats = [...new Set(P.map((p) => p.category).filter(Boolean))];
    const sections = cats.map((t, i) => ({ id: "sec-" + slugify(t), title: t, description: "", position: i }));
    const works = [
      ...P.map((p, i) => ({
        id: p.id, slug: p.id, kind: "practice", section_id: p.category ? "sec-" + slugify(p.category) : null, position: i, published: true,
        title: p.title, years: p.years, medium: p.medium, series: p.series || "", summary: p.summary,
        images: p.images || [], blocks: p.blocks || paras(p.statement), credits: p.credits || [], placeholder: !!p.placeholder,
      })),
      ...C.map((c, i) => ({
        id: c.id, slug: c.id, kind: "curating", section_id: null, position: i, published: true,
        title: c.title, role: c.role, year: c.year, dates: c.dates, venue: c.venue, city: c.city,
        artists: c.artists || [], collaborators: c.collaborators || [], summary: c.summary,
        images: c.images || [], blocks: c.blocks || paras(c.text), credits: c.credits || [], links: c.links || [], placeholder: !!c.placeholder,
      })),
    ];
    const posts = W.map((e, i) => ({
      id: e.slug, slug: e.slug, published: true, date: e.date, position: i,
      title: e.title, type: e.type, status: e.status, context: e.context, url: e.url || "", summary: e.summary,
      question: e.question || "", cover: e.cover || null, blocks: e.blocks || paras(e.body),
      related: (e.related || []).map((r) => ({ kind: r.kind, slug: r.slug || r.id })), placeholder: !!e.placeholder,
    }));
    return sortAll({ site: clone(S), about: clone(A), sections, works, posts });
  }

  // ---------- public loading ----------
  function sessionToken() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (/^sb-.*-auth-token$/.test(k)) {
          const s = JSON.parse(localStorage.getItem(k));
          if (s && s.access_token && (!s.expires_at || s.expires_at * 1000 > Date.now())) return s.access_token;
        }
      }
    } catch (e) { /* storage blocked */ }
    return null;
  }

  async function restLoad(drafts) {
    const token = drafts ? sessionToken() : null;
    const headers = { apikey: cfg.anonKey };
    if (token) headers.Authorization = "Bearer " + token;
    else if (/^eyJ/.test(cfg.anonKey)) headers.Authorization = "Bearer " + cfg.anonKey;
    const base = cfg.supabaseUrl.replace(/\/+$/, "") + "/rest/v1/";
    const get = (path) => fetch(base + path, { headers }).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
    const [content, sections, works, posts] = await Promise.all([
      get("site_content?select=key,data"), get("sections?select=*&order=position"),
      get("works?select=*&order=position"), get("posts?select=*&order=date.desc,position"),
    ]);
    const site = content.find((r) => r.key === "site");
    if (!site) return null; // database not filled yet: keep showing the starter content
    const about = content.find((r) => r.key === "about");
    return sortAll({ site: site.data, about: about ? about.data : {}, sections, works: works.map(flat), posts: posts.map(flat) });
  }

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "null"); } catch (e) { return null; }
  }
  function writeLocal(db) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(db)); }
    catch (e) { throw new Error("This browser's preview storage is full. Delete some images in Media, or connect Supabase."); }
  }
  const onlyPublished = (d) => ({ ...d, works: d.works.filter((w) => w.published), posts: d.posts.filter((p) => p.published) });

  async function load({ drafts = false } = {}) {
    if (MODE === "supabase") {
      try { const d = await restLoad(drafts); if (d) return d; }
      catch (e) { console.warn("Couldn't load content from Supabase, showing starter content.", e); }
    } else if (MODE === "local") {
      const db = readLocal();
      if (db && db.site) { const d = sortAll(clone(db)); return drafts ? d : onlyPublished(d); }
    }
    return fromStatic();
  }

  // ---------- images ----------
  async function prepareImage(file, { max, type, quality, always }) {
    if (!/^image\/(jpeg|png|webp|avif|heic|heif)$/.test(file.type)) return file;
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { return file; }
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && !always) return file;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, type, quality));
    return blob || file;
  }
  const extFor = (blob, name) => ({ "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" }[blob.type] || (name.split(".").pop() || "bin").toLowerCase());
  const storageName = (file, blob) => `${Date.now().toString(36)}-${slugify(file.name.replace(/\.[^.]+$/, ""))}.${extFor(blob, file.name)}`;

  // ---------- admin: Supabase ----------
  function supabaseAdmin() {
    if (!window.supabase) throw new Error("The Supabase library didn't load. Check the internet connection and reload.");
    const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.anonKey);
    const ok = (res) => { if (res.error) throw new Error(res.error.message); return res.data; };
    return {
      mode: "supabase",
      async session() { const { data } = await sb.auth.getSession(); const u = data.session && data.session.user; return u ? { id: u.id, email: u.email } : null; },
      onAuth(cb) { sb.auth.onAuthStateChange((event) => cb(event)); },
      async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
      async signOut() { await sb.auth.signOut(); },
      async resetPassword(email) { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })); },
      async updatePassword(password) { ok(await sb.auth.updateUser({ password })); },
      async isAdmin() {
        const s = await this.session(); if (!s) return false;
        return !!ok(await sb.from("admins").select("user_id").eq("user_id", s.id).maybeSingle());
      },
      async loadAll() {
        const [c, s, w, p] = await Promise.all([
          sb.from("site_content").select("key,data"), sb.from("sections").select("*").order("position"),
          sb.from("works").select("*").order("position"), sb.from("posts").select("*").order("date", { ascending: false }),
        ]);
        const content = ok(c), site = content.find((r) => r.key === "site"), about = content.find((r) => r.key === "about");
        return sortAll({ seeded: !!site, site: site ? site.data : {}, about: about ? about.data : {}, sections: ok(s), works: ok(w).map(flat), posts: ok(p).map(flat) });
      },
      async saveContent(key, data) { ok(await sb.from("site_content").upsert({ key, data, updated_at: new Date().toISOString() })); },
      async saveSection(sec) { ok(await sb.from("sections").upsert({ id: sec.id, title: sec.title, description: sec.description || "", position: sec.position || 0 })); },
      async deleteSection(id) { ok(await sb.from("sections").delete().eq("id", id)); },
      async saveWork(w) { return flat(ok(await sb.from("works").upsert(toRow(w, WORK_COLS)).select().single())); },
      async deleteWork(id) { ok(await sb.from("works").delete().eq("id", id)); },
      async savePost(p) { return flat(ok(await sb.from("posts").upsert(toRow(p, POST_COLS)).select().single())); },
      async deletePost(id) { ok(await sb.from("posts").delete().eq("id", id)); },
      async setPositions(table, ids) { await Promise.all(ids.map(async (id, i) => ok(await sb.from(table).update({ position: i }).eq("id", id)))); },
      async upload(file) {
        const blob = await prepareImage(file, { max: 2400, type: "image/webp", quality: 0.9 });
        const path = storageName(file, blob);
        ok(await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || file.type, cacheControl: "31536000", upsert: false }));
        return { path, url: sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
      },
      async listMedia() {
        const items = ok(await sb.storage.from(BUCKET).list("", { limit: 1000, sortBy: { column: "created_at", order: "desc" } }));
        return items.filter((f) => f.id).map((f) => ({ path: f.name, url: sb.storage.from(BUCKET).getPublicUrl(f.name).data.publicUrl, size: f.metadata && f.metadata.size, type: f.metadata && f.metadata.mimetype, created: f.created_at }));
      },
      async deleteMedia(path) { ok(await sb.storage.from(BUCKET).remove([path])); },
      async importStarter() {
        const d = fromStatic(), ids = {};
        const nid = (old) => (ids[old] = ids[old] || uid());
        await this.saveContent("site", d.site);
        await this.saveContent("about", d.about);
        for (const s of d.sections) await this.saveSection({ ...s, id: nid(s.id) });
        for (const w of d.works) await this.saveWork({ ...w, id: nid(w.id), section_id: w.section_id ? nid(w.section_id) : null });
        for (const p of d.posts) await this.savePost({ ...p, id: nid(p.id) });
      },
    };
  }

  // ---------- admin: local preview (this browser only) ----------
  function localAdmin() {
    const SESSION = "ns-preview-session";
    const db = () => readLocal() || { site: null, about: {}, sections: [], works: [], posts: [], media: [] };
    const mutate = (fn) => { const d = db(); const out = fn(d); writeLocal(d); return out; };
    const upsertIn = (list, rec) => { const i = list.findIndex((x) => x.id === rec.id); if (i >= 0) list[i] = rec; else list.push(rec); return rec; };
    const listeners = [];
    return {
      mode: "local",
      async session() { const e = sessionStorage.getItem(SESSION); return e ? { id: "local", email: e } : null; },
      onAuth(cb) { listeners.push(cb); },
      async signIn(email, password) {
        if (!email || !password) throw new Error("Enter an email and a password.");
        sessionStorage.setItem(SESSION, email); listeners.forEach((cb) => cb("SIGNED_IN"));
      },
      async signOut() { sessionStorage.removeItem(SESSION); listeners.forEach((cb) => cb("SIGNED_OUT")); },
      async resetPassword() { throw new Error("Password reset emails only work once Supabase is connected."); },
      async updatePassword() {},
      async isAdmin() { return !!(await this.session()); },
      async loadAll() { const d = db(); return sortAll({ seeded: !!d.site, site: d.site || {}, about: d.about || {}, sections: d.sections, works: d.works, posts: d.posts }); },
      async saveContent(key, data) { mutate((d) => { d[key] = clone(data); }); },
      async saveSection(sec) { mutate((d) => upsertIn(d.sections, clone(sec))); },
      async deleteSection(id) { mutate((d) => { d.sections = d.sections.filter((s) => s.id !== id); d.works.forEach((w) => { if (w.section_id === id) w.section_id = null; }); }); },
      async saveWork(w) {
        return mutate((d) => {
          if (d.works.some((x) => x.slug === w.slug && x.id !== w.id)) throw new Error("Another item already uses this web address (slug).");
          return clone(upsertIn(d.works, { ...clone(w), updated_at: new Date().toISOString() }));
        });
      },
      async deleteWork(id) { mutate((d) => { d.works = d.works.filter((x) => x.id !== id); }); },
      async savePost(p) {
        return mutate((d) => {
          if (d.posts.some((x) => x.slug === p.slug && x.id !== p.id)) throw new Error("Another entry already uses this web address (slug).");
          return clone(upsertIn(d.posts, { ...clone(p), updated_at: new Date().toISOString() }));
        });
      },
      async deletePost(id) { mutate((d) => { d.posts = d.posts.filter((x) => x.id !== id); }); },
      async setPositions(table, ids) { mutate((d) => { ids.forEach((id, i) => { const r = d[table].find((x) => x.id === id); if (r) r.position = i; }); }); },
      async upload(file) {
        const isImg = /^image\//.test(file.type);
        const blob = isImg ? await prepareImage(file, { max: 1400, type: "image/jpeg", quality: 0.82, always: true }) : file;
        const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
        const path = storageName(file, blob);
        mutate((d) => { d.media = d.media || []; d.media.unshift({ path, url, size: blob.size, type: blob.type, created: new Date().toISOString() }); });
        return { path, url };
      },
      async listMedia() { return db().media || []; },
      async deleteMedia(path) { mutate((d) => { d.media = (d.media || []).filter((m) => m.path !== path); }); },
      async importStarter() { const s = fromStatic(); mutate((d) => { Object.assign(d, { site: s.site, about: s.about, sections: s.sections, works: s.works, posts: s.posts }); }); },
    };
  }

  let adminInstance;
  window.Store = {
    mode: MODE,
    load,
    fromStatic,
    slugify,
    uid,
    admin() {
      if (adminInstance) return adminInstance;
      if (MODE === "supabase") adminInstance = supabaseAdmin();
      else if (MODE === "local") adminInstance = localAdmin();
      return adminInstance || null;
    },
  };
})();
