# application-container-box

[![CI/CD](https://github.com/adamdayniold/application-container-box/actions/workflows/ci-cd.yaml/badge.svg)](https://github.com/adamdayniold/application-container-box/actions/workflows/ci-cd.yaml)
[![Docker Hub](https://img.shields.io/badge/Docker%20Hub-adamdayniold%2Fcrud--mongodb-2496ED?logo=docker&logoColor=white)](https://hub.docker.com/r/adamdayniold/crud-mongodb)

A Next.js + MongoDB contacts CRUD app, packaged as a container image (`linux/amd64` by default, `linux/arm64` on demand) and shipped through a GitHub Actions pipeline that tests once, builds once and promotes the same image to production. It runs in the cluster defined by [mywebapp-k8s-helm](https://github.com/adamdayniold/mywebapp-k8s-helm).

> **Status:** work in progress. The pipeline (test, build once, promote, tested hotfix path) has run end to end, and the image runs in a k3d cluster pinned by its `sha-<commit>` tag. See [CI/CD](#cicd) and [docs/decisions.md](docs/decisions.md). Still to do: more tests.

![Contacts page of the app, showing three summary cards (total, active and new leads), a table of sample contacts with search, status filters and Edit and Delete links, and an "Add a contact" form on the right](docs/ui-screenshot.png)

## What this shows

- **Multi-stage Dockerfile:** `base`, `dev`, `builder` and `prod` stages. The production image uses Next.js `standalone` output (about 75 MB) and runs as a non-root user (uid 1001). Dependencies install in their own cached layer before the source is copied, so a code change rebuilds in seconds instead of reinstalling everything, and a `.dockerignore` keeps local files, secrets and docs out of the build context.
- **Build once, promote the same image:** an image is built on `stage` and tagged `:sha-<commit>`. A release to `main` retags that image as `:production` instead of rebuilding it.
- **Tested hotfix path:** a commit that reaches `main` without an image is linted, type-checked and tested before it is built and pushed.
- **`linux/amd64` by default, `linux/arm64` on demand:** the arm64 half of a multi-arch build runs under QEMU emulation on the amd64 runner and took 15 to 18 minutes; amd64 only takes about 3 minutes on `stage`, so arm64 is opt-in (see [CI/CD](#cicd)).
- **Health endpoints for Kubernetes probes:** a liveness route that never touches the database and a readiness route that pings MongoDB (HTTP 503 when it is unreachable), so a Mongo outage stops traffic without restart-looping the app.
- **Prometheus metrics:** `/api/metrics` exposes process metrics plus a request counter and a latency histogram for the contacts API, labelled by method, route pattern and status. The Helm repo scrapes it with a ServiceMonitor and shows it on a provisioned Grafana dashboard.
- **Structured JSON logs:** one JSON line per request (method, route pattern, status, duration, and the error message when a handler throws), written to stdout. Alloy ships it to Loki, where `| json` turns each field into something to filter on. Request bodies are never logged.
- **Immutable image tags in the cluster:** the Helm chart pins `sha-<commit>`, so the running image is provable and reproducible, and the node cannot keep a stale cached `:stage`.
- **Image scanning before the push:** `build-stage` builds the image, scans it with Trivy and only then pushes it, so an image with a fixable CRITICAL or HIGH vulnerability never gets a `:sha-<commit>` tag and cannot be promoted. The production image also has npm, Yarn and corepack removed, since the app only runs `node server.js` and their bundled packages were the only findings.
- **A hardened pod:** the Helm chart runs the container as uid 1001 with a read-only root filesystem, no Linux capabilities, no privilege escalation and the default seccomp profile. The app needs no writable path, and this was checked both locally with `docker run --read-only --cap-drop ALL` and in the cluster (see `docs/decisions.md`).
- **Jest tests and lint** gate the pipeline.
- **One Node version (24 LTS)** from `.nvmrc`, used by local development, CI and the image.

## Branch and release model

Branches mirror environments. Promotion is by **fast-forward only**, so `stage` and `main` share the same commit hash and the promote job can find the image.

| Branch | Purpose | What CI does |
| --- | --- | --- |
| `development` | New work | Lint, typecheck, Jest, `npm audit`; non-pushing build of the `dev` target |
| `stage` | Testing on a server | The same checks, then one build (`linux/amd64`; add `linux/arm64` with the manual run option); pushes `:sha-<commit>` and `:stage` |
| `main` | Production | `detect` looks for `:sha-<commit>`. Found: `promote` retags it `:production` (no build, no tests). Missing: `hotfix` runs the checks, builds (`linux/amd64`), and pushes `:sha-<commit>` and `:production` |

Pull requests run the checks only.

```mermaid
flowchart LR
    Dev[development] -->|merge| Stage[stage]
    Stage -->|git merge --ff-only| Main[main]
    Stage -->|push| Test1[lint, typecheck, Jest]
    Test1 --> Build[build once: amd64, arm64 on demand]
    Build --> Hub[(Docker Hub: sha-commit, stage)]
    Main -->|push| Detect{image sha-commit exists?}
    Detect -->|yes| Promote[promote: retag as production]
    Detect -->|no| Hotfix[hotfix: test, build, push]
    Promote --> Hub2[(Docker Hub: production)]
    Hotfix --> Hub2
```

### Releasing

Normal release (the image was already built and verified on `stage`):

```bash
git checkout main && git pull
git fetch
git merge --ff-only origin/stage
git push origin main
```

Do **not** use the GitHub merge button for `stage` to `main`. It creates a new commit, so no image exists for it and the pipeline rebuilds instead of promoting.

### Hotfix

`main` is protected by the `protect-main` ruleset, which requires the `test` check on the commit, so an untested commit cannot be pushed straight to `main`. A hotfix therefore goes through a branch and a pull request:

1. Branch from `main` as `hotfix/<short-name>`, commit the fix and open a pull request to `main`. The `test` job runs on the pull request.
2. When it is green, merge with **squash** or **rebase**, not a merge commit (the ruleset requires linear history). Either creates a new commit, so no image exists for it and the `hotfix` job runs.
3. The `hotfix` job runs lint, typecheck, Jest and `npm audit` again, then builds the image and scans it with Trivy. Only if all pass does it push the image. If anything fails, nothing is pushed and `:production` does not move.
4. Back-merge the fix into `stage` and `development` by **rebasing**, not merging. Otherwise `main` gets ahead and the next fast-forward is impossible. Run `git fetch`, `git switch development`, `git rebase origin/main`, then `git push --force-with-lease origin development` and `git push --force-with-lease origin development:stage`. Do not run `git merge origin/main`: it creates a merge commit, and the linear-history rule on `main` refuses a push that contains one (this happened on 2026-11-19, see `docs/decisions.md`). The rebase puts the hotfix commit under `development`'s own commits, so `main` stays an ancestor of `stage` and the next fast-forward is accepted. If `development` has nothing of its own, the rebase only moves it to the hotfix commit; `build-stage` then finds `:sha-<commit>` already in Docker Hub, skips the scan and the build, and only moves `:stage` to that image, so the image `:production` holds is never overwritten. If `development` has unreleased commits, their SHAs change and `stage` rebuilds them, so do not back-merge while something on `stage` is being verified.

Trade-off: a hotfix skips verification on the `stage` cluster. It passes the automated tests, but it has not run in the cluster first.

## Repository layout

```
app/                  Next.js App Router: pages, api/contacts, api/health, api/metrics, lib/ (MongoDB access, metrics)
Dockerfile            Multi-stage build (base, dev, builder, prod)
docker-compose.yaml   Local development: app + MongoDB + mongo-express
.env.example          Template for the compose credentials (copy to .env)
.github/workflows/    ci-cd.yaml: the pipeline
docs/                 Screenshot, decisions and troubleshooting
jest.config.ts        Test configuration
.nvmrc                Node version used everywhere
LICENSE               MIT
```

## Getting started

Prerequisites: Node 24 (for example via nvm) and Docker.

With Docker Compose (app, MongoDB and mongo-express), the easiest way:

```bash
cp .env.example .env     # dev-only credentials; .env is git-ignored
docker compose up --build
```

The app is then at http://localhost:3000 and mongo-express at http://localhost:8081. The credentials in `.env.example` are for local development only.

Or without Compose, with your own MongoDB (for example the compose one, published on `localhost:27017`):

```bash
nvm use            # reads .nvmrc
npm ci
npm run dev        # needs MONGODB_URI and MONGODB_DB, put them in .env.local (see .env.example)
```

### Environment variables

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string. Required; the app errors without it. |
| `MONGODB_USERNAME`, `MONGODB_PASSWORD` | Optional. When both are set, the app passes them to the driver as options, so the password may contain `@ : / %` without URL-encoding. Then `MONGODB_URI` should hold only the host, for example `mongodb://mongo-service:27017`. If credentials are also inside the URI, these two win. |
| `MONGODB_DB` | Database name. Defaults to `canvas` if unset. |
| `PORT` | Port the production image listens on (`3000`). |
| `HOSTNAME` | Interface the production image binds to (`0.0.0.0`). |
| `LOG_LEVEL` | Optional. Set to `silent` to turn the JSON request logs off (the Jest setup does this). Unset by default. |

The image is the same for every environment. Configuration comes only from these variables at runtime.

### API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/contacts` | List one page of contacts, newest first: `{"items": [...], "total": n, "page": n, "limit": n}`. Query parameters (all optional): `page` (default 1), `limit` (default 20, at most 100), `q` (text search in name, email, company and role, case-insensitive), `status` (`Active`, `Lead` or `Inactive`). Invalid values fall back to the defaults. `total` counts the contacts that match `q` and `status`. |
| `GET` | `/api/contacts/summary` | Counts for the whole workspace, ignoring any search or filter: `{"total": n, "active": n, "leads": n}` |
| `POST` | `/api/contacts` | Create a contact (`400` for invalid input, `409` if the email already exists) |
| `GET` | `/api/contacts/[id]` | Read one contact |
| `PUT` | `/api/contacts/[id]` | Update a contact (`400` invalid, `404` not found, `409` if another contact has that email) |
| `DELETE` | `/api/contacts/[id]` | Delete a contact |
| `GET` | `/api/health` | Liveness: returns `200 {"status":"ok"}`, no database access |
| `GET` | `/api/health/ready` | Readiness: pings MongoDB; `200 {"status":"ready"}`, or `503 {"status":"unavailable"}` if it cannot |
| `GET` | `/api/metrics` | Prometheus text format: process metrics, `http_requests_total` and `http_request_duration_seconds` for the contacts routes |

### Tests and lint

```bash
npm test
npm run coverage
npm run lint
```

## CI/CD

The workflow is `.github/workflows/ci-cd.yaml`. It reads two repository secrets, `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`.

| Job | Runs on | What it does |
| --- | --- | --- |
| `test` | Pull requests, `development`, `stage` | `npm ci`, lint, `next typegen` + `tsc --noEmit`, Jest, `npm audit --omit=dev --audit-level=high` |
| `build-dev` | `development` | Builds the `dev` target, pushes nothing |
| `build-stage` | `stage` (push or manual run) | On a push, first checks whether `:sha-<commit>` already exists in Docker Hub. If it does, it only moves `:stage` to that image. If it does not (and always on a manual run), it builds `linux/amd64` and scans it with Trivy (fails on fixable CRITICAL or HIGH findings); then builds `linux/amd64`, plus `linux/arm64` if the `arm64` option is ticked on a manual run, and pushes `:sha-<commit>` and `:stage` with revision and source labels |
| `detect` | `main` | Checks whether `:sha-<commit>` exists in Docker Hub |
| `promote` | `main`, image found | Retags the image as `:production` |
| `hotfix` | `main`, image missing | Runs the checks, builds `linux/amd64` and scans it with Trivy, then builds `linux/amd64` again and pushes `:sha-<commit>` and `:production` |

`next typegen` runs before the typecheck because Next.js generates the `RouteContext` and `LayoutProps` types into `.next/`, which is not in the repository.

Provenance and SBOM attestations are turned off for now, because they add manifest entries that complicate the retag. The images published by the first runs were indexes with exactly two manifests, `linux/amd64` and `linux/arm64`; amd64-only builds contain a single platform.

To get an arm64 image: Actions, "CI/CD Docker Pipeline", Run workflow, branch `stage`, tick `arm64`. This rebuilds the same commit and replaces `:sha-<commit>` and `:stage` with a multi-arch index, so run it before promoting to `main`. `promote` copies whatever `:sha-<commit>` holds, so production is amd64 only unless the arm64 build was run first. The hotfix path always builds amd64 only, so an emergency build does not wait for emulation.

Dependabot (`.github/dependabot.yaml`) checks npm, Docker and GitHub Actions weekly and opens pull requests against `development`.

## Known limitations and next steps

- The hotfix path has run twice: once on an empty commit pushed straight to `main` (before the ruleset was enforced), and once through the pull request flow above (a Dockerfile comment, squash merge, `hotfix` job built and pushed). The back-merge to `stage` and `development` is manual, and it must be a rebase (see step 4 above); the first back-merge was a merge commit and blocked the next release. The `hotfix` job has had the Trivy scan since 2026-11-19, and the full procedure (pull request, squash merge, scan, push, rebase back-merge, `stage` build) ran once end to end on 2026-11-20. A hotfix image is a bare manifest, not the index that `promote` creates.
- Production images are `linux/amd64` only unless the arm64 build is run on demand.
- Branch protection on `main` is the `protect-main` ruleset (status check `test`, linear history, no force pushes or deletions, no bypass). It requires no pull request, so the fast-forward release push still works. It has been enforced since the repository became public, and both the fast-forward release push and the hotfix pull request flow have been run against it.
- The Helm chart pins an immutable `sha-<commit>` tag, but the tag is bumped by hand after each `stage` build. Planned: Flux image automation (needs a sortable tag format from CI).
- The cluster runs the `stage` build; the Helm chart does not reference `:production` yet, so promotion to `main` is a retag in the registry and does not itself change what the cluster runs.
- The pod's `runAsUser: 1001` is hard-coded in the Helm chart and must match the `nextjs` uid in the `Dockerfile`. If the app ever needs a writable path, the fix is an `emptyDir` at that path, not a writable root filesystem.
- The app can take the MongoDB credentials separately (see the environment variables) and `docker-compose.yaml` does, but the Helm chart still puts them inside `MONGODB_URI` (`mongodb://user:password@host`). Until the chart is switched, a password with `@ : / %` in the cluster breaks the connection with `ERR_INVALID_URL`; keep that password URL-safe.
- No authentication.
- The contact search is an unanchored, case-insensitive regex over four fields. MongoDB cannot use an index for it, so it scans the collection. Fine for a demo-sized list; a text index or a search service would be the next step (see `docs/decisions.md`).
- Email uniqueness is enforced by a unique index (case-insensitive), created when the app first connects. If the database already contains duplicate emails the index cannot be built: the app logs a warning and runs with the lookup check only, which is not atomic, until the duplicates are removed and the app restarts (see `docs/decisions.md`). Duplicates that already existed are never deleted automatically.
- `/api/metrics` has no authentication and is reachable through the Gateway, because the HTTPRoute sends every path to the app. Fine for a local demo; in a real setup it would be restricted to the cluster network.
- Logs are one line per request with no request id or user context. Errors carry only the message; the stack trace comes from Next.js's own unstructured output. The health and metrics routes are not logged on purpose.
- Remaining `npm audit` findings are in dev-only tooling, not in the image.
- The Trivy scan runs on `stage` builds and on the `hotfix` path, before anything is pushed. `promote` does not scan: it copies an image that was scanned when `stage` built it. Findings without a published fix are ignored on purpose (see `docs/decisions.md`).

## Related repositories

- [mywebapp-k8s-helm](https://github.com/adamdayniold/mywebapp-k8s-helm): deploys this image with Flux on k3d.

## More detail

- [docs/decisions.md](docs/decisions.md): why the pipeline and image work the way they do, and what each choice costs.
- [docs/troubleshooting.md](docs/troubleshooting.md): problems hit while building the pipeline and image, with causes and fixes.

## License

MIT, see [LICENSE](LICENSE).
