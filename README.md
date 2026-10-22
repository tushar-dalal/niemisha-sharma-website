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
3. Add a file named `CNAME` containing just the domain (`niemisha.com`).
4. At the domain registrar, point the domain at GitHub Pages (A records for the root domain, a CNAME record for `www`).
5. Back in **Settings → Pages**, tick **Enforce HTTPS** once the certificate is ready.

## Admin (site editor)

`/admin/` is a sign-in page for the site owner. Once signed in, she can write journal entries with
images placed anywhere in the text, add and edit artworks, create and reorder gallery sections, edit
exhibitions, change the home page, page introductions, About page and CV, and manage uploaded images.

Content, images and the login live in **Supabase** (project set in `js/config.js`). The public site reads
published content from there; until the database is set up it keeps showing the starter content in `js/data.js`.

### One-time Supabase setup

1. **SQL Editor → New query**: paste all of `supabase/setup.sql` and click **Run**.
2. **Authentication → Users → Add user → Create new user**: enter the owner's email and a password, and tick
   **Auto Confirm User**.
3. Back in the **SQL Editor**, give that account editing rights (use the same email):
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'niemisha@niemisha.com'
   on conflict do nothing;
   ```
4. **Authentication → Sign In / Providers → Email**: turn off **Allow new users to sign up**.
   (Even with sign-ups on, only accounts in `public.admins` can edit.)
5. **Authentication → URL Configuration**: set **Site URL** to `https://niemisha.com` and add
   `https://niemisha.com/admin/index.html` under **Redirect URLs**, so "Forgot your password?" emails work.
6. Open `https://niemisha.com/admin/`, sign in, and choose **Import the current site** (or **Start empty**).

To add another editor later, repeat steps 2 and 3 with their email.

### Trying it locally without Supabase

Empty both values in `js/config.js` and serve the folder on `localhost`: the admin runs in **preview mode**,
accepting any sign-in and saving only to that browser.

## Before launch (brief §14)

- Replace every placeholder record, the email, and the intro paragraphs; add images under `images/`.
- Add the CV PDF (e.g. `cv/Niemisha_Sharma_CV.pdf`) and set `cv` in `js/data.js`.
- Decide whether the contact form should send through a form service, or whether opening the visitor's email app is enough.
- Remove the `noindex` line from each page's `<head>` and add a `sitemap.xml`.
