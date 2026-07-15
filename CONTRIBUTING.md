# Contributing to portmon

Thanks for your interest in improving portmon. This guide covers how to set up the project, make changes, and submit them.

## Ways to contribute

- Report bugs and request features via [GitHub Issues](https://github.com/alaminrifat/portmon/issues)
- Improve documentation (README, examples, platform notes)
- Fix bugs or add features via pull requests
- Share feedback after using the CLI on different OSes

## Development setup

Requirements:

- Node.js 18 or later
- npm
- Git

```bash
git clone https://github.com/alaminrifat/portmon.git
cd portmon
npm install
```

### Useful commands

```bash
# Run the CLI without building
npm run dev -- list
npm run dev -- find 3000
npm run dev -- watch

# Compile TypeScript to dist/
npm run build

# Run the built binary
node dist/cli.js list
```

## Project layout

```text
src/
  cli.ts              # Command entry (Commander)
  commands/           # list, find, kill, watch
  lib/                # ports, process, platform, table helpers
  types.ts
```

Cross-platform port discovery lives in `src/lib/ports.ts`. Process kill helpers are in `src/lib/process.ts`. Prefer small, focused changes that keep Windows, macOS, and Linux working.

## Coding guidelines

- Use TypeScript with the existing `strict` settings
- Match the current style (ESM imports with `.js` extensions in source)
- Avoid native addons; stick to Node.js APIs and standard OS tools (`netstat`, `lsof`, `ss`, `taskkill`, etc.)
- Surface clear error messages for permission failures and missing tools
- Keep dependencies minimal

## Testing your changes

There is no formal test suite yet. Before opening a PR, please verify manually:

1. `npm run build` succeeds
2. `node dist/cli.js list` shows listening ports on your OS
3. `node dist/cli.js find <port>` works for a known open port
4. If you touch kill logic: kill a process you started yourself (never system services)
5. If you touch watch mode: run `node dist/cli.js watch` in a real terminal (TTY) and exercise navigation + quit

Note the OS you tested on in the PR description (Windows / macOS / Linux).

## Pull requests

1. Fork the repo and create a branch from `main`
2. Make your changes with a clear commit message
3. Ensure the project builds
4. Open a pull request against `main`

Please include:

- What problem the change solves
- How you tested it
- Screenshots or terminal output if the UI/CLI output changed

## Commit messages

Use short, descriptive messages, for example:

- `Fix Windows netstat parser for IPv6 addresses`
- `Add JSON output to find command`
- `Document watch mode keybindings`

## Reporting bugs

When filing an issue, include:

- portmon version (`portmon --version` or npm package version)
- OS and version
- Node.js version (`node -v`)
- Exact command you ran
- Expected vs actual behavior
- Relevant terminal output (redact sensitive paths if needed)

## Feature requests

Open an issue describing:

- The use case
- Proposed CLI UX (command name, flags)
- Whether it must work on all platforms or only some

## Code of conduct

Be respectful and constructive. Harassment or bad-faith behavior will not be tolerated.

## Releasing (maintainers)

Publishing to npm is automated via GitHub Actions when you create a **GitHub Release**.

### One-time setup

Choose **one** of the following.

#### Option A — npm Trusted Publishing (recommended)

No long-lived token on GitHub. npm trusts this repo’s publish workflow via OIDC.

1. Open the package on npm: https://www.npmjs.com/package/portmon  
2. Go to **Settings → Trusted Publisher** (or **Publishing access**)  
3. Add a GitHub Actions publisher:
   - **Organization or user:** `alaminrifat`
   - **Repository:** `portmon`
   - **Workflow filename:** `publish.yml`
   - **Environment:** leave empty (unless you use GitHub Environments)
4. Save

#### Option B — `NPM_TOKEN` secret

1. Create a **Granular Access Token** at https://www.npmjs.com/settings/~/tokens  
   - Permission: **Read and write**  
   - Packages: select `portmon` (or all packages)  
   - Enable automation / bypass 2FA if offered  
2. In the GitHub repo: **Settings → Secrets and variables → Actions**  
3. Add secret name: `NPM_TOKEN`  
4. Paste the token value

### Publish a new version

1. Bump the version in `package.json` (and commit):

   ```bash
   npm version patch   # 1.0.0 -> 1.0.1
   # or: npm version minor / npm version major
   ```

   `npm version` creates a commit and a git tag (e.g. `v1.0.1`).

2. Push the commit and tag:

   ```bash
   git push origin main --follow-tags
   ```

3. Create a GitHub Release for that tag (UI or CLI):

   ```bash
   gh release create v1.0.1 --title "v1.0.1" --notes "Bug fixes and improvements"
   ```

4. The **Publish to npm** workflow runs and publishes the package.

Check progress under the repo **Actions** tab. After success:

```bash
npm view portmon version
```

### Notes

- The version in `package.json` must be **new** on npm (you cannot republish `1.0.0`).
- `prepublishOnly` runs `npm run build` during publish.
- CI (build + smoke test) runs on every push/PR to `main`.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
