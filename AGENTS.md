# AGENTS.md

## Version Rules

- `package.json` is the single source of truth for the application version. Keep it as plain SemVer, for example `1.3.0`, without a leading `v`.
- Update `package-lock.json` whenever `package.json` version changes.
- The public changelog in `public/index.html` must include the same release version before publishing a versioned Docker image.
- The admin update checker reads Docker Hub SemVer patch tags from `hzx2185/z7pdf` by default. Override the image with `Z7PDF_DOCKER_IMAGE=owner/repo` only for forks or private deployments.

## GitHub Release Rules

- Release tags must be named `vX.Y.Z`, matching `package.json` version `X.Y.Z`.
- GitHub Releases are optional for this project and are not used by the admin update checker.
- Stable releases use normal SemVer tags such as `v1.3.0`. Pre-releases may use SemVer pre-release tags such as `v1.4.0-beta.1` and must be marked as pre-release on GitHub.
- Push order: commit the version and changelog update, push the branch, push tag `vX.Y.Z`, then create the GitHub Release from that tag.

## Docker Version Rules

- Public image name: `hzx2185/z7pdf`.
- After code changes, rebuild and restart the existing Docker Compose service with `docker compose up -d --build`; do not leave a separate long-running Node/dev server process for verification.
- Publish immutable patch tags for every release, for example `hzx2185/z7pdf:1.3.0`.
- Publish a full SemVer patch tag such as `1.3.0` for every public version. The admin update checker ignores `latest` and rolling minor tags because they are not precise versions.
- Move `latest` only after the matching versioned image is ready and the image has passed smoke checks.
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

- Do not publish Docker version tags that do not have a matching `package.json` version and GitHub tag.
