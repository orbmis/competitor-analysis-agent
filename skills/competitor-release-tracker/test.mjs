import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadSources, run } from "./tracker.mjs";

async function withTemp(fn) {
  const dir = await mkdtemp(join(tmpdir(), "wallet-release-tracker-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeSources(path, competitors) {
  await writeFile(path, JSON.stringify({ competitors }));
}

function competitor(overrides = {}) {
  return {
    id: "metamask",
    name: "MetaMask",
    github_repos: [],
    x_accounts: [],
    blog_urls: [],
    ...overrides,
  };
}

test("loads framework-agnostic source config", async () => {
  await withTemp(async (dir) => {
    const sources = join(dir, "sources.json");
    await writeSources(sources, [competitor({ id: "rabby", name: "Rabby" })]);
    const loaded = await loadSources(sources);
    assert.equal(loaded[0].id, "rabby");
  });
});

test("GitHub releases report only after baseline", async () => {
  await withTemp(async (dir) => {
    const sourcesPath = join(dir, "sources.json");
    const statePath = join(dir, "state.json");
    const reportsDir = join(dir, "reports");
    await writeSources(sourcesPath, [
      competitor({
        id: "rabby",
        name: "Rabby",
        github_repos: ["https://github.com/RabbyHub/Rabby"],
      }),
    ]);

    const v1 = {
      id: "1",
      title: "v1",
      url: "https://github.com/RabbyHub/Rabby/releases/tag/v1",
      publishedAt: "2026-06-01T00:00:00Z",
      source: "https://github.com/RabbyHub/Rabby",
    };
    await run({
      sourcesPath,
      statePath,
      reportsDir,
      now: new Date("2026-06-01T00:00:00Z"),
      githubLatestRelease: async () => v1,
    });

    const v2 = { ...v1, id: "2", title: "v2", url: "https://github.com/RabbyHub/Rabby/releases/tag/v2" };
    const { reportPath } = await run({
      sourcesPath,
      statePath,
      reportsDir,
      now: new Date("2026-06-08T00:00:00Z"),
      githubLatestRelease: async () => v2,
    });
    const body = await readFile(reportPath, "utf8");
    assert.match(body, /New releases detected: 1/);
    assert.match(body, /v2/);
  });
});

test("X release announcements use since-id state", async () => {
  await withTemp(async (dir) => {
    const sourcesPath = join(dir, "sources.json");
    const statePath = join(dir, "state.json");
    const reportsDir = join(dir, "reports");
    await writeSources(sourcesPath, [competitor({ x_accounts: ["MetaMask"] })]);

    await run({
      sourcesPath,
      statePath,
      reportsDir,
      now: new Date("2026-06-01T00:00:00Z"),
      xRecentReleasePosts: async () => ({ newestId: "10", releases: [] }),
    });

    const post = {
      id: "11",
      title: "Released wallet notifications",
      url: "https://x.com/MetaMask/status/11",
      publishedAt: "2026-06-08T00:00:00Z",
      source: "https://x.com/MetaMask",
    };
    const { reportPath } = await run({
      sourcesPath,
      statePath,
      reportsDir,
      now: new Date("2026-06-08T00:00:00Z"),
      xRecentReleasePosts: async (_handle, _token, sinceId) => {
        assert.equal(sinceId, "10");
        return { newestId: "11", releases: [post] };
      },
    });
    const body = await readFile(reportPath, "utf8");
    assert.match(body, /X announcement/);
    assert.match(body, /Released wallet notifications/);
  });
});

test("blog changes are reported only when release-signaled", async () => {
  await withTemp(async (dir) => {
    const sourcesPath = join(dir, "sources.json");
    const statePath = join(dir, "state.json");
    const reportsDir = join(dir, "reports");
    await writeSources(sourcesPath, [competitor({ blog_urls: ["https://metamask.io/news/"] })]);
    const pages = new Map([
      [
        "https://metamask.io/news/",
        "<title>News</title><a href=\"/news/old-post\">Old post</a>",
      ],
      [
        "https://metamask.io/news/old-post",
        "<title>Old post</title><p>General product update.</p>",
      ],
    ]);
    const fetchText = async (url) => ({ text: pages.get(url), finalUrl: url, status: 200 });
    await run({
      sourcesPath,
      statePath,
      reportsDir,
      now: new Date("2026-06-01T00:00:00Z"),
      fetchText,
    });

    pages.set(
      "https://metamask.io/news/",
      "<title>News</title><a href=\"/news/new-wallet-notifications\">Released wallet notifications</a><a href=\"/news/old-post\">Old post</a>",
    );
    pages.set(
      "https://metamask.io/news/new-wallet-notifications",
      "<title>Released wallet notifications</title><p>Released new wallet notifications today.</p>",
    );
    const { reportPath } = await run({
      sourcesPath,
      statePath,
      reportsDir,
      now: new Date("2026-06-08T00:00:00Z"),
      fetchText,
    });
    const body = await readFile(reportPath, "utf8");
    assert.match(body, /Blog\/release page/);
    assert.match(body, /Release: \[Released wallet notifications\]\(https:\/\/metamask.io\/news\/new-wallet-notifications\)/);
  });
});

test("blog listing pages are not emitted as release URLs", async () => {
  await withTemp(async (dir) => {
    const sourcesPath = join(dir, "sources.json");
    const statePath = join(dir, "state.json");
    const reportsDir = join(dir, "reports");
    await writeSources(sourcesPath, [competitor({ id: "ambire", name: "Ambire", blog_urls: ["https://blog.ambire.com/"] })]);

    const pages = new Map([
      [
        "https://blog.ambire.com/",
        "<title>Ambire Blog</title><nav><a href=\"/about\">About</a></nav><a href=\"/wallet-v2\">Wallet v2</a>",
      ],
      [
        "https://blog.ambire.com/wallet-v2",
        "<title>Wallet v2</title><p>Introducing wallet v2 today.</p>",
      ],
    ]);

    const fetchText = async (url) => ({ text: pages.get(url), finalUrl: url, status: 200 });
    await run({
      sourcesPath,
      statePath,
      reportsDir,
      now: new Date("2026-06-01T00:00:00Z"),
      fetchText,
    });

    pages.set(
      "https://blog.ambire.com/",
      "<title>Ambire Blog</title><nav><a href=\"/about\">About</a></nav><a href=\"/wallet-v3\">Wallet v3</a><a href=\"/wallet-v2\">Wallet v2</a>",
    );
    pages.set(
      "https://blog.ambire.com/wallet-v3",
      "<title>Wallet v3</title><p>Version 3 is now available.</p>",
    );

    const { reportPath } = await run({
      sourcesPath,
      statePath,
      reportsDir,
      now: new Date("2026-06-08T00:00:00Z"),
      fetchText,
    });

    const body = await readFile(reportPath, "utf8");
    assert.match(body, /### Ambire/);
    assert.match(body, /Release: \[Wallet v3\]\(https:\/\/blog\.ambire\.com\/wallet-v3\)/);
  });
});
