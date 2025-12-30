import { ComplianceRule } from "@/types";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent";

interface ExtractedLabelData {
  productName?: string;
  brandName?: string;
  thcContent?: string;
  cbdContent?: string;
  totalCannabinoids?: string;
  netWeight?: string;
  ingredients?: string[];
  warnings?: string[];
  manufacturerInfo?: string;
  batchNumber?: string;
  testingInfo?: string;
  harvestDate?: string;
  packagingDate?: string;
  expirationDate?: string;
  licenseeInfo?: string;
  universalSymbol?: boolean;
  childResistant?: boolean;
  rawText?: string;
  extractionConfidence?: {
    overall: number;
    fields: Record<string, number>;
  };
  flaggedForReview?: boolean;
  reviewReasons?: string[];
}

interface ComplianceResult {
  ruleId: string;
  status: "pass" | "warning" | "fail";
  foundValue: string | null;
  expectedValue: string | null;
  explanation: string;
}

export async function extractLabelData(
  imageBase64: string,
  panelType: string,
  productType: string
): Promise<ExtractedLabelData> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const prompt = `You are a cannabis label compliance expert. Analyze this ${panelType} panel image of a ${productType} product label.

Extract ALL visible text and data from the label, including:
- Product name and brand
- THC/CBD content and percentages
- Net weight/quantity
- Ingredients list
- Warning statements
- Manufacturer/producer information
- Batch/lot numbers
- Testing information
- Harvest/packaging/expiration dates
- License numbers
- Universal cannabis symbol presence
- Child-resistant packaging indicators

Return a JSON object with the extracted data. Include a confidence score (0-1) for each extracted field.
If any text is unclear or partially visible, flag it for manual review.

Response format:
{
  "productName": "string or null",
  "brandName": "string or null",
  "thcContent": "string or null",
  "cbdContent": "string or null",
  "totalCannabinoids": "string or null",
  "netWeight": "string or null",
  "ingredients": ["array of strings"],
  "warnings": ["array of warning strings"],
  "manufacturerInfo": "string or null",
  "batchNumber": "string or null",
  "testingInfo": "string or null",
  "harvestDate": "string or null",
  "packagingDate": "string or null",
  "expirationDate": "string or null",
  "licenseeInfo": "string or null",
  "universalSymbol": true/false,
  "childResistant": true/false,
  "rawText": "all visible text concatenated",
  "extractionConfidence": {
    "overall": 0.0-1.0,
    "fields": { "fieldName": 0.0-1.0 }
  },
  "flaggedForReview": true/false,
  "reviewReasons": ["reasons if flagged"]
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

export async function runComplianceCheck(
  extractedPanels: Array<{
    panelId: string;
    panelType: string;
    extractedData: ExtractedLabelData;
  }>,
  rules: ComplianceRule[]
): Promise<{
  results: ComplianceResult[];
  summary: {
    overallStatus: "pass" | "warning" | "fail";
    passCount: number;
    warningCount: number;
    failCount: number;
  };
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  // Combine all extracted data
  const combinedData = extractedPanels.reduce(
    (acc, panel) => {
      const data = panel.extractedData;
      return {
        ...acc,
        ...data,
        warnings: [...(acc.warnings || []), ...(data.warnings || [])],
        ingredients: [...(acc.ingredients || []), ...(data.ingredients || [])],
        rawText: `${acc.rawText || ""} ${data.rawText || ""}`.trim(),
      };
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

Return a JSON array of results:
[
  {
    "ruleId": "uuid of the rule",
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

  let results: ComplianceResult[];
  try {
    results = JSON.parse(text) as ComplianceResult[];
  } catch {
    throw new Error("Failed to parse Gemini compliance response as JSON");
  }

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
  };
}

