const { rgb } = require('pdf-lib');

function pdfColorFromHex(input) {
  const value = String(input || '').trim();
  if (!/^#?[0-9a-fA-F]{6}$/.test(value)) {
    return null;
  }

  const hex = value.startsWith('#') ? value.slice(1) : value;
  const toUnit = (segment) => Number.parseInt(segment, 16) / 255;
  return rgb(toUnit(hex.slice(0, 2)), toUnit(hex.slice(2, 4)), toUnit(hex.slice(4, 6)));
}

module.exports = {
  pdfColorFromHex
};
