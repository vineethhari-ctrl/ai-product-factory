// Finds out which way of connecting to Gemini works with the settings on this PC.
//
//   npm run check:gemini
//
// Sends one tiny request ("Reply with OK") per connection method and model, and prints what Google answered. No key
// is ever printed. Costs a fraction of a cent. Reads .env and the PC's Google variables like the app does.
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { classifyGeminiError } from "../server/geminiClient";

const env = (n: string) => (process.env[n] || "").trim().replace(/^["']|["']$/g, "");
const secrets = ["GOOGLE_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY"].map(env).filter((v) => v.length > 8);
const redact = (s: string) => secrets.reduce((t, k) => t.split(k).join("***"), s);

const project = env("GOOGLE_CLOUD_PROJECT");
const location = env("GOOGLE_CLOUD_LOCATION") || "global";
const googleKey = env("GOOGLE_API_KEY");
const geminiKey = env("GEMINI_API_KEY");
const MODELS = ["gemini-4-argon", "gemini-3.6-flash"];

interface Method { name: string; options: Record<string, unknown> | null; missing?: string }
const methods: Method[] = [
  { name: "A. Vertex AI, API key only (what the app does now)", options: googleKey ? { vertexai: true, apiKey: googleKey } : null, missing: "GOOGLE_API_KEY is not set" },
  { name: "B. Vertex AI, API key + project + location", options: googleKey && project ? { vertexai: true, apiKey: googleKey, project, location } : null, missing: "needs GOOGLE_API_KEY and GOOGLE_CLOUD_PROJECT" },
  { name: "C. Vertex AI, project + location with this PC's Google sign-in (no key)", options: project ? { vertexai: true, project, location } : null, missing: "GOOGLE_CLOUD_PROJECT is not set" },
  { name: "D. Regular Gemini API with GEMINI_API_KEY from .env", options: geminiKey ? { vertexai: false, apiKey: geminiKey } : null, missing: "GEMINI_API_KEY is not set" },
];

console.log(`Project: ${project || "(none)"}   Location: ${location}\n`);
const results: string[] = [];
for (const m of methods) {
  console.log(m.name);
  if (!m.options) { console.log(`   skipped: ${m.missing}\n`); results.push(`${m.name}: skipped`); continue; }
  let client: GoogleGenAI;
  try {
    client = new GoogleGenAI(m.options as any);
  } catch (e) {
    console.log(`   cannot start: ${redact(String((e as Error).message)).slice(0, 160)}\n`);
    continue;
  }
  const worked: string[] = [];
  for (const model of MODELS) {
    try {
      const r = await client.models.generateContent({ model, contents: "Reply with OK", config: { maxOutputTokens: 64 } });
      console.log(`   ${model}: WORKS (answered "${(r.text || "").trim().slice(0, 20)}")`);
      worked.push(model);
    } catch (e: any) {
      const raw = redact(typeof e?.message === "string" ? e.message : String(e)).replace(/\s+/g, " ");
      console.log(`   ${model}: failed (${classifyGeminiError(e)}) ${raw.slice(0, 220)}`);
    }
  }
  results.push(`${m.name}: ${worked.length ? `works with ${worked.join(", ")}` : "no model worked"}`);
  console.log("");
}

console.log("Summary");
for (const r of results) console.log(`- ${r}`);
console.log("\nCopy everything above into the chat (it contains no keys).");
