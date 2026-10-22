# Niemisha Sharma — Artist & Curator

Personal website for Niemisha Sharma, built to the *Website Kickstart Brief* (warm, intellectual, editorial,
contemporary). Plain HTML, CSS and JavaScript: no build step and no dependencies, so it can be hosted on
GitHub Pages as-is.

Designed first inside the devIndi site (`devindi.in/niemisha/`), then moved here to live on its own domain.

## Pages

| Page | File |
| --- | --- |
| Home | `index.html` |
| Artistic Practice | `practice.html`, one project: `project.html?id=…` |
| Curatorial Practice | `curating.html`, one exhibition: `exhibition.html?id=…` |
| Writing & Research | `writing.html`, one entry: `entry.html?slug=…` |
| About + CV | `about.html` |
| Contact | `contact.html` |
| Not found | `404.html` (GitHub Pages serves it for missing addresses) |

## Editing content

Everything is in `js/data.js`, laid out like the brief's content model (§12). Every record is currently a
placeholder marked `placeholder: true`. The brief rules out invented titles and generated images, so empty image
slots show "to be supplied". Remove `placeholder: true` from each record once it's verified; the "To select" tags
and the draft banner disappear by themselves. The Practice and Curating intro paragraphs are in their HTML files.

Images go in `images/`, named like `project-title_artwork-title_2025_view-01.webp`.

## Preview locally

```bash
python -m http.server 8080
```

Then open http://localhost:8080.

## Publishing on GitHub Pages

1. Push this repo to GitHub.
2. In the repo: **Settings → Pages → Build and deployment**, set Source to *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. Add a file named `CNAME` containing just the domain (e.g. `niemishasharma.com`).
4. At the domain registrar, point the domain at GitHub Pages (A records for the root domain, a CNAME record for `www`).
5. Back in **Settings → Pages**, tick **Enforce HTTPS** once the certificate is ready.

## Before launch (brief §14)

- Replace every placeholder record, the email, and the intro paragraphs; add images under `images/`.
- Add the CV PDF (e.g. `cv/Niemisha_Sharma_CV.pdf`) and set `cv` in `js/data.js`.
- Decide whether the contact form should send through a form service, or whether opening the visitor's email app is enough.
- Remove the `noindex` line from each page's `<head>` and add a `sitemap.xml`.
