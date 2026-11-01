/**
 * A Gemini stream that drops: a complete answer that arrived before the drop is used (not paid for twice); a cut-off one
 * is retried; a complete but schema-invalid one is retried; the timing is reported. Run: npm run check:stream
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "stream-"));
process.env.AI_RETRY_SCALE = "0";
for (const k of ["AI_PROJECT_BUTTON_LIMIT", "AI_USER_BUTTON_LIMIT", "AI_USER_DAILY_TOKENS", "AI_MONTHLY_BUDGET_USD"]) process.env[k] = "0";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };
const logs: string[] = [];
const quiet = async <T,>(f: () => Promise<T>): Promise<T> => {
  const l = console.log, w = console.warn, e = console.error;
  console.log = (...a) => logs.push(a.join(" ")); console.warn = (...a) => logs.push(a.join(" ")); console.error = () => {};
  try { return await f(); } finally { console.log = l; console.warn = w; console.error = e; }
};

(async () => {
  const { setGeminiClientForTests, callGeminiJSON, completeAnswer } = await import("../server/geminiClient");
  const { runWithUsageContext, usageReport } = await import("../server/usage");
  const schema = z.object({ title: z.string(), items: z.array(z.string()) });
  const full = JSON.stringify({ title: "Plan", items: ["a", "b", "c"] });

  // ── the completeness test itself ──
  t("a complete JSON answer is recognised", completeAnswer(full) === full && completeAnswer("```json\n" + full + "\n```") === full);
  t("a cut-off answer is never taken as complete", [full.slice(0, -1), full.slice(0, 25), '{"title":"Plan","items":["a"', '{"title":"Plan"}  {"x"'].every((x) => completeAnswer(x) === null));
  t("an inner object that happens to close is not the whole answer", completeAnswer('{"title":"Plan","items":[{"a":1}') === null);
  t("empty or prose is not an answer", completeAnswer("") === null && completeAnswer(undefined) === null && completeAnswer("Sorry, I cannot") === null);

  // A stand-in client whose stream sends the given pieces and then drops ("terminated"), or ends normally.
  const calls: string[] = [];
  const plan: Array<{ pieces: string[]; drop: boolean }> = [];
  const stub = {
    models: {
      generateContent: async () => { throw new Error("streaming expected"); },
      generateContentStream: async () => {
        const step = plan.shift() ?? { pieces: [full], drop: false };
        calls.push(step.drop ? "drop" : "ok");
        return (async function* () {
          for (const p of step.pieces) yield { candidates: [{ content: { parts: [{ text: p }] } }] };
          if (step.drop) { const e = new Error("terminated"); throw e; }
          yield { candidates: [{ content: { parts: [] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 } };
        })();
      },
    },
  };
  const restore = setGeminiClientForTests(stub);
  const run = async (steps: Array<{ pieces: string[]; drop: boolean }>) => { plan.length = 0; plan.push(...steps); calls.length = 0; logs.length = 0; return quiet(() => runWithUsageContext("u1", "p1", () => callGeminiJSON("generate-definition", "PROMPT TEXT", schema))); };

  // 1. complete answer, then the connection drops before the final message: used, no second request.
  const r1 = await run([{ pieces: [full.slice(0, 20), full.slice(20)], drop: true }]);
  t("complete answer + dropped connection: the answer is used", r1?.title === "Plan" && r1.items.length === 3);
  t("... and the model is not asked again (not paid twice)", calls.join(",") === "drop", calls.join(","));
  t("... and the log says the complete answer was used, with the stream timing", logs.some((l) => /connection dropped after the answer was complete \(stream: 2 chunk\(s\)/.test(l)));
  t("... and the tokens are still counted (estimated)", usageReport("u1", "p1").me.tokensUsed > 0);

  // 2. cut-off answer: retried, the second (complete) answer is used.
  const r2 = await run([{ pieces: [full.slice(0, 30)], drop: true }, { pieces: [full], drop: false }]);
  t("cut-off answer + dropped connection: retried and the full answer used", r2?.title === "Plan" && calls.join(",") === "drop,ok", calls.join(","));
  t("... and the retry log names the cause and the timing", logs.some((l) => /network on attempt 1 \( ?terminated; stream: 1 chunk\(s\), 30 chars; first data after \d+s/.test(l)), logs.join(" | "));

  // 3. complete JSON that does not fit the schema, then a drop: not used as is; retried.
  const bad = JSON.stringify({ heading: "x" });
  const r3 = await run([{ pieces: [bad], drop: true }, { pieces: [full], drop: false }]);
  t("complete but wrong-shaped answer + drop: retried, not used", r3?.title === "Plan" && calls.join(",") === "drop,ok", calls.join(","));

  // 3b. complete answer that only needs a type conversion: used (the same small fixes as a normal answer).
  const conv = JSON.stringify({ title: 42, items: ["a"] });
  const r3b = await run([{ pieces: [conv], drop: true }]);
  t("complete answer needing only a type conversion + drop: used", r3b?.title === "42" && calls.join(",") === "drop", calls.join(","));

  // 4. every attempt drops with nothing complete: the model fails as a network problem (the router then tries the next model).
  const r4 = await run([{ pieces: ["{"], drop: true }, { pieces: ["{"], drop: true }, { pieces: ["{"], drop: true }, { pieces: ["{"], drop: true }, { pieces: ["{"], drop: true }, { pieces: ["{"], drop: true }]);
  t("nothing complete on any attempt: no answer invented", r4 === null && calls.every((c) => c === "drop"));
  restore();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
