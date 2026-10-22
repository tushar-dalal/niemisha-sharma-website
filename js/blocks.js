// Turns the editor's blocks into page HTML. Used by the public site and the admin's live view.
//
// Block types:
//   { type: "paragraph", html }                    html may contain <b> <i> <a href> <br> only
//   { type: "heading", text, level: 2 | 3 }
//   { type: "image", src, alt, caption, size }     size: center | wide | full | left | right
//   { type: "gallery", images: [{ src, alt, caption }], columns: 2 | 3 }
//   { type: "quote", html, cite }
//   { type: "divider" }
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SAFE_URL = /^(https?:|mailto:|\/|\.\/|\.\.\/|#|[a-z0-9-]+\.html)/i;

  // Keep only simple inline formatting; everything else becomes plain text.
  function sanitize(html) {
    const doc = new DOMParser().parseFromString(`<div>${html || ""}</div>`, "text/html");
    const walk = (node) => {
      let out = "";
      node.childNodes.forEach((n) => {
        if (n.nodeType === 3) { out += esc(n.textContent); return; }
        if (n.nodeType !== 1) return;
        const tag = n.tagName.toLowerCase(), inner = walk(n);
        if (tag === "b" || tag === "strong") out += `<b>${inner}</b>`;
        else if (tag === "i" || tag === "em") out += `<i>${inner}</i>`;
        else if (tag === "br") out += "<br>";
        else if (tag === "a") {
          const href = (n.getAttribute("href") || "").trim();
          out += SAFE_URL.test(href) ? `<a href="${esc(href)}"${/^https?:/i.test(href) ? ' rel="noopener"' : ""}>${inner}</a>` : inner;
        }
        else if (tag === "div" || tag === "p") out += (out && !out.endsWith("<br>") ? "<br>" : "") + inner;
        else out += inner;
      });
      return out;
    };
    return walk(doc.body.firstChild).replace(/(<br>)+$/, "");
  }

  const SIZES = ["center", "wide", "full", "left", "right"];
  const figure = (im, cls) => im && im.src
    ? `<figure class="${cls}"><img src="${esc(im.src)}" alt="${esc(im.alt || "")}" loading="lazy">${im.caption ? `<figcaption>${esc(im.caption)}</figcaption>` : ""}</figure>`
    : "";

  function renderBlock(b) {
    switch (b && b.type) {
      case "paragraph": { const h = sanitize(b.html); return h ? `<p>${h}</p>` : ""; }
      case "heading": return b.text ? `<h${b.level === 3 ? 3 : 2} class="b-head">${esc(b.text)}</h${b.level === 3 ? 3 : 2}>` : "";
      case "image": return figure(b, `b-img size-${SIZES.includes(b.size) ? b.size : "center"}`);
      case "gallery": {
        const imgs = (b.images || []).filter((i) => i.src);
        return imgs.length ? `<div class="b-gallery cols-${b.columns === 3 ? 3 : 2}">${imgs.map((i) => figure(i, "b-gal-item")).join("")}</div>` : "";
      }
      case "quote": { const h = sanitize(b.html); return h ? `<blockquote class="b-quote"><p>${h}</p>${b.cite ? `<cite>${esc(b.cite)}</cite>` : ""}</blockquote>` : ""; }
      case "divider": return `<hr class="b-rule">`;
      default: return "";
    }
  }

  window.Blocks = {
    sanitize,
    render: (blocks) => `<div class="blocks">${(blocks || []).map(renderBlock).join("")}</div>`,
    // First paragraph as plain text, for summaries.
    text: (blocks) => { const p = (blocks || []).find((b) => b.type === "paragraph" && b.html); return p ? new DOMParser().parseFromString(p.html, "text/html").body.textContent : ""; },
    images: (blocks) => (blocks || []).flatMap((b) => (b.type === "image" ? [b] : b.type === "gallery" ? b.images || [] : [])).filter((i) => i.src),
  };
})();
