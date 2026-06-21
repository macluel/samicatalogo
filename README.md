# Couple Catalog

A private, mobile-first movie and series catalog for two people.

## What it includes

- OMDb search through a secure Netlify Function proxy
- Local storage for the catalog, history, filters, and cache
- Favorite, priority, label, context, status, notes, and reason fields
- Random picker and comparison mode
- Backup and restore
- PWA shell with offline caching for the app interface

## Run locally

### Option 1: with Netlify Dev (recommended)

1. Install the Netlify CLI.
2. Put your OMDb key in a Netlify environment variable named `OMDB_API_KEY`.
3. Run:

```bash
npx netlify dev
```

Then open the local URL it prints.

### Option 2: static preview only

Open the site shell locally, but OMDb search will not work unless the function is running.

## Deploy to Netlify

1. Push the folder to GitHub or upload it to Netlify.
2. Set the environment variable `OMDB_API_KEY` in Netlify.
3. Deploy.

`netlify.toml` already points `/api/omdb` to the function.

## OMDb setup

- Get your API key from OMDb.
- Add it as `OMDB_API_KEY` in Netlify environment variables.
- The frontend never receives the key directly.

## Notes

- The app uses localStorage on purpose: the data is small, private, and easy to back up.
- Poster images are cached by the browser when loaded, and missing posters fall back to a clean card.
- The PWA shell works best after the first online visit.
