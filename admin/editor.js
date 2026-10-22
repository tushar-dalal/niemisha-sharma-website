// Block editor: write in paragraphs, and place headings, images, galleries, quotes and dividers anywhere.
// Blocks can be moved by dragging the ⠿ handle or with the arrows. Images can be dropped straight in.
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TYPES = { paragraph: "Paragraph", heading: "Heading", image: "Image", gallery: "Gallery", quote: "Quote", divider: "Divider" };
  const ICONS = { paragraph: "¶", heading: "H", image: "▣", gallery: "▦", quote: "❝", divider: "―" };
  const SIZES = [["left", "Left", "Image on the left, text wraps around it"], ["center", "Centre", "Full width of the text"], ["right", "Right", "Image on the right, text wraps around it"], ["wide", "Wide", "Wider than the text"], ["full", "Full", "Edge to edge"]];
  const fresh = (type) => ({
    paragraph: { type, html: "" }, heading: { type, text: "", level: 2 }, image: { type, src: "", alt: "", caption: "", size: "center" },
    gallery: { type, images: [], columns: 2 }, quote: { type, html: "", cite: "" }, divider: { type },
  }[type]);
  const isEmptyHtml = (h) => !String(h || "").replace(/<br\s*\/?>/gi, "").replace(/&nbsp;/g, " ").trim();

  class BlockEditor {
    // opts: { onChange(blocks), pickImages({ multiple }) → Promise<[{url}]|null>, upload(file) → Promise<{url}> }
    constructor(root, blocks, opts) {
      this.root = root;
      this.opts = opts;
      this.blocks = JSON.parse(JSON.stringify(blocks || []));
      if (!this.blocks.length) this.blocks.push(fresh("paragraph"));
      this.dragFrom = null;
      root.classList.add("be");
      try { document.execCommand("styleWithCSS", false, false); } catch (e) { /* older browsers */ }
      this.bind();
      this.render();
    }

    get value() {
      return this.blocks.map((b) => {
        const out = { ...b };
        if (b.type === "paragraph" || b.type === "quote") out.html = isEmptyHtml(b.html) ? "" : window.Blocks.sanitize(b.html);
        return out;
      }).filter((b) => !(b.type === "paragraph" && !b.html));
    }

    changed() { this.opts.onChange && this.opts.onChange(this.value); }

    // ---------- rendering ----------
    render(focus) {
      this.root.innerHTML = `<div class="be-list">${this.blocks.map((b, i) => this.card(b, i)).join("")}</div>
        <div class="be-add"><span class="be-add-label">Add a block</span>${Object.keys(TYPES).map((t) =>
          `<button type="button" class="be-add-btn" data-add="${t}"><span aria-hidden="true">${ICONS[t]}</span>${TYPES[t]}</button>`).join("")}
          <span class="be-add-hint">Tip: drop image files anywhere on the editor to add them.</span></div>`;
      this.root.querySelectorAll("[contenteditable][data-field]").forEach((el) => {
        const b = this.blocks[+el.closest(".be-card").dataset.i];
        el.innerHTML = window.Blocks.sanitize(b[el.dataset.field] || "");
      });
      if (focus) this.focus(focus.i, focus.atEnd);
    }

    card(b, i) {
      const n = this.blocks.length;
      return `<div class="be-card be-${b.type}" data-i="${i}">
        <div class="be-insert"><button type="button" class="be-plus" data-act="menu" title="Add a block here" aria-label="Add a block here">+</button></div>
        <div class="be-tools">
          <span class="be-handle" title="Drag to move" aria-hidden="true">⠿</span>
          <span class="be-type">${TYPES[b.type]}</span>
          <span class="be-spacer"></span>
          <button type="button" data-act="up" title="Move up" aria-label="Move up"${i === 0 ? " disabled" : ""}>↑</button>
          <button type="button" data-act="down" title="Move down" aria-label="Move down"${i === n - 1 ? " disabled" : ""}>↓</button>
          <button type="button" data-act="dup" title="Duplicate">Copy</button>
          <button type="button" data-act="del" title="Delete block" class="danger">Delete</button>
        </div>
        <div class="be-body">${this.body(b, i)}</div>
      </div>`;
    }

    body(b) {
      switch (b.type) {
        case "paragraph":
          return `<div class="be-format" role="toolbar" aria-label="Text formatting"><button type="button" data-fmt="bold" title="Bold (Ctrl+B)"><b>B</b></button><button type="button" data-fmt="italic" title="Italic (Ctrl+I)"><i>I</i></button><button type="button" data-fmt="link" title="Link">Link</button><button type="button" data-fmt="unlink" title="Remove link">Unlink</button></div>
            <div class="be-text" contenteditable="true" data-field="html" data-ph="Write here… Press Enter for a new paragraph."></div>`;
        case "heading":
          return `<div class="be-row"><select data-field="level" aria-label="Heading size"><option value="2"${b.level !== 3 ? " selected" : ""}>Large heading</option><option value="3"${b.level === 3 ? " selected" : ""}>Small heading</option></select></div>
            <input class="be-heading lv-${b.level === 3 ? 3 : 2}" data-field="text" value="${esc(b.text)}" placeholder="Heading" aria-label="Heading text">`;
        case "image":
          if (!b.src) return `<button type="button" class="be-drop" data-act="pick">▣ Choose or upload an image</button>`;
          return `<div class="be-sizes" role="group" aria-label="Image placement">${SIZES.map(([v, l, t]) =>
              `<button type="button" data-size="${v}" title="${t}" aria-pressed="${(b.size || "center") === v}">${l}</button>`).join("")}</div>
            <div class="be-imgprev size-${esc(b.size || "center")}"><img src="${esc(b.src)}" alt=""><p class="be-ghost">Text continues here…</p></div>
            <div class="be-grid2"><label>Caption<input data-field="caption" value="${esc(b.caption)}" placeholder="Title, year. Medium, dimensions."></label>
              <label>Description for screen readers<input data-field="alt" value="${esc(b.alt)}" placeholder="What the image shows"></label></div>
            <div class="be-row"><button type="button" data-act="pick">Replace image</button></div>`;
        case "gallery":
          return `<div class="be-row"><select data-field="columns" aria-label="Images per row"><option value="2"${b.columns !== 3 ? " selected" : ""}>2 per row</option><option value="3"${b.columns === 3 ? " selected" : ""}>3 per row</option></select>
              <button type="button" data-act="gadd">+ Add images</button></div>
            <div class="be-gal cols-${b.columns === 3 ? 3 : 2}">${(b.images || []).map((im, g) => `<div class="be-gitem" data-g="${g}">
              <img src="${esc(im.src)}" alt="">
              <div class="be-gtools"><button type="button" data-act="gleft" aria-label="Move left">←</button><button type="button" data-act="gright" aria-label="Move right">→</button><button type="button" data-act="gdel" class="danger" aria-label="Remove image">×</button></div>
              <input data-gfield="caption" value="${esc(im.caption)}" placeholder="Caption" aria-label="Caption">
              <input data-gfield="alt" value="${esc(im.alt)}" placeholder="Description for screen readers" aria-label="Description for screen readers"></div>`).join("")}
              ${(b.images || []).length ? "" : `<button type="button" class="be-drop" data-act="gadd">▦ Choose images for the gallery</button>`}</div>`;
        case "quote":
          return `<div class="be-text be-quote" contenteditable="true" data-field="html" data-ph="Quotation"></div>
            <input data-field="cite" value="${esc(b.cite)}" placeholder="Source (optional)" aria-label="Source">`;
        case "divider":
          return `<hr class="be-hr">`;
      }
      return "";
    }

    focus(i, atEnd) {
      const card = this.root.querySelector(`.be-card[data-i="${i}"]`); if (!card) return;
      const el = card.querySelector("[contenteditable], input, button.be-drop"); if (!el) return;
      el.focus();
      if (el.isContentEditable) {
        const r = document.createRange(); r.selectNodeContents(el); r.collapse(!atEnd);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      }
    }

    // ---------- structure ----------
    insert(at, block, focus = true) {
      this.blocks.splice(at, 0, block);
      this.render(focus ? { i: at } : null);
      this.changed();
      if (block.type === "image" && !block.src) this.pick(at);
      if (block.type === "gallery" && !(block.images || []).length) this.galleryAdd(at);
    }
    move(from, to) {
      if (to < 0 || to >= this.blocks.length || from === to) return;
      const [b] = this.blocks.splice(from, 1);
      this.blocks.splice(to, 0, b);
      this.render(); this.changed();
      const card = this.root.querySelector(`.be-card[data-i="${to}"]`);
      if (card) { card.classList.add("be-flash"); card.scrollIntoView({ block: "nearest" }); }
    }
    remove(i) {
      this.blocks.splice(i, 1);
      if (!this.blocks.length) this.blocks.push(fresh("paragraph"));
      this.render({ i: Math.max(0, i - 1), atEnd: true }); this.changed();
    }
    async pick(i) {
      const res = await this.opts.pickImages({ multiple: false });
      if (!res || !res.length) return;
      Object.assign(this.blocks[i], { src: res[0].url });
      this.render(); this.changed();
    }
    async galleryAdd(i) {
      const res = await this.opts.pickImages({ multiple: true });
      if (!res || !res.length) return;
      const b = this.blocks[i]; b.images = (b.images || []).concat(res.map((r) => ({ src: r.url, alt: "", caption: "" })));
      this.render(); this.changed();
    }
    showMenu(card, i) {
      this.root.querySelectorAll(".be-menu").forEach((m) => m.remove());
      const menu = document.createElement("div");
      menu.className = "be-menu";
      menu.innerHTML = Object.keys(TYPES).map((t) => `<button type="button" data-ins="${t}" data-at="${i}"><span aria-hidden="true">${ICONS[t]}</span>${TYPES[t]}</button>`).join("");
      card.querySelector(".be-insert").appendChild(menu);
      menu.querySelector("button").focus();
    }

    // ---------- events ----------
    bind() {
      const R = this.root;
      const idx = (el) => +el.closest(".be-card").dataset.i;

      R.addEventListener("input", (e) => {
        const t = e.target, card = t.closest(".be-card"); if (!card) return;
        const b = this.blocks[+card.dataset.i];
        if (t.dataset.field) {
          let v = t.isContentEditable ? t.innerHTML : t.value;
          if (t.dataset.field === "level" || t.dataset.field === "columns") v = +v;
          b[t.dataset.field] = v;
          if (t.dataset.field === "level") t.closest(".be-body").querySelector(".be-heading").className = `be-heading lv-${v}`;
          if (t.dataset.field === "columns") t.closest(".be-body").querySelector(".be-gal").className = `be-gal cols-${v}`;
        } else if (t.dataset.gfield) {
          b.images[+t.closest(".be-gitem").dataset.g][t.dataset.gfield] = t.value;
        }
        this.changed();
      });
      R.addEventListener("change", (e) => { if (e.target.tagName === "SELECT") e.target.dispatchEvent(new Event("input", { bubbles: true })); });

      R.addEventListener("mousedown", (e) => { if (e.target.closest("[data-fmt]")) e.preventDefault(); }); // keep the text selection

      R.addEventListener("click", (e) => {
        const add = e.target.closest("[data-add]");
        if (add) return this.insert(this.blocks.length, fresh(add.dataset.add));
        const ins = e.target.closest("[data-ins]");
        if (ins) return this.insert(+ins.dataset.at, fresh(ins.dataset.ins));
        const fmt = e.target.closest("[data-fmt]");
        if (fmt) {
          const f = fmt.dataset.fmt;
          if (f === "link") {
            const sel = getSelection();
            if (!sel.rangeCount || sel.isCollapsed) { alert("Select the words you want to link first."); return; }
            const url = prompt("Link address, e.g. https://example.com");
            if (url) document.execCommand("createLink", false, /^(https?:|mailto:|\/)/i.test(url) ? url : "https://" + url);
          } else document.execCommand(f, false, null);
          fmt.closest(".be-body").querySelector("[contenteditable]").dispatchEvent(new Event("input", { bubbles: true }));
          return;
        }
        const size = e.target.closest("[data-size]");
        if (size) { this.blocks[idx(size)].size = size.dataset.size; this.render(); this.changed(); return; }
        const act = e.target.closest("[data-act]");
        if (!act) { if (!e.target.closest(".be-menu")) R.querySelectorAll(".be-menu").forEach((m) => m.remove()); return; }
        const i = idx(act), b = this.blocks[i];
        switch (act.dataset.act) {
          case "menu": return this.showMenu(act.closest(".be-card"), i);
          case "up": return this.move(i, i - 1);
          case "down": return this.move(i, i + 1);
          case "dup": return this.insert(i + 1, JSON.parse(JSON.stringify(b)), false);
          case "del":
            if ((b.type === "paragraph" && isEmptyHtml(b.html)) || b.type === "divider" || confirm(`Delete this ${TYPES[b.type].toLowerCase()} block?`)) this.remove(i);
            return;
          case "pick": return this.pick(i);
          case "gadd": return this.galleryAdd(i);
          case "gleft": case "gright": case "gdel": {
            const g = +act.closest(".be-gitem").dataset.g, imgs = b.images;
            if (act.dataset.act === "gdel") imgs.splice(g, 1);
            else { const to = g + (act.dataset.act === "gleft" ? -1 : 1); if (to < 0 || to >= imgs.length) return; [imgs[g], imgs[to]] = [imgs[to], imgs[g]]; }
            this.render(); this.changed(); return;
          }
        }
      });

      R.addEventListener("keydown", (e) => {
        if (e.key === "Escape") R.querySelectorAll(".be-menu").forEach((m) => m.remove());
        const el = e.target;
        if (!el.isContentEditable || !el.classList.contains("be-text") || el.classList.contains("be-quote")) return;
        const i = idx(el);
        if (e.key === "Enter" && !e.shiftKey) {
          // Split the paragraph at the cursor, like a word processor.
          e.preventDefault();
          const sel = getSelection(); if (!sel.rangeCount) return;
          const range = sel.getRangeAt(0); range.deleteContents();
          const after = document.createRange(); after.selectNodeContents(el); after.setStart(range.endContainer, range.endOffset);
          const tmp = document.createElement("div"); tmp.appendChild(after.extractContents());
          this.blocks[i].html = el.innerHTML;
          this.insert(i + 1, { type: "paragraph", html: isEmptyHtml(tmp.innerHTML) ? "" : tmp.innerHTML });
        } else if (e.key === "Backspace" && isEmptyHtml(el.innerHTML) && this.blocks.length > 1) {
          e.preventDefault();
          this.remove(i);
        }
      });

      R.addEventListener("paste", (e) => {
        if (!e.target.isContentEditable) return;
        const files = [...(e.clipboardData.files || [])].filter((f) => f.type.startsWith("image/"));
        e.preventDefault();
        if (files.length) { this.dropFiles(files, idx(e.target) + 1); return; }
        // Paste as plain text so outside styling doesn't come along; blank lines start new paragraphs.
        const text = e.clipboardData.getData("text/plain");
        const parts = text.split(/\n\s*\n/);
        document.execCommand("insertText", false, parts[0]);
        if (parts.length > 1) {
          const i = idx(e.target);
          this.blocks[i].html = e.target.innerHTML;
          this.blocks.splice(i + 1, 0, ...parts.slice(1).map((p) => ({ type: "paragraph", html: esc(p).replace(/\n/g, "<br>") })));
          this.render({ i: i + parts.length - 1, atEnd: true }); this.changed();
        }
      });

      // Dragging blocks by the handle, and dropping image files from the computer.
      R.addEventListener("pointerdown", (e) => { const h = e.target.closest(".be-handle"); if (h) h.closest(".be-card").draggable = true; });
      R.addEventListener("dragstart", (e) => {
        const card = e.target.closest && e.target.closest(".be-card");
        if (!card || !card.draggable) return;
        this.dragFrom = +card.dataset.i;
        card.classList.add("be-dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", "block");
      });
      const clearMarks = () => R.querySelectorAll(".be-before,.be-after").forEach((c) => c.classList.remove("be-before", "be-after"));
      const target = (e) => {
        const card = e.target.closest && e.target.closest(".be-card"); if (!card) return null;
        const r = card.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
        return { card, at: +card.dataset.i + (after ? 1 : 0), after };
      };
      R.addEventListener("dragover", (e) => {
        const files = e.dataTransfer && [...e.dataTransfer.types].includes("Files");
        if (this.dragFrom === null && !files) return;
        e.preventDefault();
        clearMarks();
        const t = target(e); if (t) t.card.classList.add(t.after ? "be-after" : "be-before");
        R.classList.toggle("be-filedrop", !!files);
      });
      R.addEventListener("dragleave", (e) => { if (!R.contains(e.relatedTarget)) { clearMarks(); R.classList.remove("be-filedrop"); } });
      R.addEventListener("drop", (e) => {
        const t = target(e), at = t ? t.at : this.blocks.length;
        clearMarks(); R.classList.remove("be-filedrop");
        if (this.dragFrom !== null) {
          e.preventDefault();
          const from = this.dragFrom; this.dragFrom = null;
          this.move(from, at > from ? at - 1 : at);
          return;
        }
        const files = [...(e.dataTransfer.files || [])].filter((f) => f.type.startsWith("image/"));
        if (files.length) { e.preventDefault(); this.dropFiles(files, at); }
      });
      R.addEventListener("dragend", () => {
        this.dragFrom = null; clearMarks();
        R.querySelectorAll(".be-card").forEach((c) => { c.draggable = false; c.classList.remove("be-dragging"); });
      });
    }

    async dropFiles(files, at) {
      const holder = { type: "paragraph", html: `<i>Uploading ${files.length} image${files.length > 1 ? "s" : ""}…</i>` };
      this.blocks.splice(at, 0, holder); this.render();
      const done = [];
      for (const f of files) {
        try { done.push(await this.opts.upload(f)); } catch (err) { alert(`Couldn't upload ${f.name}: ${err.message}`); }
      }
      const i = this.blocks.indexOf(holder);
      this.blocks.splice(i, 1, ...done.map((u) => ({ type: "image", src: u.url, alt: "", caption: "", size: "center" })));
      if (!this.blocks.length) this.blocks.push(fresh("paragraph"));
      this.render(); this.changed();
    }
  }

  window.BlockEditor = BlockEditor;
})();
