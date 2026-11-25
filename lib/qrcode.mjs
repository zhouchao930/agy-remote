// Pure JS zero-dependency QR Code SVG generator (Byte mode, ECC Level L, Versions 1..10)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree) {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, ecLen) {
  const gen = rsGeneratorPoly(ecLen);
  const rem = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecLen - 1] = 0;
    for (let j = 0; j < ecLen; j++) {
      rem[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return rem;
}

// Version table for ECC Level L: [totalDataBytes, ecBytesPerBlock, numBlocks1, dataPerBlock1, numBlocks2, dataPerBlock2, alignPositions]
const VERSION_TABLE = [
  null,
  { totalData: 19, ecLen: 7, b1: 1, d1: 19, b2: 0, d2: 0, align: [] },
  { totalData: 34, ecLen: 10, b1: 1, d1: 34, b2: 0, d2: 0, align: [6, 18] },
  { totalData: 55, ecLen: 15, b1: 1, d1: 55, b2: 0, d2: 0, align: [6, 22] },
  { totalData: 80, ecLen: 20, b1: 1, d1: 80, b2: 0, d2: 0, align: [6, 26] },
  { totalData: 108, ecLen: 26, b1: 1, d1: 108, b2: 0, d2: 0, align: [6, 30] },
  { totalData: 136, ecLen: 18, b1: 2, d1: 68, b2: 0, d2: 0, align: [6, 34] },
  { totalData: 156, ecLen: 20, b1: 2, d1: 78, b2: 0, d2: 0, align: [6, 22, 38] },
  { totalData: 194, ecLen: 24, b1: 2, d1: 97, b2: 0, d2: 0, align: [6, 24, 42] },
  { totalData: 232, ecLen: 30, b1: 2, d1: 116, b2: 0, d2: 0, align: [6, 26, 46] },
  { totalData: 274, ecLen: 18, b1: 2, d1: 68, b2: 2, d2: 69, align: [6, 28, 50] }
];

export function encodeQrMatrix(text) {
  const bytes = new TextEncoder().encode(String(text || ''));
  let version = 1;
  while (version <= 10) {
    const cap = VERSION_TABLE[version].totalData - (version < 10 ? 2 : 3);
    if (bytes.length <= cap) break;
    version++;
  }
  if (version > 10) throw new Error('QR payload too long');
  const vInfo = VERSION_TABLE[version];
  const bits = [];
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  pushBits(0b0100, 4); // Byte mode
  pushBits(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) pushBits(b, 8);
  const maxBits = vInfo.totalData * 8;
  pushBits(0, Math.min(4, maxBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const dataCodewords = new Uint8Array(vInfo.totalData);
  for (let i = 0; i < bits.length / 8; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
    dataCodewords[i] = b;
  }
  const pads = [0xec, 0x11];
  for (let i = bits.length / 8, p = 0; i < vInfo.totalData; i++, p ^= 1) {
    dataCodewords[i] = pads[p];
  }

  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;
  for (let i = 0; i < vInfo.b1; i++) {
    const blk = dataCodewords.subarray(offset, offset + vInfo.d1);
    offset += vInfo.d1;
    dataBlocks.push(blk);
    ecBlocks.push(rsEncode(blk, vInfo.ecLen));
  }
  for (let i = 0; i < vInfo.b2; i++) {
    const blk = dataCodewords.subarray(offset, offset + vInfo.d2);
    offset += vInfo.d2;
    dataBlocks.push(blk);
    ecBlocks.push(rsEncode(blk, vInfo.ecLen));
  }

  const finalCodewords = [];
  const maxDataLen = Math.max(vInfo.d1, vInfo.d2);
  for (let i = 0; i < maxDataLen; i++) {
    for (const blk of dataBlocks) if (i < blk.length) finalCodewords.push(blk[i]);
  }
  for (let i = 0; i < vInfo.ecLen; i++) {
    for (const blk of ecBlocks) finalCodewords.push(blk[i]);
  }

  const size = version * 4 + 17;
  const grid = Array.from({ length: size }, () => new Int8Array(size)); // 0=Light, 1=Dark
  const reserved = Array.from({ length: size }, () => new Uint8Array(size));

  const setModule = (r, c, dark, isReserved = true) => {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    grid[r][c] = dark ? 1 : 0;
    if (isReserved) reserved[r][c] = 1;
  };

  const drawFinder = (row, col) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const onBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const inInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setModule(row + r, col + c, inOuter && (onBorder || inInner), true);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    if (!reserved[6][i]) setModule(6, i, i % 2 === 0, true);
    if (!reserved[i][6]) setModule(i, 6, i % 2 === 0, true);
  }

  const align = vInfo.align;
  for (let i = 0; i < align.length; i++) {
    for (let j = 0; j < align.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
      const ar = align[i], ac = align[j];
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          setModule(ar + r, ac + c, Math.max(Math.abs(r), Math.abs(c)) !== 1, true);
        }
      }
    }
  }

  setModule(size - 8, 8, true, true);
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      if (!reserved[8][i]) reserved[8][i] = 1;
      if (!reserved[i][8]) reserved[i][8] = 1;
    }
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = 1;
    reserved[size - 1 - i][8] = 1;
  }

  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const vBits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((vBits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setModule(a, b, bit, true);
      setModule(b, a, bit, true);
    }
  }

  let bitIdx = 0;
  const totalBits = finalCodewords.length * 8;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (!reserved[r][c]) {
          let dark = false;
          if (bitIdx < totalBits) {
            dark = ((finalCodewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) === 1;
            bitIdx++;
          }
          if ((r + c) % 2 === 0) dark = !dark; // Mask 0
          grid[r][c] = dark ? 1 : 0;
        }
      }
    }
    upward = !upward;
  }

  // Format info for ECC Level L (01) and Mask 0 (000) -> data = 01000 -> BCH = 0x77c4
  const formatBits = 0x77c4;
  for (let i = 0; i <= 5; i++) setModule(8, i, ((formatBits >>> i) & 1) === 1, true);
  setModule(8, 7, ((formatBits >>> 6) & 1) === 1, true);
  setModule(8, 8, ((formatBits >>> 7) & 1) === 1, true);
  setModule(7, 8, ((formatBits >>> 8) & 1) === 1, true);
  for (let i = 9; i < 15; i++) setModule(14 - i, 8, ((formatBits >>> i) & 1) === 1, true);
  for (let i = 0; i < 8; i++) setModule(8, size - 1 - i, ((formatBits >>> i) & 1) === 1, true);
  for (let i = 8; i < 15; i++) setModule(size - 15 + i, 8, ((formatBits >>> i) & 1) === 1, true);

  return grid;
}

export function renderQrSvg(text, { margin = 3, darkColor = '#0f172a', lightColor = '#ffffff' } = {}) {
  const grid = encodeQrMatrix(text);
  const size = grid.length;
  const total = size + margin * 2;
  let path = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c]) path += `M${c + margin},${r + margin}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" rx="2" fill="${lightColor}"/><path d="${path}" fill="${darkColor}"/></svg>`;
}
