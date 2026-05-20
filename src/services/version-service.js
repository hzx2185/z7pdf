const fs = require('fs');
const path = require('path');

const PACKAGE_PATH = path.join(__dirname, '..', '..', 'package.json');
const DEFAULT_DOCKER_IMAGE = 'hzx2185/z7pdf';
const UPDATE_TIMEOUT_MS = 8000;
const DOCKER_HUB_API = 'https://hub.docker.com/v2/repositories';
const MAX_DOCKER_TAG_PAGES = 5;

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

function isFullSemver(value) {
  return /^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/i.test(normalizeVersion(value));
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

function getDockerImage() {
  let image = String(process.env.Z7PDF_DOCKER_IMAGE || DEFAULT_DOCKER_IMAGE)
    .trim()
    .replace(/^docker\.io\//i, '')
    .replace(/^registry-1\.docker\.io\//i, '')
    .replace(/^\/+|\/+$/g, '') || DEFAULT_DOCKER_IMAGE;

  image = image.split('@')[0];
  const lastSlash = image.lastIndexOf('/');
  const lastColon = image.lastIndexOf(':');
  if (lastColon > lastSlash) {
    image = image.slice(0, lastColon);
  }

  return image.includes('/') ? image : `library/${image}`;
}

function getCurrentVersionInfo() {
  const packageJson = readPackageJson();
  const envVersion = normalizeVersion(process.env.Z7PDF_VERSION);
  const packageVersion = normalizeVersion(packageJson.version);
  const version = envVersion || packageVersion || '0.0.0';
  const buildTime = String(process.env.Z7PDF_BUILD_TIME || '').trim() || getPackageUpdatedAt();
  const revision = String(process.env.Z7PDF_REVISION || '').trim();
  const dockerImage = getDockerImage();

  return {
    version,
    tag: withVersionPrefix(version),
    buildTime,
    revision,
    repository: dockerImage,
    dockerImage,
    source: envVersion ? 'env' : 'package'
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPDATE_TIMEOUT_MS);
  const headers = {
    Accept: 'application/json',
    'User-Agent': `z7pdf/${getCurrentVersionInfo().version}`
  };

  if (process.env.DOCKER_HUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.DOCKER_HUB_TOKEN}`;
  }

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = data?.message ? `Docker Hub 返回：${data.message}` : `Docker Hub 返回 HTTP ${response.status}`;
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

function getDockerTagUrl(image, tag = '') {
  const [namespace, repository] = image.split('/');
  const query = tag ? `?name=${encodeURIComponent(tag)}` : '';
  return `https://hub.docker.com/r/${encodeURIComponent(namespace)}/${encodeURIComponent(repository)}/tags${query}`;
}

function formatDockerTag(tag, dockerImage) {
  const version = normalizeVersion(tag?.name);
  const updatedAt = tag?.tag_last_pushed || tag?.last_updated || '';

  return {
    version,
    tag: tag?.name || version,
    name: tag?.name || version,
    url: getDockerTagUrl(dockerImage, tag?.name || version),
    publishedAt: updatedAt,
    updatedAt,
    source: 'docker-hub'
  };
}

async function fetchDockerTags(dockerImage) {
  const [namespace, repository] = dockerImage.split('/');
  let url = `${DOCKER_HUB_API}/${encodeURIComponent(namespace)}/${encodeURIComponent(repository)}/tags?page_size=100`;
  const tags = [];

  for (let page = 0; page < MAX_DOCKER_TAG_PAGES && url; page += 1) {
    const data = await fetchJson(url);
    if (Array.isArray(data.results)) {
      tags.push(...data.results);
    }
    url = data.next || '';
  }

  return tags;
}

async function fetchLatestVersion(dockerImage) {
  const tags = await fetchDockerTags(dockerImage);
  const versionTags = tags
    .filter((tag) => tag?.tag_status === 'active' || !tag?.tag_status)
    .filter((tag) => isFullSemver(tag?.name))
    .map((tag) => formatDockerTag(tag, dockerImage))
    .sort((first, second) => {
      const versionCompare = compareVersions(second.version, first.version);
      if (versionCompare !== 0) return versionCompare;
      return new Date(second.updatedAt || 0).getTime() - new Date(first.updatedAt || 0).getTime();
    });

  if (!versionTags.length) {
    return null;
  }

  return versionTags[0];
}

async function checkLatestVersion() {
  const current = getCurrentVersionInfo();
  const checkedAt = new Date().toISOString();
  const latest = await fetchLatestVersion(current.dockerImage);

  if (!latest) {
    return {
      current,
      latest: null,
      updateAvailable: false,
      checkedAt,
      message: `Docker Hub 镜像 ${current.dockerImage} 暂无版本号标签；发布 ${current.dockerImage}:${current.version} 后即可检查更新。`
    };
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
