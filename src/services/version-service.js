const fs = require('fs');
const path = require('path');

const PACKAGE_PATH = path.join(__dirname, '..', '..', 'package.json');
const DEFAULT_GITHUB_REPO = 'hzx2185/z7pdf';
const UPDATE_TIMEOUT_MS = 8000;
const NO_RELEASE_ERROR_CODE = 'NO_GITHUB_RELEASE';

function readPackageJson() {
  try {
    return JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
  } catch (_error) {
    return {};
  }
}

function getPackageUpdatedAt() {
  try {
    return fs.statSync(PACKAGE_PATH).mtime.toISOString();
  } catch (_error) {
    return '';
  }
}

function normalizeVersion(value) {
  return String(value || '')
    .trim()
    .replace(/^v/i, '');
}

function withVersionPrefix(value) {
  const version = normalizeVersion(value);
  return version ? `v${version}` : '';
}

function parseVersion(value) {
  const [mainVersion, prerelease = ''] = normalizeVersion(value).split('-', 2);
  const parts = mainVersion.split('.').map((part) => {
    const number = Number.parseInt(part, 10);
    return Number.isFinite(number) ? number : 0;
  });

  while (parts.length < 3) {
    parts.push(0);
  }

  return {
    parts: parts.slice(0, 3),
    prerelease
  };
}

function compareVersions(first, second) {
  const left = parseVersion(first);
  const right = parseVersion(second);

  for (let index = 0; index < 3; index += 1) {
    if (left.parts[index] > right.parts[index]) return 1;
    if (left.parts[index] < right.parts[index]) return -1;
  }

  if (left.prerelease === right.prerelease) return 0;
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;
  return left.prerelease.localeCompare(right.prerelease);
}

function getGitHubRepo() {
  return String(process.env.Z7PDF_GITHUB_REPO || DEFAULT_GITHUB_REPO)
    .trim()
    .replace(/^https:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '') || DEFAULT_GITHUB_REPO;
}

function getCurrentVersionInfo() {
  const packageJson = readPackageJson();
  const envVersion = normalizeVersion(process.env.Z7PDF_VERSION);
  const packageVersion = normalizeVersion(packageJson.version);
  const version = envVersion || packageVersion || '0.0.0';
  const buildTime = String(process.env.Z7PDF_BUILD_TIME || '').trim() || getPackageUpdatedAt();
  const revision = String(process.env.Z7PDF_REVISION || '').trim();
  const repository = getGitHubRepo();

  return {
    version,
    tag: withVersionPrefix(version),
    buildTime,
    revision,
    repository,
    source: envVersion ? 'env' : 'package'
  };
}

async function fetchGitHubJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPDATE_TIMEOUT_MS);
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': `z7pdf/${getCurrentVersionInfo().version}`
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = data?.message ? `GitHub 返回：${data.message}` : `GitHub 返回 HTTP ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('检查更新超时，请稍后重试。');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function formatRelease(release, source) {
  const version = normalizeVersion(release?.tag_name || release?.name);
  return {
    version,
    tag: release?.tag_name || withVersionPrefix(version),
    name: release?.name || release?.tag_name || '',
    url: release?.html_url || '',
    publishedAt: release?.published_at || '',
    updatedAt: release?.updated_at || '',
    source
  };
}

async function fetchLatestVersion(repository) {
  const baseUrl = `https://api.github.com/repos/${repository}`;

  try {
    const release = await fetchGitHubJson(`${baseUrl}/releases/latest`);
    return formatRelease(release, 'github-release');
  } catch (error) {
    if (error.status !== 404) {
      throw error;
    }
  }

  const tags = await fetchGitHubJson(`${baseUrl}/tags?per_page=1`);
  const latestTag = Array.isArray(tags) ? tags[0] : null;
  if (!latestTag?.name) {
    const error = new Error('GitHub 仓库暂无 Release 或 Tag。');
    error.code = NO_RELEASE_ERROR_CODE;
    throw error;
  }

  return {
    version: normalizeVersion(latestTag.name),
    tag: latestTag.name,
    name: latestTag.name,
    url: `https://github.com/${repository}/releases/tag/${encodeURIComponent(latestTag.name)}`,
    publishedAt: '',
    updatedAt: '',
    source: 'github-tag'
  };
}

async function checkLatestVersion() {
  const current = getCurrentVersionInfo();
  const checkedAt = new Date().toISOString();
  let latest = null;

  try {
    latest = await fetchLatestVersion(current.repository);
  } catch (error) {
    if (error.code === NO_RELEASE_ERROR_CODE) {
      return {
        current,
        latest: null,
        updateAvailable: false,
        checkedAt,
        message: 'GitHub 仓库暂无 Release 或 Tag；按 AGENTS.md 发布版本后即可检查最新版本。'
      };
    }
    throw error;
  }

  const updateAvailable = latest.version
    ? compareVersions(latest.version, current.version) > 0
    : false;

  return {
    current,
    latest,
    updateAvailable,
    checkedAt
  };
}

module.exports = {
  checkLatestVersion,
  compareVersions,
  getCurrentVersionInfo,
  normalizeVersion
};
