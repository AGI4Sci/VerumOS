import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  RunAnalysisRequestSchema,
  ExpertCorrectionRequestSchema,
} from "./schemas.js";
import { loadStore } from "./asset-store.js";
import { handleBootstrap } from "./routes/bootstrap.js";
import { handleRunAnalysis } from "./routes/run-analysis.js";
import { handleExpertCorrection } from "./routes/expert-correction.js";

const __dir = dirname(fileURLToPath(import.meta.url));

// Load asset store on startup
loadStore();

// Find demo HTML file
const htmlPaths = [
  resolve(__dir, "../web/biomedical_agent_demo.html"),
  resolve(__dir, "../demo/biomedical_agent_demo.html"),
  resolve(__dir, "../../web/biomedical_agent_demo.html"),
];

let HTML = "";
for (const path of htmlPaths) {
  if (existsSync(path)) {
    HTML = readFileSync(path, "utf-8");
    console.log(`[Server] Loaded demo HTML from: ${path}`);
    break;
  }
}

if (!HTML) {
  console.warn("[Server] Warning: Demo HTML not found. / endpoint will return 404.");
}

const app = new Hono();

// Enable CORS for development
app.use("*", cors());

// Health check
app.get("/health", (c) => c.json({ ok: true }));

// Serve demo HTML
app.get("/", (c) => {
  if (!HTML) {
    return c.text("Demo HTML not found. Please ensure web/biomedical_agent_demo.html exists.", 404);
  }
  return c.html(HTML);
});

// API routes
app.get("/api/bootstrap", handleBootstrap);
app.post(
  "/api/run-analysis",
  zValidator("json", RunAnalysisRequestSchema),
  handleRunAnalysis
);
app.post(
  "/api/expert-correction",
  zValidator("json", ExpertCorrectionRequestSchema),
  handleExpertCorrection
);

// Error handler
app.onError((err, c) => {
  console.error("[Server] Error:", err);
  return c.json(
    {
      error: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    },
    500
  );
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

// Start server
const port = Number(process.env.PORT ?? 3000);

serve(
  { fetch: app.fetch, port },
  (info) => {
    console.log(`\n╔════════════════════════════════════════════════════════════╗`);
    console.log(`║  VerumOS (明鉴) · Bio Research Agent                       ║`);
    console.log(`╠════════════════════════════════════════════════════════════╣`);
    console.log(`║  Server running at: http://localhost:${info.port}                 ║`);
    console.log(`║  Demo:              http://localhost:${info.port}/                 ║`);
    console.log(`║  Health:            http://localhost:${info.port}/health           ║`);
    console.log(`║  API:               http://localhost:${info.port}/api/bootstrap    ║`);
    console.log(`╚════════════════════════════════════════════════════════════╝\n`);
  }
);