/**
 * @fileoverview Dynamic Client-Side Fallback Synthesizer
 *
 * When the LLM backend is unreachable (no API key, network error, dev mode),
 * this module synthesizes a BusinessUnderstanding object derived ENTIRELY
 * from the user actual uploaded materials, NOT from any hardcoded dataset.
 *
 * The synthesizer:
 *  1. Reads every material contentSnippet and filename.
 *  2. Extracts candidate nouns that look like persona roles, entity names, modules.
 *  3. Builds evidence citations pointing to the REAL uploaded filenames.
 *  4. Never returns Fleet EV / Bodyshop / any other hardcoded domain data.
 */

import { BusinessUnderstanding, EvidenceItem, UploadedMaterial } from '../types';

// Text extraction helpers

function extractAllText(materials: UploadedMaterial[]): Array<{ source: string; text: string }> {
  return materials.map((m) => ({
    source: m.filename,
    text: [m.contentSnippet ?? '', ...(m.tags ?? [])].join(' '),
  }));
}

function extractCandidateTerms(text: string): string[] {
  const candidates: string[] = [];
  const quoted = text.match(/"([^"]{3,80})"/g) ?? [];
  candidates.push(...quoted.map((q) => q.replace(/"/g, '').trim()));
  const caps = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})\b/g) ?? [];
  candidates.push(...caps);
  return [...new Set(candidates)].filter((t) => t.length > 3 && t.length < 80);
}

function isPersonaLike(term: string): boolean {
  const kws = ['manager','specialist','advisor','officer','lead','analyst','director',
    'coordinator','admin','operator','supervisor','technician','agent','representative',
    'engineer','consultant','assessor','surveyor','inspector','auditor','executive'];
  const lower = term.toLowerCase();
  return kws.some((k) => lower.includes(k));
}

function isModuleLike(term: string): boolean {
  const kws = ['dashboard','portal','console','hub','center','management','tracker',
    'monitor','system','platform','workflow','registry','report','schedule','booking',
    'inventory','profile','review','approval','queue','notification','audit','log','search'];
  const lower = term.toLowerCase();
  return kws.some((k) => lower.includes(k));
}

function isEntityLike(term: string): boolean {
  const kws = ['record','account','order','request','claim','job','task','vehicle',
    'customer','client','user','invoice','ticket','appointment','booking','item',
    'product','case','asset','report','document','file','entry','form'];
  const lower = term.toLowerCase();
  return kws.some((k) => lower.includes(k));
}

// Main synthesizer

export function buildDynamicFallbackUnderstanding(
  materials: UploadedMaterial[],
  productName: string,
  businessUnit: string,
  description: string = ''
): BusinessUnderstanding {
  const now = new Date().toISOString();
  const sourceTexts = extractAllText(materials);
  const allSources = materials.map((m) => m.filename);
  const fullText = sourceTexts.map((s) => s.text).join(' ');
  const candidates = extractCandidateTerms(fullText);

  // Personas
  const personaCandidates = candidates.filter(isPersonaLike).slice(0, 5);
  const transcriptSources = materials
    .filter((m) =>
      m.fileType === 'audio' || m.fileType === 'text' ||
      m.filename.toLowerCase().includes('transcript') ||
      m.filename.toLowerCase().includes('notes') ||
      m.filename.toLowerCase().includes('slack')
    )
    .map((m) => m.filename);

  const personas: EvidenceItem[] = personaCandidates.length > 0
    ? personaCandidates.map((role, i) => {
        const evidenceSrc = sourceTexts.find((s) => s.text.includes(role))?.source ?? allSources[0];
        return {
          id: `per-${i + 1}`,
          title: role,
          description: 'Identified from uploaded materials as a key stakeholder role. Confirm responsibilities and access level with the business team.',
          status: 'INFERRED' as const,
          evidenceReferences: [evidenceSrc],
          supportingDetail: `Term "${role}" appears in: ${evidenceSrc}`,
        };
      })
    : [{
        id: 'per-1',
        title: 'Primary System User',
        description: 'Exact role title not yet determinable from supplied materials. Provide role names in your source documents for richer persona extraction.',
        status: 'MISSING' as const,
        evidenceReferences: allSources.length > 0 ? [allSources[0]] : ['No materials provided'],
        supportingDetail: 'No clear persona role titles were identified in the uploaded content snippets.',
      }];

  // Modules
  const moduleCandidates = candidates.filter(isModuleLike).slice(0, 4);
  const modules: EvidenceItem[] = moduleCandidates.length > 0
    ? moduleCandidates.map((name, i) => {
        const evidenceSrc = sourceTexts.find((s) => s.text.includes(name))?.source ?? allSources[0];
        return { id: `mod-${i + 1}`, title: name,
          description: 'Identified as a potential product module or feature domain from uploaded materials.',
          status: 'INFERRED' as const, evidenceReferences: [evidenceSrc] };
      })
    : [{ id: 'mod-1', title: `${productName || 'Product'} Core Module`,
        description: `Main functional module for ${productName || 'the product'}. Detailed breakdown requires additional context from business stakeholders.`,
        status: 'INFERRED' as const, evidenceReferences: allSources.slice(0, 2) }];

  // Screens from images/pptx
  const imageSources = materials.filter((m) => m.fileType === 'image' || m.fileType === 'pptx');
  const screens: EvidenceItem[] = imageSources.length > 0
    ? imageSources.map((m, i) => ({
        id: `scr-${i + 1}`,
        title: m.filename.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '),
        description: m.contentSnippet
          ? `Screen extracted from ${m.filename}: ${m.contentSnippet.substring(0, 200)}...`
          : `UI screen captured in ${m.filename}. Extract widget and field details for component specification.`,
        status: 'CONFIRMED' as const, evidenceReferences: [m.filename],
      }))
    : [{ id: 'scr-1', title: 'Primary Application Screen',
        description: 'No UI screenshots or presentation slides uploaded. Upload screen captures to enable automatic UI component extraction.',
        status: 'MISSING' as const, evidenceReferences: allSources.length > 0 ? allSources : ['No materials provided'] }];

  // User Journeys
  const journeySource = transcriptSources[0] ?? allSources[0] ?? 'Uploaded materials';
  const userJourneys: EvidenceItem[] = [{
    id: 'uj-1',
    title: `Primary ${productName || 'Product'} Workflow`,
    description: 'Core user workflow inferred from uploaded materials. Full step-by-step journey requires stakeholder confirmation.',
    status: 'INFERRED' as const,
    evidenceReferences: transcriptSources.length > 0 ? transcriptSources : allSources.slice(0, 2),
    supportingDetail: `Derived from analysis of: ${journeySource}`,
  }];

  // Business Rules - extract must/shall sentences from content
  const ruleSentences: string[] = [];
  for (const { source, text } of sourceTexts) {
    const sentences = text.split(/[.!?]+/).filter(Boolean);
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if ((lower.includes('must') || lower.includes('shall') || lower.includes('required') ||
           lower.includes('mandatory') || lower.includes('prohibited') ||
           lower.includes('not allowed') || lower.includes('cannot')) &&
          sentence.trim().length > 20 && sentence.trim().length < 300) {
        ruleSentences.push(`${sentence.trim()} [Source: ${source}]`);
        if (ruleSentences.length >= 3) break;
      }
    }
    if (ruleSentences.length >= 3) break;
  }
  const businessRules: EvidenceItem[] = ruleSentences.length > 0
    ? ruleSentences.map((ruleText, i) => {
        const srcMatch = ruleText.match(/\[Source: (.+?)\]$/);
        const src = srcMatch?.[1] ?? allSources[0];
        return {
          id: `br-${i + 1}`,
          title: `BR-${String(i + 1).padStart(3, '0')}: Operational Constraint`,
          description: ruleText.replace(/\s*\[Source:.+\]$/, '').trim(),
          status: 'CONFIRMED' as const, evidenceReferences: [src],
        };
      })
    : [{ id: 'br-1', title: 'Business Rules: Pending Extraction',
        description: 'No explicit business rules (must/shall/required constraints) found in uploaded content snippets. Include policy documents, compliance notes, or stakeholder emails.',
        status: 'MISSING' as const, evidenceReferences: allSources }];

  // Data Entities
  const excelSources = materials.filter((m) => m.fileType === 'excel' || m.filename.toLowerCase().endsWith('.csv'));
  const entityCandidates = candidates.filter(isEntityLike).slice(0, 4);
  const dataEntities: EvidenceItem[] = (entityCandidates.length > 0 || excelSources.length > 0)
    ? [
        ...excelSources.map((m, i) => ({
          id: `de-e${i + 1}`,
          title: m.filename.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '),
          description: m.contentSnippet
            ? `Data entities extracted from ${m.filename}: ${m.contentSnippet.substring(0, 200)}...`
            : `Structured data source - extract entity and field definitions from ${m.filename}.`,
          status: 'CONFIRMED' as const, evidenceReferences: [m.filename],
        })),
        ...entityCandidates.map((entity, i) => {
          const evidenceSrc = sourceTexts.find((s) => s.text.includes(entity))?.source ?? allSources[0];
          return { id: `de-${i + 1}`, title: entity,
            description: 'Candidate data entity identified in uploaded materials. Verify field definitions with the data architecture team.',
            status: 'INFERRED' as const, evidenceReferences: [evidenceSrc] };
        }),
      ].slice(0, 4)
    : [{ id: 'de-1', title: 'Core Business Entity',
        description: 'No structured data dictionary or entity definitions found. Upload spreadsheets, ERDs, or data dictionaries to enable automatic entity extraction.',
        status: 'MISSING' as const, evidenceReferences: allSources }];

  // Integrations
  const integrationKeywords = ['api','integration','system','service','platform','gateway',
    'webhook','rest','graphql','sync','feed','import','export'];
  const integrationMatches: EvidenceItem[] = [];
  outer: for (const { source, text } of sourceTexts) {
    const lower = text.toLowerCase();
    for (const kw of integrationKeywords) {
      const idx = lower.indexOf(kw);
      if (idx !== -1) {
        const snippet = text.substring(Math.max(0, idx - 20), Math.min(text.length, idx + 80)).trim();
        integrationMatches.push({
          id: `int-${integrationMatches.length + 1}`,
          title: `Integration Reference (${source})`,
          description: `Integration or external system reference found in ${source}: "...${snippet}..."`,
          status: 'INFERRED' as const, evidenceReferences: [source],
        });
        if (integrationMatches.length >= 2) break outer;
      }
    }
  }
  const integrations: EvidenceItem[] = integrationMatches.length > 0
    ? integrationMatches
    : [{ id: 'int-1', title: 'External Integrations: Not Yet Identified',
        description: 'No explicit integration or API references found in uploaded content. Add technical specifications or system landscape documents to identify integrations.',
        status: 'MISSING' as const, evidenceReferences: allSources }];

  // UI Observations
  const uiObservations: EvidenceItem[] = imageSources.map((m, i) => ({
    id: `uio-${i + 1}`,
    title: `UI Observation from ${m.filename}`,
    description: m.contentSnippet
      ? `Layout and interaction patterns observed in ${m.filename}: ${m.contentSnippet.substring(0, 300)}...`
      : 'Upload higher-fidelity screenshots or annotated wireframes for detailed UI component extraction.',
    status: (m.contentSnippet ? 'CONFIRMED' : 'INFERRED') as 'CONFIRMED' | 'INFERRED',
    evidenceReferences: [m.filename],
  }));

  // Conflicts
  const conflictKeywords = ['conflict','contradict','dispute','disagree','inconsistent',
    'vs.','versus','however','different from','mismatch'];
  const conflicts: EvidenceItem[] = [];
  outerConflict: for (const { source, text } of sourceTexts) {
    const lower = text.toLowerCase();
    for (const kw of conflictKeywords) {
      if (lower.includes(kw)) {
        const idx = lower.indexOf(kw);
        const snippet = text.substring(Math.max(0, idx - 30), Math.min(text.length, idx + 120)).trim();
        conflicts.push({
          id: `cf-${conflicts.length + 1}`,
          title: `Potential Policy Conflict in ${source}`,
          description: `Conflicting statement detected: "...${snippet}..." - requires business stakeholder resolution.`,
          status: 'AMBIGUOUS' as const, evidenceReferences: [source],
        });
        if (conflicts.length >= 2) break outerConflict;
      }
    }
  }

  // Missing Information
  const missingInformation: EvidenceItem[] = [];
  if (personas.some((p) => p.status === 'MISSING')) {
    missingInformation.push({ id: 'mi-1', title: 'Persona Role Definitions',
      description: 'Explicit user role names and responsibilities are not present in the uploaded materials.',
      status: 'MISSING' as const, evidenceReferences: allSources });
  }
  if (businessRules.some((r) => r.status === 'MISSING')) {
    missingInformation.push({ id: 'mi-2', title: 'Business Rules and Policy Constraints',
      description: 'No formal business rules, SLAs, or operational constraints were found. Include policy documents or compliance specifications.',
      status: 'MISSING' as const, evidenceReferences: allSources });
  }

  // Overall Summary
  const fileList = allSources.join(', ');
  const overallSummary = description
    ? `${description} - Synthesized from ${materials.length} uploaded material(s): ${fileList}. WARNING: LLM backend was offline; this analysis is derived from content snippet keyword extraction. Configure GEMINI_API_KEY for full AI-powered synthesis.`
    : `Preliminary analysis of ${materials.length} uploaded material(s) for "${productName || 'Unnamed Product'}" (${businessUnit || 'Unspecified Business Unit'}). Sources: ${fileList}. WARNING: LLM backend was offline - this analysis is based on keyword extraction from content snippets. Configure GEMINI_API_KEY for full AI-powered synthesis.`;

  return {
    overallSummary,
    extractedAt: now,
    businessObjective: {
      id: 'bo-1',
      title: productName || 'Product Objective',
      description: description ||
        `Build ${productName || 'the product'} for ${businessUnit || 'the business unit'}. Detailed objective requires stakeholder interviews or a formal brief.`,
      status: 'INFERRED',
      evidenceReferences: allSources.slice(0, 3),
      supportingDetail: `Derived from product name "${productName}" and business unit "${businessUnit}" as provided in intake form.`,
    },
    personas,
    modules,
    screens,
    userJourneys,
    businessRules,
    dataEntities,
    integrations,
    uiObservations,
    conflicts,
    missingInformation,
  };
}
