# Updating to the latest email-poster

How to tell which version you're on, what `npx` is really running, and how to
move every kind of consumer — npx, npm/pnpm/bun dependency, Docker image — to
the newest release.

## 1. Which version do I have right now?

```bash
# What the registry's `latest` dist-tag points at:
npm view email-poster version

# What a project has installed:
npm ls email-poster        # npm
pnpm ls email-poster       # pnpm
bun pm ls | grep email-poster  # bun

# What the CLI itself reports:
npx email-poster --version
```

## 2. npx users — the cache gotcha

`npx email-poster <cmd>` resolves in this order:

1. **Local install wins.** Inside a project that has email-poster in
   `node_modules`, npx runs the project's pinned version — no network, no
   `latest`. This is usually what you want.
2. **npx cache.** Otherwise npx reuses its cache at `~/.npm/_npx/` — again no
   network.
3. **Registry (first time only).** Only when 1 and 2 miss does npx resolve
   `latest` and freeze it into the cache as `^<that version>`.

So a bare `npx email-poster` **sticks to the first version it ever resolved on
that machine** — publishing 0.4.0 does not change what it runs. npm applies no
TTL to the npx cache.

To actually get the newest release:

```bash
# The reliable way — @latest is its own cache key, always re-resolved fresh:
npx -y email-poster@latest test --to you@example.com …

# Or wipe the npx cache so the next bare `npx email-poster` re-resolves:
rm -rf ~/.npm/_npx                       # macOS / Linux
# Windows (cmd): rmdir /s /q "%LocalAppData%\npm-cache\_npx"

# Inspect what the cache holds:
python3 -c "import json,glob;[print(f.split('/_npx/')[1][:8], json.load(open(f)).get('dependencies')) for f in glob.glob('$HOME/.npm/_npx/*/package.json') if 'email-poster' in json.load(open(f)).get('dependencies',{})]"
```

Tip: `-y` only skips the "Ok to proceed?" install prompt — it has no effect on
version selection.

## 3. Project dependency (the common case)

Bump the semver range and reinstall:

```bash
npm install email-poster@latest
pnpm add email-poster@latest
bun add email-poster@latest
```

Then **commit the lockfile** — CI and Docker builds resolve from the lockfile,
not from `latest`, so the update only propagates when the lockfile travels.

Gotchas:

- **Pinned exact versions** (`"email-poster": "0.3.6"`, no `^`) never move on
  their own — edit the specifier explicitly.
- **A `^` range only allows minor/patch.** A future `1.0.0` needs
  `email-poster@latest` (or `@^1`) anyway.
- **pnpm `minimumReleaseAge`** (supply-chain age gating) refuses packages
  published more recently than the configured window. Exempt your own fresh
  releases in `pnpm-workspace.yaml`:

  ```yaml
  minimumReleaseAgeExclude:
    - email-poster@0.3.4 || 0.3.9   # append each new version you adopt
  ```

- **`file:` dev links**: during local development a consumer may point at
  `"email-poster": "file:../email-poster"`. After publishing, switch the
  specifier back to a registry range (`^0.3.9`) and reinstall — otherwise the
  project keeps shipping whatever the local checkout contained. pnpm/bun copy
  `file:` deps at install time, so touching the library requires a reinstall
  (not just a rebuild) to propagate.

## 4. Verify the update took

```bash
npm ls email-poster                       # shows the resolved version
npx email-poster --version                # CLI banner version
npx email-poster test --to you@example.com --preset smtogo --url https://…   # end-to-end smoke
```

The `test` command (≥ 0.3.9) sends the built-in monochrome light/dark test
email — if it arrives, URL, field map, and auth are all good on the new
version.
