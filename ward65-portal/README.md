# Ward No. 65 – Public Service & Development Portal

Website for **HDMC Ward No. 65, Hubballi, Karnataka**. Residents report civic problems with photos or a short video, get a complaint ID, and track progress. Ward staff handle complaints from a protected dashboard. Everything is in English and Kannada.

There is **no sample data** in this package. Every number on the website comes from your database. A new site starts at zero.

---

## 1. What you must supply

| Item | Where it goes | Status |
|---|---|---|
| Homepage banner image | Admin → Website settings → Homepage banner (or the file `assets/img/banner.jpg`) | **You supply** – not included |
| Photos of the three representatives | Admin → Representatives → Edit → Photograph | **You supply** – not included |
| Second corporator's name and designation | Admin → Representatives → "Second Corporator" → Edit | **You supply** – the card stays hidden until you fill it in |
| Ward office address, phone, hours, WhatsApp number, Google Maps link | Admin → Website settings | **You supply** – anything left empty is simply not shown |

Photographs and the banner are stored and shown exactly as you upload them. The site never edits, filters or regenerates them. (Representative cards show the face cropped to fit the card; tapping the photo opens the full picture.)

---

## 2. Setup (about 20 minutes)

You need two free accounts: **Supabase** (database, logins, photo storage) and a place to host the website files (**Netlify** or **Cloudflare Pages** recommended).

### Step 1 – Create the Supabase project
1. Sign in at supabase.com and create a new project (pick the region nearest to India, and save the database password).
2. Wait until the project finishes starting.

### Step 2 – Create the database
1. In Supabase open **SQL Editor → New query**.
2. Open the file `supabase/schema.sql`, copy **all** of it, paste it in, and press **Run**.
3. It creates the tables, the security rules and the two storage buckets. It is safe to run again if something goes wrong.

### Step 3 – Connect the website to Supabase
1. In Supabase open **Project Settings → API**.
2. Copy the **Project URL** and the **anon public** key.
3. Open `assets/js/config.js` and replace the two `PASTE_YOUR_…` values.

> The anon key is meant to be public – the database rules protect the data. **Never** put the `service_role` key anywhere in the website files.

### Step 4 – Create the first administrator
1. In Supabase open **Authentication → Users → Add user**. Enter an email and a strong password.
2. Back in **SQL Editor**, run this (change the email and name):

```sql
insert into public.staff_profiles (user_id, full_name, role)
select id, 'Your Name', 'admin' from auth.users where email = 'you@example.com'
on conflict (user_id) do update set role = 'admin', is_active = true;
```

### Step 5 – Publish the website
Upload the website files: all the `.html` files, `robots.txt`, `_headers` and the `assets/` folder. Leave out the `supabase/` folder and this README – they are for you and should not be published.

* **Netlify:** log in → Add new site → Deploy manually → drag the folder in.
* **Cloudflare Pages:** Create project → Direct upload → upload the folder.
* **GitHub Pages** also works, but it ignores the `_headers` file, so the extra browser security rules are not applied.

Both Netlify and Cloudflare Pages read the `_headers` file automatically. It applies a strict Content-Security-Policy, so **if you later use a custom Supabase domain, add it to `img-src`, `media-src` and `connect-src` in `_headers`.**

### Step 6 – Sign in and fill in the content
Open `https://your-site/admin.html` (there is also a small "Staff login" link at the bottom of every page) and sign in. Then, in this order:

1. **Website settings** – upload the banner; enter office address, phone, hours, WhatsApp number, map link, emergency information.
2. **Representatives** – add photographs and details. Fill in the second corporator and tick "Show on the public website".
3. **Development works & gallery** and **Announcements** – add real work, with before/after photos.

### Step 7 – Do a real test complaint
Submit one complaint from your phone, check it appears in **Admin → Complaints**, update its status, and confirm the resident view shows the change on the Track page. Then delete the test complaint (administrators only) so it does not count in the statistics.

---

## 3. Everyday use

**Handling a complaint:** Admin → Complaints → click a row. You can see the resident's details, photos and videos; change the status, assign a department, write a progress note (tick the box to show it to the resident or leave it as an internal note), and **Mark as resolved** (a description of the resolution is required).

**Searching and reports:** filter by text, area, category, status and date range. **Download Excel** gives a real `.xlsx` file with a summary sheet. **PDF report** opens your browser's print window – choose **Save as PDF** there.

**Adding staff:** create their login in Supabase (Authentication → Users → Add user), then Admin → Staff & permissions → Add staff member with the same email.

| Role | Can do |
|---|---|
| **Administrator** | Everything: complaints, reports, gallery, announcements, representatives, settings, staff |
| **Authorised staff** | Complaints only: view, update, add notes, download reports |

These permissions are enforced by the database itself, not just hidden in the menu.

**Kannada text:** every content form has optional "(Kannada)" boxes. When a Kannada box is empty, the English text is shown to Kannada visitors. The staff dashboard is always in English.

---

## 4. Privacy and security

* Residents' **names, mobile numbers and complaint details are never public.** Visitors can only see aggregate counts (e.g. total complaints). Staff can read them after signing in.
* A resident can look up a complaint only with **both** the complaint ID and the mobile number used. The result never includes the name or number.
* Complaint **photos and videos are in a private bucket**; only signed-in staff can open them (through short-lived links).
* Complaint forms are protected by **rate limits** (5 complaints per mobile number and 15 per IP address per day; limits on tracking lookups too) and a hidden spam-trap field. Photos are checked to be real images and videos are limited to 25 MB.
* Optional **SMS verification** of the mobile number: first set up an SMS provider in Supabase (Authentication → Providers → Phone), test it, and only then tick the box in Admin → Website settings. If you switch it on without SMS working, residents cannot submit complaints.
* Optional hardening: if you do **not** use SMS verification, you can turn off "Allow new users to sign up" in Supabase's Authentication settings. Staff are created by you in the dashboard, so they are unaffected.

---

## 5. Costs and limits (checked on Supabase's own pricing pages, November 2026)

| | Free plan | Pro plan |
|---|---|---|
| Price | $0 | from $25 per month |
| Database | 500 MB | 8 GB |
| File storage (photos/videos) | 1 GB | 100 GB |
| **Paused when quiet** | **Yes – after 1 week of low activity** | No |
| **Daily backups** | **Not included** | Included, kept 7 days |

For a public complaints service, **the Pro plan is strongly recommended**: on the free plan a quiet week pauses the project and the complaint form stops working until someone presses "Resume project", and there are no backups.

If you stay on the free plan: open the site (or submit a test) at least a few times a week, and download **Excel reports regularly** as a safety copy. Excel does not contain the photos.

Photos are shrunk in the visitor's browser (longest side 1600 px) before upload, so each is usually a few hundred KB. Videos (up to 25 MB each) use storage much faster.

---

## 6. Optional: host the Supabase library yourself

By default the pages load the Supabase library from the jsDelivr CDN. To remove that dependency, download
`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js`, save it as `assets/js/vendor/supabase.js`, then in the folder run:

```
sed -i 's#https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js#assets/js/vendor/supabase.js#' *.html
```

---

## 7. How this was tested – and what was not

* **Database (110 checks, PostgreSQL 16):** `schema.sql` was run twice on a real PostgreSQL server (it is re-runnable) with stand-ins for Supabase's login and storage layers. Checks covered: visitors cannot read private data; complaint validation and ID format; rate limits; the tracking lookup hides personal details; staff versus administrator permissions; deactivated staff; storage upload rules; the optional SMS rule; statistics are zero on an empty database and follow real records.
* **Website (225 checks, Chromium):** every public page and the full staff dashboard were driven in a real browser at 320, 390, 768 and 1366 px, in English and Kannada, including complaint submission with photos, video and location, tracking, status updates, Excel and PDF reports, gallery uploads, representative photos stored unchanged, keyboard use and sideways-scroll checks. The browser tests used a stand-in for the Supabase JavaScript library.
* **Not tested here:** a live Supabase project, real SMS delivery, other browsers or real phones, and a real hosting service. Please run **Step 7** (a real test complaint) before announcing the site.

---

## 8. File map

```
index.html  complaint.html  track.html  works.html  gallery.html  updates.html  contact.html
admin.html  404.html        robots.txt  _headers
assets/css/styles.css
assets/img/        (favicon; put banner.jpg here if you prefer a file over the upload)
assets/js/         config.js (edit this)   i18n.js (all English + Kannada wording)
                   common.js render.js home.js complaint.js track.js works.js gallery.js
                   updates.js contact.js   admin*.js export.js icons.js
supabase/schema.sql
```

To change any fixed wording on the site (buttons, headings, help text), edit `assets/js/i18n.js` – English in the `en` block, Kannada in the `kn` block.
