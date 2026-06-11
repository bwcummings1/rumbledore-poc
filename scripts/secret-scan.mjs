#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REDACTED = "[REDACTED]";
const IGNORE_MARKER = "secret-scan:ignore";

const tokenDetectors = [
  {
    name: "private key block",
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
    secretGroup: 0,
  },
  {
    name: "AWS access key",
    regex: /\b(?:A3T[A-Z0-9]|AKIA|ASIA)[A-Z0-9]{16}\b/g,
    secretGroup: 0,
  },
  {
    name: "GitHub token",
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}\b/g,
    secretGroup: 0,
  },
  {
    name: "GitHub fine-grained token",
    regex: /\bgithub_pat_[A-Za-z0-9_]{22}_[A-Za-z0-9_]{59,255}\b/g,
    secretGroup: 0,
  },
  {
    name: "OpenAI API key",
    regex: /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
    secretGroup: 0,
  },
  {
    name: "Anthropic API key",
    regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
    secretGroup: 0,
  },
  {
    name: "Slack token",
    regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g,
    secretGroup: 0,
  },
  {
    name: "Google API key",
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    secretGroup: 0,
  },
  {
    name: "ESPN S2 cookie assignment",
    regex: /\b(?:espn_s2|ESPN_S2)\b\s*[:=]\s*["']?([^"'\s,;]{24,})/gi,
    secretGroup: 1,
  },
];

const sensitiveAssignment =
  /\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API[_-]?KEY|PRIVATE[_-]?KEY|CLIENT[_-]?SECRET|ESPN_S2)[A-Z0-9_]*)\b\s*[:=]\s*["']?([^"'\s,;}#]+)["']?/g;

const placeholderWords = [
  "mock",
  "test",
  "fake",
  "fixture",
  "placeholder",
  "example",
  "dev",
  "local",
  "dummy",
  "changeme",
  "redacted",
  "rumbledore",
  "correct-horse",
  "rls-canary",
  "auth-test-secret",
  "gsecret",
  "prod-secret",
  "super-secret-but-malformed",
];

const generatedPathPatterns = [
  /^public\/icons\/.*\.png$/,
  /^src\/db\/migrations\/meta\//,
];

function isGeneratedPath(file) {
  return generatedPathPatterns.some((pattern) => pattern.test(file));
}

function isBinary(buffer) {
  return buffer.includes(0);
}

function entropy(value) {
  const counts = new Map();
  for (const char of value) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let result = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    result -= p * Math.log2(p);
  }
  return result;
}

function looksLikeSecretValue(value) {
  const normalized = value.trim();
  const lower = normalized.toLowerCase();
  if (
    normalized.length < 12 ||
    placeholderWords.some((word) => lower.includes(word)) ||
    /^[A-Z][A-Z0-9_]*$/.test(normalized) ||
    normalized.includes("(") ||
    normalized.includes(")") ||
    normalized.includes(".") ||
    normalized.includes("${")
  ) {
    return false;
  }
  return normalized.length >= 24 || entropy(normalized) >= 3.3;
}

function lineInfo(text, index) {
  const before = text.slice(0, index);
  const lineNumber = before.split("\n").length;
  const lineStart = before.lastIndexOf("\n") + 1;
  const lineEnd = text.indexOf("\n", index);
  const line =
    lineEnd === -1 ? text.slice(lineStart) : text.slice(lineStart, lineEnd);
  return { lineNumber, line };
}

function redactLine(line, matchedValue) {
  return matchedValue ? line.split(matchedValue).join(REDACTED) : line;
}

function recordFinding(findings, seen, file, text, index, name, secret) {
  const { lineNumber, line } = lineInfo(text, index);
  if (line.includes(IGNORE_MARKER)) {
    return;
  }
  const key = `${file}:${lineNumber}:${name}:${secret}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  findings.push({
    file,
    lineNumber,
    name,
    line: redactLine(line.trim(), secret),
  });
}

async function trackedFiles() {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout.split("\0").filter(Boolean);
}

async function scanFile(file, findings, seen) {
  if (isGeneratedPath(file)) {
    return;
  }
  const buffer = await readFile(file).catch((error) => {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  });
  if (!buffer || isBinary(buffer)) {
    return;
  }
  const text = buffer.toString("utf8");

  for (const detector of tokenDetectors) {
    detector.regex.lastIndex = 0;
    for (const match of text.matchAll(detector.regex)) {
      const secret = match[detector.secretGroup] ?? match[0];
      const index = match.index ?? 0;
      recordFinding(findings, seen, file, text, index, detector.name, secret);
    }
  }

  sensitiveAssignment.lastIndex = 0;
  for (const match of text.matchAll(sensitiveAssignment)) {
    const value = match[2] ?? "";
    if (!looksLikeSecretValue(value)) {
      continue;
    }
    const index = match.index ?? 0;
    recordFinding(
      findings,
      seen,
      file,
      text,
      index,
      `sensitive literal assigned to ${match[1]}`,
      value,
    );
  }
}

function stderr(message) {
  process.stderr.write(`${message}\n`);
}

function stdout(message) {
  process.stdout.write(`${message}\n`);
}

async function main() {
  const files = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  const targets = files.length > 0 ? files : await trackedFiles();
  const targetLabel = files.length > 0 ? "file(s)" : "tracked file(s)";
  const findings = [];
  const seen = new Set();

  for (const file of targets) {
    await scanFile(file, findings, seen);
  }

  if (findings.length > 0) {
    stderr(`Secret scan failed: ${findings.length} finding(s).`);
    for (const finding of findings) {
      stderr(`${finding.file}:${finding.lineNumber}: ${finding.name}`);
      stderr(`  ${finding.line}`);
    }
    stderr(
      `Verified false positives may add an inline ${IGNORE_MARKER} comment with a reason.`,
    );
    process.exitCode = 1;
    return;
  }

  stdout(`Secret scan passed (${targets.length} ${targetLabel} checked).`);
}

main().catch((error) => {
  stderr(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
