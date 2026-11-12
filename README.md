# LearnZA

A lightweight, mobile-friendly learning library with offline support and official South African Department of Basic Education (DBE) resources for Grades 1–12.

LearnZA is for all children of South Africa, no matter their background, culture, community, or home language.

## Run locally

Serve this folder over `localhost` (service workers do not work from a `file://` URL):

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. The app shell is cached on your first visit. LearnZA guides can be saved from the site for offline reading. DBE materials open at their official source; download a PDF there to keep it on your device for offline use.

## DBE resource catalogue

The site displays titles, grade/subject information, short descriptions, and original links from DBE workbook, digital-content, state-owned textbook, and study-guide listings. The generated catalogue is bundled with the page so it works without a separate API request, including offline after the first visit. The catalogue is refreshed weekly by `.github/workflows/refresh-dbe-catalogue.yml`; it can also be updated manually:

```sh
python3 scripts/update_dbe_resources.py
```

The scraper stores catalogue metadata and official links in `data/materials.json` and the page-ready bundle in `data/materials.js`; it does not copy or rehost DBE documents.

## Contributors

- Tlotlang Galaletsang Ramatlotlo
- Kgosi Sebako 