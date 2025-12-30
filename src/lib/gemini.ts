import { ComplianceRule, ComplianceSeverity } from "@/types";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent";

// Type for generated rules (runtime-only, not persisted)
export interface GeneratedRule {
  id: string;
  name: string;
  description: string;
  category: string;
  severity: ComplianceSeverity;
  validation_prompt: string;
  is_generated: true;
}

/**
 * Generates default compliance rules based on state regulations and product type.
 * These rules are generated at runtime using the LLM's knowledge of cannabis labeling laws.
 */
export async function generateDefaultRules(
  stateName: string | null,
  stateAbbreviation: string | null,
  productType: string
): Promise<GeneratedRule[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const stateContext = stateName
    ? `${stateName} (${stateAbbreviation})`
    : "general US cannabis regulations";

  const prompt = `You are an expert in cannabis labeling compliance regulations across US states.

Generate a comprehensive list of labeling compliance rules for a ${productType} cannabis product in ${stateContext}.

For each rule, provide:
- name: A short, descriptive name for the rule
- description: A detailed description of what the rule requires
- category: One of: "Required Warnings", "Symbols & Icons", "Ingredient Panels", "Net Weight Format", "Placement Rules", "THC Content", "Manufacturer Info", "Batch & Testing", "General"
- severity: "error" for mandatory requirements, "warning" for best practices, "info" for recommendations
- validation_prompt: A detailed prompt that describes exactly what to check on the label to verify compliance

Focus on the most important and commonly required labeling elements for ${productType} products, including but not limited to:
- THC/CBD content display requirements
- Required warning statements and their exact wording
- Universal cannabis symbol requirements
- Child-resistant packaging indicators
- Net weight/quantity format
- Manufacturer/producer information
- Batch/lot number requirements
- Testing information display
- Expiration/packaging dates
- License number display
- Allergen warnings (for edibles)
- Serving size information (for edibles)

Generate between 8-15 rules that are most relevant to ${productType} products in ${stateContext}.

Return a JSON array:
[
  {
    "name": "Rule Name",
    "description": "Detailed description",
    "category": "Category Name",
    "severity": "error" | "warning" | "info",
    "validation_prompt": "Check that the label contains..."
  }
]`;

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("No response from Gemini API");
  }

  try {
    const rawRules = JSON.parse(text) as Array<{
      name: string;
      description: string;
      category: string;
      severity: ComplianceSeverity;
      validation_prompt: string;
    }>;

    // Add generated UUIDs and mark as generated
    return rawRules.map((rule) => ({
      ...rule,
      id: crypto.randomUUID(),
      is_generated: true as const,
    }));
  } catch {
    throw new Error("Failed to parse generated rules as JSON");
  }
}

// Dynamic extracted data - structure based on rules
export type ExtractedLabelData = Record<string, unknown> & {
  rawText?: string;
  extractionConfidence?: {
    overall: number;
    fields: Record<string, number>;
  };
  flaggedForReview?: boolean;
  reviewReasons?: string[];
};

export interface ComplianceResult {
  ruleId: string;
  ruleName?: string;
  ruleDescription?: string;
  ruleCategory?: string;
  status: "pass" | "warning" | "fail";
  foundValue: string | null;
  expectedValue: string | null;
  explanation: string;
}

// Union type for rules (can be either persisted or generated)
export type AnyRule = ComplianceRule | GeneratedRule;

/**
 * Extracts label data dynamically based on the rules that will be evaluated.
 * The extraction prompt is built from the rules' validation_prompts to ensure
 * all necessary data is captured for compliance checking.
 */
export async function extractLabelData(
  imageBase64: string,
  panelType: string,
  productType: string,
  rules: AnyRule[]
): Promise<ExtractedLabelData> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  // Build extraction requirements from rules
  const extractionRequirements = rules
    .map((rule, i) => `${i + 1}. ${rule.name}: ${rule.validation_prompt}`)
    .join("\n");

  const prompt = `You are a cannabis label compliance expert. Analyze this ${panelType} panel image of a ${productType} product label.

Your task is to extract ALL data needed to evaluate the following compliance rules:

RULES TO SUPPORT:
${extractionRequirements}

Based on these rules, extract all relevant information from the label. For each piece of data you extract:
- Use a descriptive camelCase key name
- Include the exact text/value found on the label
- For boolean checks (like symbol presence), use true/false
- For lists (like ingredients or warnings), use arrays

ALWAYS include these base fields:
- rawText: all visible text concatenated from the label
- extractionConfidence: { overall: 0.0-1.0, fields: { fieldName: 0.0-1.0 } }
- flaggedForReview: true/false if any data is unclear
- reviewReasons: array of reasons if flagged

Return a JSON object with all extracted data relevant to the rules above. Structure the response to make compliance checking straightforward.

Example structure (adapt based on actual rules):
{
  "fieldName1": "extracted value or null",
  "fieldName2": ["array", "of", "values"],
  "fieldName3": true,
  "rawText": "all visible text...",
  "extractionConfidence": { "overall": 0.85, "fields": { "fieldName1": 0.9 } },
  "flaggedForReview": false,
  "reviewReasons": []
}`;

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: imageBase64.replace(/^data:image\/\w+;base64,/, ""),
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("No response from Gemini API");
  }

  try {
    return JSON.parse(text) as ExtractedLabelData;
  } catch {
    throw new Error("Failed to parse Gemini response as JSON");
  }
}

/**
 * Runs compliance check against extracted label data using the provided rules.
 * Works with both persisted ComplianceRule and generated GeneratedRule types.
 */
export async function runComplianceCheck(
  extractedPanels: Array<{
    panelId: string;
    panelType: string;
    extractedData: ExtractedLabelData;
  }>,
  rules: AnyRule[]
): Promise<{
  results: ComplianceResult[];
  summary: {
    overallStatus: "pass" | "warning" | "fail";
    passCount: number;
    warningCount: number;
    failCount: number;
  };
  isGenerated: boolean;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  // Check if rules are generated (runtime-only)
  const isGenerated = rules.length > 0 && "is_generated" in rules[0];

  // Combine all extracted data, merging arrays intelligently
  const combinedData = extractedPanels.reduce(
    (acc, panel) => {
      const data = panel.extractedData;
      const merged: ExtractedLabelData = { ...acc };
      
      for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value) && Array.isArray(acc[key])) {
          merged[key] = [...(acc[key] as unknown[]), ...value];
        } else if (key === "rawText") {
          merged[key] = `${acc.rawText || ""} ${value || ""}`.trim();
        } else {
          merged[key] = value;
        }
      }
      
      return merged;
    },
    {} as ExtractedLabelData
  );

  const prompt = `You are a cannabis label compliance validator. Given the extracted label data and compliance rules, evaluate each rule.

EXTRACTED LABEL DATA:
${JSON.stringify(combinedData, null, 2)}

COMPLIANCE RULES TO CHECK:
${rules.map((r, i) => `${i + 1}. [${r.id}] ${r.name}: ${r.validation_prompt}`).join("\n")}
  
For each rule, determine:
- status: "pass" if fully compliant, "warning" if partially compliant or unclear, "fail" if non-compliant
- foundValue: what was actually found on the label (or null if not found)
- expectedValue: what the rule requires
- explanation: brief explanation of the finding

Return a JSON array of results in the SAME ORDER as the rules above:
[
  {
    "ruleId": "uuid of the rule (copy exactly from the rule)",
    "status": "pass" | "warning" | "fail",
    "foundValue": "string or null",
    "expectedValue": "string or null",
    "explanation": "brief explanation"
  }
]`;

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("No response from Gemini API");
  }

  let rawResults: ComplianceResult[];
  try {
    rawResults = JSON.parse(text) as ComplianceResult[];
  } catch {
    throw new Error("Failed to parse Gemini compliance response as JSON");
  }

  // Enrich results with rule details (especially important for generated rules)
  const ruleMap = new Map(rules.map((r) => [r.id, r]));
  const results: ComplianceResult[] = rawResults.map((result) => {
    const rule = ruleMap.get(result.ruleId);
    if (rule) {
      return {
        ...result,
        ruleName: rule.name,
        ruleDescription: rule.description,
        ruleCategory: rule.category,
      };
    }
    return result;
  });

  // Calculate summary
  const passCount = results.filter((r) => r.status === "pass").length;
  const warningCount = results.filter((r) => r.status === "warning").length;
  const failCount = results.filter((r) => r.status === "fail").length;

  const overallStatus: "pass" | "warning" | "fail" =
    failCount > 0 ? "fail" : warningCount > 0 ? "warning" : "pass";

  return {
    results,
    summary: {
      overallStatus,
      passCount,
      warningCount,
      failCount,
    },
    isGenerated,
  };
}

