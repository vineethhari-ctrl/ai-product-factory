import 'dotenv/config';
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { 
  analyzeBusinessMaterial, 
  generateProductDefinition, 
  analyzeChangeImpact, 
  applyChangeToDefinition,
  generateEngineeringPackageData,
  generatePrototypeUI
} from "./server/aiReasoningService";
import { validateRecordHandler } from "./server/recordRoute";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "AI Product Factory Backend", timestamp: new Date().toISOString() });
  });

  // SCREEN 2: Analyze Business Material
  app.post("/api/analyze-material", async (req, res) => {
    try {
      const { materials, productName, businessUnit, description } = req.body;
      if (!materials || !Array.isArray(materials) || materials.length === 0) {
        return res.status(400).json({ error: "No business materials provided for analysis." });
      }

      const understanding = await analyzeBusinessMaterial(
        materials,
        productName || "Untitled Product",
        businessUnit || "General",
        description || ""
      );

      return res.json(understanding);
    } catch (err: any) {
      console.error("Error analyzing business material:", err);
      return res.status(500).json({ error: err?.message || "Failed to analyze business material" });
    }
  });

  // SCREEN 3: Generate Product Definition
  app.post("/api/generate-definition", async (req, res) => {
    try {
      const businessUnderstanding = req.body.businessUnderstanding || req.body.understanding;
      const { productName, businessUnit, version } = req.body;
      if (!businessUnderstanding) {
        return res.status(400).json({ error: "Missing business understanding structure." });
      }

      const definition = await generateProductDefinition(
        businessUnderstanding,
        productName || "Untitled Product",
        businessUnit || "General",
        version || "v1.0"
      );

      return res.json(definition);
    } catch (err: any) {
      console.error("Error generating product definition:", err);
      return res.status(500).json({ error: err?.message || "Failed to generate product definition" });
    }
  });

  // SCREEN 6: Analyze Change Impact
  app.post("/api/analyze-change", async (req, res) => {
    try {
      const currentDefinition = req.body.currentDefinition || req.body.definition;
      const changeRequestText = req.body.changeRequestText || req.body.changeRequest;
      if (!currentDefinition || !changeRequestText) {
        return res.status(400).json({ error: "Missing current definition or change request text." });
      }

      const impact = await analyzeChangeImpact(currentDefinition, changeRequestText);
      return res.json(impact);
    } catch (err: any) {
      console.error("Error analyzing change impact:", err);
      return res.status(500).json({ error: err?.message || "Failed to analyze change impact" });
    }
  });

  // SCREEN 6: Apply Change
  app.post("/api/apply-change", (req, res) => {
    try {
      const currentDefinition = req.body.currentDefinition || req.body.definition;
      const changeAnalysis = req.body.changeAnalysis || req.body.analysis;
      if (!currentDefinition || !changeAnalysis) {
        return res.status(400).json({ error: "Missing definition or change analysis." });
      }

      const updated = applyChangeToDefinition(currentDefinition, changeAnalysis);
      return res.json(updated);
    } catch (err: any) {
      console.error("Error applying change:", err);
      return res.status(500).json({ error: err?.message || "Failed to apply change" });
    }
  });

  // SCREEN 7: Prepare & Export Engineering Package
  const handleExportPackage = (req: express.Request, res: express.Response) => {
    try {
      const productDefinition = req.body.productDefinition || req.body.definition;
      const changeHistory = req.body.changeHistory || productDefinition?.changeHistory || [];
      if (!productDefinition) {
        return res.status(400).json({ error: "Missing product definition." });
      }

      const pkg = generateEngineeringPackageData(productDefinition, changeHistory);
      return res.json(pkg);
    } catch (err: any) {
      console.error("Error exporting engineering package:", err);
      return res.status(500).json({ error: err?.message || "Failed to generate engineering package" });
    }
  };

  // SCREEN 5: Generate AI-Powered Prototype (Advanced Thinking)
  app.post("/api/generate-prototype", async (req, res) => {
    try {
      const productDefinition = req.body.productDefinition || req.body.definition;
      if (!productDefinition) {
        return res.status(400).json({ error: "Missing product definition." });
      }

      const enriched = await generatePrototypeUI(productDefinition);
      return res.json(enriched);
    } catch (err: any) {
      console.error("Error generating prototype UI:", err);
      return res.status(500).json({ error: err?.message || "Failed to generate prototype UI" });
    }
  });

  // Generic, domain-neutral record validation (shared engine with the browser forms)
  app.post("/api/validate-record", validateRecordHandler);

  app.post("/api/export-package", handleExportPackage);
  app.post("/api/export-engineering", handleExportPackage);

  // JSON error bodies for body-parser failures (otherwise Express answers with an HTML page)
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON body." });
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "Request body is too large." });
    return next(err);
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AI Product Factory server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
