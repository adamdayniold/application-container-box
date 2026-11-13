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

## Structured request logs, without bodies

**Decision:** The app writes one JSON line per request (`time`, `level`, `msg`, `method`, `route`, `status`, `duration_ms`, and `error` when a handler throws) from the same wrapper that records the metrics. The level follows the status: 5xx is `error`, 4xx is `warn`, anything else is `info`. Request bodies, the health routes and `/api/metrics` are not logged. `LOG_LEVEL=silent` turns the logger off.

**Why:** Alloy ships stdout to Loki, and `| json` turns each field into something to filter on. Bodies hold names and emails, and the kubelet probes would drown the useful lines (the same reasoning as for the metrics). `route` is the pattern, not the real URL.

**Trade-off:** A hand-written logger of about 10 lines instead of a library such as pino: nothing to bundle or explain, but no log levels beyond `silent`, no redaction helpers and no request ids. Worth revisiting if the app grows.

## Emails are unique, checked in code

**Decision:** Creating or updating a contact fails with `409` when another contact already has the same email, ignoring case (`Ada@x.com` equals `ada@x.com`). The check is a `findOne` with a case-insensitive collation; on update the contact being edited is excluded, so saving it with its own email still works. Emails are stored trimmed, and the validator also requires an email shape and caps field lengths (100 characters, 254 for the email).

**Why:** A contacts list with silent duplicates is the first thing a user would hit. A lookup in the data layer needs no database setup, and it is covered by unit tests plus a manual check against a real MongoDB.

**Trade-off:** Check-then-write is not atomic, so two simultaneous requests with the same email can both pass. A unique index with the same collation would close that gap, but the app has no startup step that creates indexes, and adding one for a single constraint was not worth it yet. Duplicates that were already in the database are not touched.
