# Troubleshooting

Problems hit while building the pipeline and the image, with their causes and fixes.

## A workflow condition used `=` instead of `==`

**Symptom:** The `build-stage` job was rejected on the first real run, even though the workflow passed `action-validator`.

**Cause:** `if: ... github.ref = 'refs/heads/stage'` has a single `=`. GitHub validates expressions when the workflow runs, and the local validator only checks the YAML structure.

**Fix:** Use `==`. A workflow that validates locally is not proof that it works, so run it on a real branch.

## `tsc --noEmit` failed in CI

**Symptom:** The type check passed locally and failed in CI because the `RouteContext` and `LayoutProps` types were missing.

**Cause:** Next.js generates those types into `.next/types`, which is git-ignored. A fresh checkout does not have them, while a local folder that has run `next dev` or `next build` does.

**Fix:** Run `npx next typegen` before `tsc --noEmit`. It is in both the `test` and the `hotfix` jobs.

## Invalid image tag

**Symptom:** The image build failed on the tag.

**Cause:** The `IMAGE` variable in the workflow had `//` where it needed a single `/`, which makes the reference invalid.

**Fix:** Correct the variable. A tag error shows up only when the build step runs, so check the resolved tag in the log.

## `npm ci` took about 15 minutes in the image build

**Symptom:** The first `stage` builds took 15 to 18 minutes, and `npm ci` alone took about 15 of them.

**Cause:** Most likely the `linux/arm64` half of the multi-arch build, which ran under QEMU emulation on an amd64 runner. Emulation is many times slower than native, and installing thousands of small files suffers most. Removing arm64 from the default build supports this: the same `stage` build then took about 3 minutes.

**Fix:** Build `linux/amd64` by default and `linux/arm64` only on demand (see [decisions.md](decisions.md)). The Dockerfile also installs dependencies before copying the source, so a code change no longer triggers a full reinstall.

## Merging `react` alone broke two Jest suites

**Symptom:** After merging a Dependabot pull request for `react`, two test suites failed.

**Cause:** React refuses to run with mismatched versions. `react` 19.3.1 was installed with `react-dom` 19.2.8 until the `react-dom` pull request was merged.

**Fix:** Merge `react-dom` as well. Packages that must move together should be updated together, ideally in one commit: `react` and `react-dom`, `tailwindcss` and `@tailwindcss/postcss`, `next` and `eslint-config-next`.

## `touch` does not test the Docker layer cache

**Symptom:** After splitting the Dockerfile so that dependencies install before the source is copied, touching a file seemed to prove nothing.

**Cause:** Docker's layer cache depends on file content, not modification time. A `touch` changes only the timestamp, so the cache is not invalidated and the result says nothing.

**Fix:** Change the content of a source file, then rebuild. With the split Dockerfile, the `npm ci` step shows `CACHED` and only `COPY . .` and `npm run build` run again (about 4.7 seconds, against a 31-second reinstall before the split).
