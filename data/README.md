# Data policy

Only processed numbers and our own analysis are published. Nothing in `data/raw/` is committed or published. It is a private cache and backup of source data, kept on the maintainer's machine and in an R2 bucket with no public access, so reports can be rebuilt quickly without fetching every source again.

| `dataPolicy` | Used for | What we keep in `data/raw/` and in R2 |
|---|---|---|
| `full-copy` | Sources with a clear license or public data, such as CC0, CC BY, MIT, GPL or US government data | The downloaded data, as a private cache |
| `numbers-only` | Sources with no clear data license | Only the counts, numbers and short labels we calculate from, never text, links or whole files |
| `quote-only` | Sources whose terms restrict automated collection | Nothing. A person quotes a figure by hand, with its citation |

Each source sets its policy in `src/content/sources/`. `npm run check:data` fails if a numbers-only folder holds anything else or a quote-only source has a folder, and `npm run cache:synchronize` runs it before every upload.

Keeping less data does not make a prohibited fetch allowed, so a `quote-only` source only changes after its owner gives permission or publishes a license.

# Cache

`data/raw/` is stored in the private `issoftwaresolved` bucket, as `data/raw/<month>/<source>.tar.gz`, with `data/raw/manifest.json` listing the latest snapshot of each source. Months are in UTC. The site build never reads R2, so everything it needs in `data/` and `src/content/` is committed.

| Command | What it does |
|---|---|
| `npm run cache:synchronize` | Restores what is missing or out of date, uploads local changes, fetches sources not yet fetched this month, and rebuilds the index if anything changed |
| `npm run cache:synchronize -- --force nvd` | Fetches a source again and replaces this month's snapshot, even if it shrank |
| `npm run cache:synchronize -- --models` | Also asks newly released AI models, which spends OpenRouter credits |
| `npm run cache:pull` | Only restores snapshots, for example on a new machine. Then `npm run index` works without fetching |

Add `--replace` to take the R2 copy of a source that differs from both R2 and the last sync. Commit the results of a sync yourself: `data/` and `src/content/`.

Run it after about the 10th of the month, because some sources publish last month's numbers late. A source that was fetched too early picks them up the next month.

- **Failed fetches:** the last snapshot is restored and the source retries on the next run.
- **Suspicious fetches:** a source below half its previous size is not uploaded unless forced.
- **Identical fetches:** recorded as fetched, without storing another copy.
- **Retention:** `stack-overflow` keeps only its latest snapshot, because we could not confirm how long its API terms allow data to be kept. Add a source to `LATEST_ONLY` in `scripts/sync-cache.mjs` if its terms limit retention.
- **Hand-run data:** `model-opinions`, `bluesky`, and the Hacker News stance files can't be fetched again. Sync uploads them when they change, and never overwrites them without `--replace`.

Most sources return or keep their whole history, so trends come from the latest snapshot and older ones are only an audit trail. AI company jobs only show today, so `data/ai-company-jobs-history.json` holds that history and must stay committed, along with `data/score-history.json` and `data/signal-checks.json`.

AI models are asked once per prompt, because a released model doesn't change and asking again only measures noise. `npm run models:ask -- --dry-run` lists who would be asked. Answers are never overwritten, and changing the prompt archives them as `answers-<hash>.json`, because scores from different prompts can't be compared.
