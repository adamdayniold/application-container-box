# Decisions

Short notes on why the pipeline and the image work the way they do, and what each choice costs.

## Build once, promote by retag

**Decision:** An image is built once, on `stage`, and tagged `:sha-<commit>`. A release to `main` retags that same image as `:production` with `docker buildx imagetools create`. It does not rebuild.

**Why:** Production runs the exact artifact that was tested on `stage`. A rebuild could produce a different image from the same code. A retag is a registry-side copy: `:production` is an index that wraps the same amd64 manifest as `:sha-17539091...` (`sha256:270edd21...`), so the image is identical. The `main` promotion took 36 seconds, against about 3 minutes for a build.

**Trade-off:** The retag copies whatever `:sha-<commit>` holds, so production only has the platforms that were built on `stage`.

## Fast-forward only, never the GitHub merge button

**Decision:** `stage` is promoted to `main` from the command line with `git fetch` and `git merge --ff-only origin/stage`.

**Why:** A fast-forward keeps the same commit hash on both branches, so the image built for `stage` can be found by its `:sha-<commit>` tag. GitHub's merge, squash and rebase buttons all create a new commit, so no image would exist for it and the pipeline would rebuild.

**Trade-off:** GitHub has no fast-forward-only button, and a required pull request on `main` would block the fast-forward push. The planned branch protection therefore uses required status checks and linear history instead. It is not enforced yet, because the repository is private.

## The pipeline detects the path from the registry

**Decision:** On a push to `main`, the `detect` job checks whether `:sha-<commit>` exists in Docker Hub. If it does, `promote` retags it. If not, `hotfix` runs the checks, builds and pushes.

**Why:** No flag, branch name or tag convention to remember. The registry already holds the answer.

**Trade-off:** Pushing the same commit to `stage` and `main` at the same time is a race, because `detect` may run before `build-stage` finishes. It happened on 2026-11-08, and `main` took the hotfix path. Push to `stage` first and wait for the build.

**Checked on 2026-11-18, through a pull request:** a one-line Dockerfile comment on a `hotfix/*` branch, a PR to `main` (the `test` job ran on the PR), and a squash merge (a merge commit is refused by the linear-history rule). The new commit had no image, so `detect` chose `hotfix`, which ran lint, typecheck, Jest and `npm audit`, then built and pushed `:sha-<commit>` and `:production` from one build: both resolve to the same bare manifest (`fe8a888f...`). **The back-merge must be a rebase, not a merge (corrected 2026-11-19):** the hotfix is squash-merged, so `main` has a commit that `development` and `stage` lack. On 2026-11-18 it was brought back with `git merge origin/main` into `development`, which created the merge commit `bb0f2db`. Pushing the hotfix commit straight to `stage` would have made `build-stage` rebuild it and overwrite `:sha-<commit>`, which the merge avoided, but the merge commit then sat in `stage`'s history. On 2026-11-19 the next release (`git merge --ff-only origin/stage`, `git push origin main`) was rejected by the `protect-main` rule "This branch must not contain merge commits" (GH013, violation `bb0f2db`), because linear history forbids a push that brings in a merge commit. Fix: `git rebase origin/main` on `development` (the merge commit disappears and the other commits are replayed on top of the hotfix commit; the tree was identical, only the SHAs changed), then `git push --force-with-lease` to `development` and to `stage`. `stage` built the new SHA (`db3764f`), and `main` fast-forwarded without a rebuild; `:production` wraps the manifest `53a4c143...`, which is `:sha-db3764f...`. Rebasing is the only back-merge that keeps history linear. The costs are a force-push on two shared branches, new SHAs for any unreleased `development` commits (so `stage` rebuilds them), and one rule: do not back-merge while something on `stage` is being verified. If `development` has nothing of its own, the rebase only moves it to the hotfix commit, and the `build-stage` change below then finds the image and does not rebuild. The `hotfix` job got the Trivy scan on 2026-11-19 (commit `e956250`, now `db3764f` after the rebase). **Full run with the corrected procedure, 2026-11-20:** branch `hotfix/dockerfile-comment` from `origin/main` (`db3764f`), a one-line Dockerfile comment, PR #26, squash merge to `1fa8ac3`. The `main` run (44729734962) took the `hotfix` path: `detect` found no `:sha-1fa8ac3...`, `promote` was skipped, and `hotfix` ran the Trivy scan before the push. `:sha-1fa8ac3...` and `:production` are the same bare manifest (`ee20c4d2...36b5`). Back-merge: `git rebase origin/main` on `development` (one commit of its own, the docs commit, replayed as `f3d4137`; no merge commits), then `git push --force-with-lease` to `development` and `stage`; both runs were green (44730827442, 44731277286). Because `development` had a commit of its own, `stage` built `f3d4137` normally. The skip path of `build-stage` (image already exists) was therefore not exercised here; it applies only when `development` has nothing of its own, and was tested separately on 2026-11-19.

**`build-stage` skips when the image already exists (added 2026-11-19):** on a push, `build-stage` runs the same registry check as `detect` (`docker buildx imagetools inspect <image>:sha-<commit>`). If the image exists, the scan build, the Trivy scan and the push are skipped, and one step runs `docker buildx imagetools create -t <image>:stage <image>:sha-<commit>`, so `:stage` follows the commit without a rebuild and `:sha-<commit>` keeps its digest. A manual run (`workflow_dispatch`) is never skipped, because rebuilding the same commit is the point of the arm64 option. Checked on `stage` with commit `865ce26`: the first run built, scanned and pushed (`:sha-865ce26...` is the manifest `229a0e5e...`); re-running the same run skipped the three build steps, ran the retag, left `:sha-865ce26...` at `229a0e5e...`, and `:stage` became an index whose single `linux/amd64` manifest is `229a0e5e...`. **Side effect:** `:stage` is an index after a retag, but a bare manifest after a build; nothing reads it, since the Helm chart pins `sha-<commit>`.

## amd64 by default, arm64 on demand

**Decision:** CI builds `linux/amd64`. `linux/arm64` is built only when ticked on a manual run of the workflow. The hotfix path is always amd64.

**Why:** The arm64 half ran under QEMU emulation and took 15 to 18 minutes. An amd64-only `stage` build takes about 3 minutes, and nothing the project runs on needs arm64.

**Trade-off:** An arm64 run rebuilds the same commit and replaces `:sha-<commit>` and `:stage` with a multi-arch index, so run it before promoting to `main`.

## Immutable SHA tags in the Helm chart

**Decision:** The Helm chart pins `sha-<commit>`, not `:stage`.

**Why:** With `:stage` and `pullPolicy: IfNotPresent`, the node kept an old cached image. An immutable tag pins every deploy to one known image, and a rollback is a revert of one commit.

**Trade-off:** The tag is bumped by hand after each `stage` build. Flux image automation could do it, but it needs a sortable tag from CI because commit hashes have no order.

## One image for every environment

**Decision:** The production image uses Next.js `standalone` output, runs as a non-root user, and reads its configuration (`MONGODB_URI`, `MONGODB_DB`) from runtime environment variables.

**Why:** The same image runs on `stage` and in production, so nothing environment-specific is baked in. `NEXT_PUBLIC_*` variables are avoided because Next.js fixes them at build time. Standalone output keeps the image small, about 75 MB.

**Trade-off:** Any configuration that must reach the browser needs a different mechanism than `NEXT_PUBLIC_*`.

## Provenance and SBOM attestations are off

**Decision:** The build sets `provenance: false` and `sbom: false`.

**Why:** Attestations add extra manifest entries to the image index, which would complicate the retag. Without them, `:production` wraps exactly the image that `:sha-<commit>` points at.

**Trade-off:** The images carry no build provenance or SBOM attestations for now. Worth revisiting once the promotion path is settled.

## Metrics use the route pattern as a label

**Decision:** `http_requests_total` and `http_request_duration_seconds` are labelled with the fixed route pattern (for example `/api/contacts/[id]`), never the real URL. The health routes and `/api/metrics` itself are not counted.

**Why:** A label per contact id would create a new time series for every contact, and Prometheus memory would grow without limit. The kubelet calls the health routes every 10 seconds, and counting scrapes of `/api/metrics` would make the metrics measure themselves, so both would only add noise.

**Trade-off:** Two requests to different ids cannot be told apart in the metrics. That detail belongs in logs, not metrics.

## The contacts page derives its loading and error states

**Decision:** The page remembers which request its last list result belongs to (`loadResult = { key, error? }`, where the key is built from the reload counter, the page, the debounced search and the status filter) and derives everything else from it. Before the first result there is nothing to show, so the table says "Loading contacts…". A later request is one whose key differs from the last result's: the old rows stay, dimmed and marked `aria-busy`. A failed request shows an error row with a "Try again" button, not the "No contacts match" message, and the error only counts while it belongs to the current request, so it clears by itself on the next search, page change or retry. The stat cards show a dash until the summary has loaded, or when it fails, never a made-up 0. The red banner at the top is only for save and delete errors.

**Why:** Before this, a failed list looked exactly like an empty search result, and the cards showed 0 whenever the summary was missing. A `loading` flag set at the start of an effect would mean setting state synchronously inside an effect (which React's lint rules warn about) and a second piece of state to reset the error. Comparing keys is derived state: there is nothing to reset, and a result from an old request can never be mistaken for the current one.

**Trade-off:** The key is a string built by hand, so a new input to the list query has to be added to the key and to the effect's dependencies, or the busy state stops matching. If a reload fails after an earlier success, the cards keep their last numbers (only the first load shows dashes). Late answers from superseded requests are ignored, not aborted: the browser still finishes them. There is no automatic retry, only the button.

## Structured request logs, without bodies

**Decision:** The app writes one JSON line per request (`time`, `level`, `msg`, `method`, `route`, `status`, `duration_ms`, and `error` when a handler throws) from the same wrapper that records the metrics. The level follows the status: 5xx is `error`, 4xx is `warn`, anything else is `info`. Request bodies, the health routes and `/api/metrics` are not logged. `LOG_LEVEL=silent` turns the logger off.

**Why:** Alloy ships stdout to Loki, and `| json` turns each field into something to filter on. Bodies hold names and emails, and the kubelet probes would drown the useful lines (the same reasoning as for the metrics). `route` is the pattern, not the real URL.

**Trade-off:** A hand-written logger of about 10 lines instead of a library such as pino: nothing to bundle or explain, but no log levels beyond `silent`, no redaction helpers and no request ids. Worth revisiting if the app grows.

## Emails are unique, enforced by an index and checked in code

**Decision:** Creating or updating a contact fails with `409` when another contact already has the same email, ignoring case (`Ada@x.com` equals `ada@x.com`). Two things enforce it. The data layer first looks for an existing email with a case-insensitive collation (the fast path, and the way a clear error is produced). Behind it, a unique index on `email` with the same collation makes MongoDB itself refuse a second copy; a duplicate-key error (code `11000`) from the insert or the update is turned into the same `409`. On update the contact being edited is excluded from the lookup, so saving it with its own email still works. Emails are stored trimmed, and the validator also requires an email shape and caps field lengths (100 characters, 254 for the email).

**Where the index is created:** The app has no startup step, so `getDb()` creates it right after the first successful connect, inside the cached connection promise. That runs once per process, and `createIndex` does nothing if the index already exists. A failed connect still clears the cache and is retried.

**Why:** A contacts list with silent duplicates is the first thing a user would hit. The lookup alone is not atomic: two simultaneous requests with the same new email can both pass it. Only the database can close that gap. The error is recognised by its `code`, not with `instanceof`, because the contacts tests mock the whole `mongodb` module.

**Trade-off:** If the database already holds duplicate emails, MongoDB cannot build the index. The app then logs a warning (`could not create the unique email index`) and keeps running with the lookup alone, so the race protection is missing until the duplicates are removed and the app restarts; the index is not retried while the process lives. Failing to start was the alternative; it was rejected because a data problem should not take the whole app down. Duplicates that were already there are never deleted automatically.

**Checked against a real MongoDB** (`docker compose` and `curl`): the index appears as `email_1` with `unique: true` and the collation; a duplicate in a different case gives `409` on `POST` and `PUT`; ten parallel `POST`s with one new email give one `201`, nine `409`s and one stored document; with duplicates in the database the app logs the warning and still answers `200`; after removing them and restarting, the index is built.

## The contact list is paged, searched and filtered on the server

**Decision:** `GET /api/contacts` takes `page`, `limit`, `q` and `status` and returns `{ items, total, page, limit }`. The page is capped at 100 contacts, defaults to 20, and the UI asks for 10. Bad parameters fall back to the defaults instead of failing the request. The search is a case-insensitive regex over name, email, company and role, with the user's text escaped first, so a search for `(` is just a search. The stat cards come from a separate `GET /api/contacts/summary` (three count queries), because they describe the whole workspace and must not change when someone searches or filters. The page waits 300 ms after the last keystroke before searching, goes back to page 1 whenever the search or filter changes, jumps to page 1 after a create, and steps back one page when a delete empties the last page.

**Why:** The list used to return every contact, and the browser did the searching, filtering and counting, so the response grew with the data and the stat cards would have shown only the loaded page the moment it was paged. Moving the query to the server keeps the response size fixed. Splitting the totals into their own endpoint keeps the cards honest.

**Trade-off:** The regex search cannot use an index, so it scans the collection; that is fine for a demo-sized list and would need a text index or a search service beyond that. The summary costs three queries on every page load and after each change. The page and the count run as two queries, so a contact added in between can make the total off by one for a moment. `GET /api/contacts` changed from a plain array to an object, which is safe here only because the UI and the API ship in the same image.

## The image is scanned before it is pushed, and npm is removed from the runtime

**Decision:** `build-stage` builds the `linux/amd64` image into the runner's Docker daemon, scans it with Trivy (`CRITICAL` and `HIGH`, fixable findings only) and fails the job on any result. Only then does the existing step build again and push `:sha-<commit>` and `:stage`; the second build reuses the layer cache. The Trivy action is pinned to a commit SHA (with the version in a comment). In the `prod` stage of the `Dockerfile`, npm, npx, Yarn and corepack are deleted.

**Why:** With build once, promote by retag, the registry copy is the production artifact, so the scan has to happen before anything is pushed. Scanning after the push would let a bad image be promoted before anyone read the result. The first local scan found six HIGH findings, all in packages bundled with npm in the official Node image (`brace-expansion` and `undici`), none in the app or the Alpine layer. The app never runs npm, so removing it fixes today's findings and the next ones, which a `.trivyignore` or waiting for a newer Node image would not.

**Trade-off:** Fixable-only (`ignore-unfixed`) means a vulnerability with no published fix does not block a build, so the gate is a floor, not a guarantee. A new CVE in the base image can fail a `stage` build that changed nothing; the response is a bump of the pinned Node image. Deleting files in a later layer does not shrink the image, because they stay in the base layers (Trivy reads the merged filesystem, so the findings do go away). There is no npm inside the production container for debugging. The scan runs on `stage` only: `hotfix` pushes without scanning, and `promote` copies an image that was scanned when it was built. The multi-arch (arm64) image is not scanned separately, only the amd64 one.

**Checked:** a local `docker build` and `docker run` of the `prod` stage: `command -v npm` finds nothing, Trivy exits `0`, and `/api/health` answers `200`. The `stage` run built, scanned and pushed in about 4 minutes, and the cluster runs the same image by its digest.
