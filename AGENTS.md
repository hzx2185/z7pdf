# AGENTS.md

## Version Rules

- `package.json` is the single source of truth for the application version. Keep it as plain SemVer, for example `1.3.0`, without a leading `v`.
- Update `package-lock.json` whenever `package.json` version changes.
- The public changelog in `public/index.html` must include the same release version before tagging a release.
- The admin update checker reads the latest GitHub Release from `hzx2185/z7pdf` by default. Override the repository with `Z7PDF_GITHUB_REPO=owner/repo` only for forks or private deployments.

## GitHub Release Rules

- Release tags must be named `vX.Y.Z`, matching `package.json` version `X.Y.Z`.
- Create a GitHub Release for every public version. Tags without releases are only a fallback for the update checker and should not be the normal release path.
- Stable releases use normal SemVer tags such as `v1.3.0`. Pre-releases may use SemVer pre-release tags such as `v1.4.0-beta.1` and must be marked as pre-release on GitHub.
- Push order: commit the version and changelog update, push the branch, push tag `vX.Y.Z`, then create the GitHub Release from that tag.

## Docker Version Rules

- Public image name: `hzx2185/z7pdf`.
- Publish immutable patch tags for every release, for example `hzx2185/z7pdf:1.3.0`.
- Move `latest` only after the matching GitHub Release is ready and the image has passed smoke checks.
- Optional rolling minor tags such as `1.3` may be moved to the newest patch in that minor line.
- Build public images with version metadata:

```bash
docker build \
  --build-arg Z7PDF_VERSION=1.3.0 \
  --build-arg Z7PDF_BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --build-arg Z7PDF_REVISION="$(git rev-parse HEAD)" \
  -t hzx2185/z7pdf:1.3.0 \
  -t hzx2185/z7pdf:1.3 \
  -t hzx2185/z7pdf:latest \
  .
```

- Push the immutable tag first, then the rolling tags:

```bash
docker push hzx2185/z7pdf:1.3.0
docker push hzx2185/z7pdf:1.3
docker push hzx2185/z7pdf:latest
```

- Do not publish Docker tags that do not have a matching `package.json` version and GitHub tag.
