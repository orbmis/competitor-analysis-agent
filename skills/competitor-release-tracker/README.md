# Self-Custody Wallet Competitor Release Tracker

This is a framework-agnostic JavaScript agent for detecting and reporting new
self-custody wallet competitor releases.

It is intentionally simple:

- Reads competitor sources from `sources.json`.
- Checks GitHub repositories for latest releases.
- Uses the X API to query competitor X accounts for release announcements.
- Watches configured blog, changelog, or release pages for release-related updates.
- Records newly detected releases in a dated Markdown file.
- Stores lightweight local state so future runs only report new releases.

It does not analyze release notes. It only reports what was released and where it
was detected.

## Files

- `tracker.mjs`: dependency-free Node.js runner and reusable module.
- `sources.json`: competitor source list grouped by wallet.
- `state.json`: generated local state file, ignored by git.
- `reports/competitor-release-tracker/*.md`: generated Markdown reports, ignored by git.

## Configure Sources

Add or edit competitors in `sources.json`:

```json
{
  "id": "example-wallet",
  "name": "Example Wallet",
  "x_accounts": ["ExampleWallet"],
  "blog_urls": ["https://example.com/blog"],
  "github_repos": ["https://github.com/example/wallet"]
}
```

Rules:

- Use stable lowercase `id` values.
- Use X handles without `@`.
- Use exact GitHub repository URLs, not organization URLs.
- Prefer blog, changelog, news, or release URLs over general homepages.
- Keep arrays empty when a source type is unavailable.

## Credentials

X checks require an X API bearer token:

```sh
export X_BEARER_TOKEN="..."
```

GitHub checks work without credentials but may hit public rate limits. To raise
limits:

```sh
export GITHUB_TOKEN="..."
```

## Run

```sh
node competitor-release-tracker/tracker.mjs
```

Useful options:

```sh
node competitor-release-tracker/tracker.mjs --competitor metamask
node competitor-release-tracker/tracker.mjs --competitor metamask --competitor rabby
node competitor-release-tracker/tracker.mjs --no-state-write
node competitor-release-tracker/tracker.mjs \
  --sources /path/to/sources.json \
  --state /path/to/state.json \
  --reports-dir /path/to/reports
```

The first run establishes a baseline and normally reports no releases. Later
runs compare GitHub release IDs, X tweet IDs, and blog page hashes against
`state.json`.

## Use From Any Agent Harness

Call the CLI from the harness:

```sh
node competitor-release-tracker/tracker.mjs
```

Or import the module:

```js
import { run } from "./competitor-release-tracker/tracker.mjs";

const { reportPath, releases, failures } = await run({
  sourcesPath: "./competitor-release-tracker/sources.json",
  statePath: "./competitor-release-tracker/state.json",
  reportsDir: "./reports/competitor-release-tracker",
});
```

The agent can then surface `reportPath` or summarize `releases` and `failures`.

## Maintenance

- Review `sources.json` when adding a competitor wallet.
- Commit source changes.
- Do not commit `state.json` or generated reports.
- If a blog page is too noisy, replace it with a more specific changelog or
  release URL.
