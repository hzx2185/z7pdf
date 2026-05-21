function parseTrustProxySetting(value) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return false;
  }

  const normalized = raw.toLowerCase();
  if (['0', 'false', 'off', 'no', 'disabled'].includes(normalized)) {
    return false;
  }
  if (['true', 'on', 'yes', 'enabled'].includes(normalized)) {
    return true;
  }

  const numericValue = Number(raw);
  if (Number.isInteger(numericValue) && numericValue >= 0) {
    return numericValue;
  }

  if (raw.includes(',')) {
    return raw
      .split(',')
      .map((segment) => segment.trim())
      .filter(Boolean);
  }

  return raw;
}

function formatTrustProxySetting(value) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return String(value);
}

module.exports = {
  parseTrustProxySetting,
  formatTrustProxySetting
};
