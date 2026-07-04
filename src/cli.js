#!/usr/bin/env node
/**
 * ChaiBot CLI.
 *
 * Commands:
 *   chaibot check  <file|->            score a job posting for scam red flags
 *   chaibot propose <file|-> [opts]    draft a proposal (offline, or --provider)
 *   chaibot rules                      list the detector's red-flag rules
 *   chaibot serve [--port N]           start the optional local API
 *   chaibot --help | --version
 *
 * Postings are read from a file path or from stdin (use "-"). User mistakes
 * produce a one-line "error: ..." and exit 2 -- never a stack trace. A
 * high-risk verdict from `check` exits 1 so it can gate scripts.
 */

import { readFileSync } from "node:fs";

import { analyzePosting } from "./detector/index.js";
import { ALL_RULES } from "./detector/rules.js";
import { generateProposal } from "./proposal/index.js";
import { createProvider } from "./providers/remote.js";
import { ProviderError } from "./providers/base.js";

async function main(argv) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "check":
      return cmdCheck(rest);
    case "propose":
      return await cmdPropose(rest);
    case "rules":
      return cmdRules();
    case "serve":
      return await cmdServe(rest);
    case "--version":
    case "-v":
      return printVersion();
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      return 0;
    default:
      process.stderr.write(`error: unknown command '${cmd}'\n\n`);
      printHelp();
      return 2;
  }
}

function readInput(arg) {
  if (!arg || arg === "-") {
    return readFileSync(0, "utf8"); // stdin
  }
  try {
    return readFileSync(arg, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") throw new UserError(`file not found: ${arg}`);
    if (err.code === "EISDIR") throw new UserError(`expected a file but got a directory: ${arg}`);
    throw new UserError(err.message);
  }
}

function cmdCheck(args) {
  const { positionals, flags } = parseArgs(args);
  const text = readInput(positionals[0]);
  const { verdict } = analyzePosting(text);

  if (flags.json) {
    process.stdout.write(JSON.stringify(verdict, null, 2) + "\n");
  } else {
    process.stdout.write(renderVerdict(verdict) + "\n");
  }
  // Exit code lets this gate scripts: 1 = high risk, 0 otherwise.
  return verdict.band === "high" ? 1 : 0;
}

async function cmdPropose(args) {
  const { positionals, flags } = parseArgs(args);
  const text = readInput(positionals[0]);
  const { verdict, posting } = analyzePosting(text);

  const profile = loadProfile(flags.profile);
  let provider;
  if (flags.provider) {
    provider = createProvider(flags.provider);
  }

  const result = await generateProposal(
    { posting, verdict, profile, provider },
    { allowRisky: Boolean(flags["allow-risky"]) },
  );

  if (result.blocked) {
    process.stderr.write(`blocked: ${result.reason}\n`);
    process.stderr.write(renderVerdict(verdict) + "\n");
    return 1;
  }

  process.stdout.write(result.proposal + "\n");
  if (result.fellBack) {
    process.stderr.write(`\n(note: ${result.reason})\n`);
  } else {
    process.stderr.write(`\n(source: ${result.source})\n`);
  }
  return 0;
}

function cmdRules() {
  process.stdout.write("ChaiBot red-flag rules:\n\n");
  const byCat = {};
  for (const r of ALL_RULES) {
    (byCat[r.category] ??= []).push(r);
  }
  for (const [cat, rules] of Object.entries(byCat)) {
    process.stdout.write(`${cat}:\n`);
    for (const r of rules) {
      process.stdout.write(`  ${r.id} (weight ${r.weight}) — ${r.reason}\n`);
    }
    process.stdout.write("\n");
  }
  return 0;
}

async function cmdServe(args) {
  const { flags } = parseArgs(args);
  const port = Number(flags.port ?? 8100);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new UserError(`invalid --port: ${flags.port}`);
  }
  const { startServer, PROVIDER_KINDS } = await import("./api/server.js");
  // Providers are opt-in: without --providers, POST /propose ignores the
  // body's `provider` field so callers can't spend this environment's API
  // keys or read local cassette files.
  let allowedProviders = [];
  if (flags.providers) {
    if (flags.providers === true) {
      throw new UserError(`--providers needs a value (e.g. --providers replay,openai)`);
    }
    allowedProviders = String(flags.providers)
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    for (const kind of allowedProviders) {
      if (!PROVIDER_KINDS.includes(kind)) {
        throw new UserError(`unknown provider kind '${kind}' (use ${PROVIDER_KINDS.join(", ")})`);
      }
    }
  }
  startServer({ port, allowedProviders });
  return 0; // server keeps the process alive
}

// --------------------------------------------------------------------------- //
function loadProfile(path) {
  if (!path) return {};
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") throw new UserError(`profile file not found: ${path}`);
    throw new UserError(err.message);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new UserError(`profile is not valid JSON: ${err.message}`);
  }
}

function renderVerdict(v) {
  const bar = badge(v.band);
  const lines = [`${bar}  risk score: ${v.score}/100  (${v.band})`, v.summary];
  if (v.signals.length > 0) {
    lines.push("");
    lines.push("Flags:");
    for (const s of v.signals) {
      const ev = s.evidence ? `  ["${truncate(s.evidence, 60)}"]` : "";
      lines.push(`  - [${s.category}] ${s.reason} (+${s.weight})${ev}`);
    }
  }
  return lines.join("\n");
}

function badge(band) {
  return band === "high" ? "[HIGH RISK]" : band === "caution" ? "[CAUTION]" : "[LOW RISK]";
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// Minimal flag parser: --key value, --flag, and positionals.
function parseArgs(args) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

class UserError extends Error {}

function printVersion() {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    process.stdout.write(`${pkg.version}\n`);
  } catch {
    process.stdout.write("unknown\n");
  }
  return 0;
}

function printHelp() {
  process.stdout.write(
    `ChaiBot — freelance job-post scam detector + proposal assistant (Node core)

Usage:
  chaibot check   <file|->            Score a posting for scam red flags
  chaibot propose <file|-> [options]  Draft a proposal for a posting
  chaibot rules                       List the red-flag rules
  chaibot serve   [options]           Start the optional local API
  chaibot --version

Options for 'check':
  --json                 Output the verdict as JSON

Options for 'propose':
  --profile <file.json>  Freelancer profile (name, skills[], yearsExperience, ...)
  --provider <spec>      LLM polish: replay:cassette.json | openai:MODEL | anthropic:MODEL
  --allow-risky          Build a proposal even if the posting is high-risk

Options for 'serve':
  --port N               Port to listen on (default 8100)
  --providers <kinds>    Comma-separated provider kinds POST /propose may use
                         (replay, openai, anthropic). Default: none.

Postings are read from a file or stdin ("-"). 'check' exits 1 on high risk.
This is the verified Node core; a Laravel UI can wrap it later.
`,
  );
  return 0;
}

class ExitError extends Error {
  constructor(code) {
    super(`exit ${code}`);
    this.code = code;
  }
}

main(process.argv.slice(2))
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    if (err instanceof UserError || err instanceof ProviderError) {
      process.stderr.write(`error: ${err.message}\n`);
      process.exit(2);
    }
    if (err instanceof ExitError) process.exit(err.code);
    process.stderr.write(`error: ${err.stack || err.message}\n`);
    process.exit(1);
  });

export { main };
