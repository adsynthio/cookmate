// AI evaluation runner (KIT-133). Sends every case through the exact request the function sends (its prompt.ts),
// grades the answers, and with --check fails when a task scores under its floor or regresses (baseline.json).
//
//   ANTHROPIC_API_KEY=... deno run --allow-read --allow-write --allow-env --allow-net _evals/run.ts [--check] [--task rescue_fix]
//
// Each full run makes about 30 small Claude Haiku calls (well under a cent). Results go to _evals/results.json and
// a Markdown summary to stdout (CI appends it to the run summary).
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";

import * as parsePrompt from "../parse-inventory/prompt.ts";
import { contextFor, localeFor } from "../rescue/logic.ts";
import * as rescuePrompt from "../rescue/prompt.ts";
import { type Baseline, f1, type ItemTotals, itemScore, regressions, rescueProblems } from "./graders.ts";
import { hints, parseCases, recipes, rescueCases } from "./load.ts";

type CaseResult = { case: string; ok: boolean; detail: string };
type TaskResult = { task: string; promptVersion: string; model: string; score: number; cases: CaseResult[] };

const CONCURRENCY = 4;

async function pool<T, R>(items: T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }));
  return out;
}

async function evalParse(client: Anthropic): Promise<TaskResult> {
  const h = hints();
  const totals: ItemTotals = { tp: 0, got: 0, expected: 0 };
  const cases = await pool(parseCases(), async (c) => {
    try {
      const { response } = await parsePrompt.callModel(client, c.text, c.language, h);
      const items = response.parsed_output?.items ?? [];
      const t = itemScore(c.expect, items);
      totals.tp += t.tp;
      totals.got += t.got;
      totals.expected += t.expected;
      const ok = t.tp === t.expected && t.got === t.expected;
      return { case: c.text, ok, detail: ok ? "" : `got ${JSON.stringify(items.map((i) => [i.ingredient_key ?? i.said, i.quantity, i.unit]))}` };
    } catch (err) {
      totals.expected += c.expect.length;
      return { case: c.text, ok: false, detail: `call failed: ${err instanceof Error ? err.message : err}` };
    }
  });
  return { task: parsePrompt.TASK, promptVersion: parsePrompt.PROMPT_VERSION, model: parsePrompt.MODEL, score: f1(totals), cases };
}

async function evalRescue(client: Anthropic): Promise<TaskResult> {
  const cases = await pool(rescueCases(), async (c) => {
    const name = `${c.recipe} step ${c.step}: ${c.problem}${c.missing ? ` (${c.missing})` : ""} [${c.language}]`;
    try {
      const doc = recipes.get(c.recipe)!;
      const ctx = contextFor(doc, c.pantry, c.missing, c.details);
      const { fix, refused } = await rescuePrompt.askModel(client, doc, c.step, c.problem, ctx, localeFor(c.language));
      if (!fix) return { case: name, ok: false, detail: refused ? "refused" : "no answer" };
      const problems = rescueProblems(fix, ctx, c.expect);
      return { case: name, ok: problems.length === 0, detail: problems.length ? `${problems.join("; ")} | ${fix.steps.join(" / ")}` : "" };
    } catch (err) {
      return { case: name, ok: false, detail: `call failed: ${err instanceof Error ? err.message : err}` };
    }
  });
  const passed = cases.filter((c) => c.ok).length;
  return { task: rescuePrompt.TASK, promptVersion: rescuePrompt.PROMPT_VERSION, model: rescuePrompt.MODEL, score: passed / cases.length, cases };
}

const TASKS: Record<string, (c: Anthropic) => Promise<TaskResult>> = {
  [parsePrompt.TASK]: evalParse,
  [rescuePrompt.TASK]: evalRescue,
};

function markdown(results: TaskResult[], failed: string[]): string {
  const lines = ["# AI evaluations", "", "| Task | Prompt | Model | Score | Cases passed |", "|---|---|---|---|---|"];
  for (const r of results) {
    lines.push(`| ${r.task} | ${r.promptVersion} | ${r.model} | ${r.score.toFixed(3)} | ${r.cases.filter((c) => c.ok).length}/${r.cases.length} |`);
  }
  lines.push("", failed.length ? `**Regressions:**\n${failed.map((f) => `- ${f}`).join("\n")}` : "No regressions.", "");
  for (const r of results) {
    const bad = r.cases.filter((c) => !c.ok);
    if (!bad.length) continue;
    lines.push(`## ${r.task}: cases that missed`, "", ...bad.map((c) => `- ${c.case}: ${c.detail}`), "");
  }
  return lines.join("\n");
}

if (import.meta.main) {
  const args = Deno.args;
  const only = args.includes("--task") ? args[args.indexOf("--task") + 1] : null;
  if (!Deno.env.get("ANTHROPIC_API_KEY")) {
    console.error("ANTHROPIC_API_KEY is not set: nothing to evaluate against.");
    Deno.exit(2);
  }
  const client = new Anthropic();
  const results: TaskResult[] = [];
  for (const [task, fn] of Object.entries(TASKS)) if (!only || only === task) results.push(await fn(client));
  const baseline = JSON.parse(Deno.readTextFileSync(new URL("baseline.json", import.meta.url))) as Baseline;
  const failed = regressions(Object.fromEntries(results.map((r) => [r.task, r.score])), baseline);
  Deno.writeTextFileSync(new URL("results.json", import.meta.url), JSON.stringify(results, null, 2) + "\n");
  console.log(markdown(results, failed));
  if (args.includes("--check") && failed.length) Deno.exit(1);
}
