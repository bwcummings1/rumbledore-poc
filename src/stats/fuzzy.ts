export function normalizeIdentityName(value: string): string {
  return value
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const distances = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );

  for (let row = 0; row < rows; row += 1) {
    distances[row][0] = row;
  }
  for (let col = 0; col < cols; col += 1) {
    distances[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      distances[row][col] = Math.min(
        distances[row - 1][col] + 1,
        distances[row][col - 1] + 1,
        distances[row - 1][col - 1] + cost,
      );
    }
  }

  return distances[left.length][right.length];
}

function levenshteinSimilarity(left: string, right: string): number {
  const maxLength = Math.max(left.length, right.length);
  if (maxLength === 0) {
    return 1;
  }
  return 1 - levenshteinDistance(left, right) / maxLength;
}

function jaroSimilarity(left: string, right: string): number {
  if (left === right) {
    return 1;
  }
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const matchDistance = Math.max(
    0,
    Math.floor(Math.max(left.length, right.length) / 2) - 1,
  );
  const leftMatches = Array.from({ length: left.length }, () => false);
  const rightMatches = Array.from({ length: right.length }, () => false);
  let matches = 0;

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const start = Math.max(0, leftIndex - matchDistance);
    const end = Math.min(right.length, leftIndex + matchDistance + 1);
    for (let rightIndex = start; rightIndex < end; rightIndex += 1) {
      if (rightMatches[rightIndex] || left[leftIndex] !== right[rightIndex]) {
        continue;
      }
      leftMatches[leftIndex] = true;
      rightMatches[rightIndex] = true;
      matches += 1;
      break;
    }
  }

  if (matches === 0) {
    return 0;
  }

  let transpositions = 0;
  let rightIndex = 0;
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    if (!leftMatches[leftIndex]) {
      continue;
    }
    while (!rightMatches[rightIndex]) {
      rightIndex += 1;
    }
    if (left[leftIndex] !== right[rightIndex]) {
      transpositions += 1;
    }
    rightIndex += 1;
  }

  return (
    (matches / left.length +
      matches / right.length +
      (matches - transpositions / 2) / matches) /
    3
  );
}

function jaroWinklerSimilarity(left: string, right: string): number {
  const jaro = jaroSimilarity(left, right);
  let prefixLength = 0;
  for (
    let index = 0;
    index < Math.min(4, left.length, right.length);
    index += 1
  ) {
    if (left[index] !== right[index]) {
      break;
    }
    prefixLength += 1;
  }
  return jaro + prefixLength * 0.1 * (1 - jaro);
}

function phoneticCode(input: string): string {
  const normalized = normalizeIdentityName(input).replace(/[^a-z]/g, "");
  if (normalized.length === 0) {
    return "";
  }

  const first = normalized[0].toUpperCase();
  const groups: Record<string, string> = {
    b: "1",
    f: "1",
    p: "1",
    v: "1",
    c: "2",
    g: "2",
    j: "2",
    k: "2",
    q: "2",
    s: "2",
    x: "2",
    z: "2",
    d: "3",
    t: "3",
    l: "4",
    m: "5",
    n: "5",
    r: "6",
  };
  let code = first;
  let previous = groups[normalized[0]] ?? "";

  for (const char of normalized.slice(1)) {
    const current = groups[char] ?? "";
    if (current && current !== previous) {
      code += current;
    }
    previous = current;
  }

  return code.padEnd(4, "0").slice(0, 4);
}

function phoneticSimilarity(left: string, right: string): number {
  const leftCode = phoneticCode(left);
  const rightCode = phoneticCode(right);
  if (!leftCode || !rightCode) {
    return 0;
  }
  if (leftCode === rightCode) {
    return 1;
  }
  return levenshteinSimilarity(leftCode, rightCode) * 0.8;
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(
    normalizeIdentityName(left).split(" ").filter(Boolean),
  );
  const rightTokens = new Set(
    normalizeIdentityName(right).split(" ").filter(Boolean),
  );
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }
  const intersection = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  );
  const union = new Set([...leftTokens, ...rightTokens]);
  return intersection.length / union.size;
}

export function identityNameSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeIdentityName(left);
  const normalizedRight = normalizeIdentityName(right);
  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }
  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  return Math.max(
    0,
    Math.min(
      1,
      levenshteinSimilarity(normalizedLeft, normalizedRight) * 0.3 +
        jaroWinklerSimilarity(normalizedLeft, normalizedRight) * 0.3 +
        phoneticSimilarity(left, right) * 0.2 +
        tokenSimilarity(left, right) * 0.2,
    ),
  );
}
