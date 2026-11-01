# Is software solved?

An index of public evidence on whether AI has solved software engineering, built as a static [Astro](https://docs.astro.build) site on Cloudflare Workers.

## Commands

| Command | What it does |
|---|---|
| `npm install` | Installs dependencies |
| `npm run dev` | Starts the local dev server at `localhost:4321` |
| `npm run build` | Builds the site to `./dist/`. It needs no secrets, only committed files |
| `npm run preview` | Previews the build locally |
| `npm run cache:pull` | Restores the raw data cache from R2 |
| `npm run cache:synchronize` | Refreshes the cache once a month and rebuilds the index |
| `npm run fetch -- <source>` | Fetches sources without uploading them. The next sync uploads the changes |
| `npm run index` | Rebuilds `data/` and `src/content/signals/` from `data/raw/` |
| `npm run check:data` | Checks `data/raw/` against the data policy |
| `npm run models:ask` | Asks newly released AI models, which spends OpenRouter credits |

## Data

Sources are fetched by `scripts/sources/` into `data/raw/`, a private cache and backup of source data, stored in R2 so reports can be rebuilt quickly without fetching every source again. It is ignored by Git and never published. `scripts/build-index.mjs` turns them into the committed numbers the site is built from.

To work on the data, copy `.env.example` to `.env` and fill it in. See [`data/README.md`](data/README.md) for the data policy and monthly snapshots, and [`data/ATTRIBUTION.md`](data/ATTRIBUTION.md) for source credits.
