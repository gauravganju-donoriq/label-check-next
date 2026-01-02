export type ComplianceSeverity = "error" | "warning" | "info";
export type ComplianceStatus = "pass" | "warning" | "fail";
export type ProductType =
  | "flower"
  | "edibles"
  | "concentrates"
  | "topicals"
  | "tinctures"
  | "pre_rolls"
  | "other";
export type PanelType =
  | "front"
  | "back"
  | "left_side"
  | "right_side"
  | "exit_bag"
  | "other";

export interface RuleSet {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  state_name: string | null;
  state_abbreviation: string | null;
  product_type: ProductType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  rules_count?: number;
}

export type GenerationStatus = "new" | "updated" | "unchanged";

export interface ComplianceRule {
  id: string;
  rule_set_id: string;
  name: string;
  description: string;
  category: string;
  severity: ComplianceSeverity;
  validation_prompt: string;
  source_citation?: string;
  generation_status?: GenerationStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ComplianceCheck {
  id: string;
  user_id: string;
  rule_set_id: string;
  product_name: string | null;
  overall_status: ComplianceStatus | null;
  pass_count: number;
  warning_count: number;
  fail_count: number;
  created_at: string;
  completed_at: string | null;
  rule_set?: RuleSet;
}

export interface PanelUpload {
  id: string;
  compliance_check_id: string;
  panel_type: PanelType;
  blob_url: string;
  file_name: string;
  extracted_data: Record<string, unknown> | null;
  created_at: string;
}

export interface CheckResult {
  id: string;
  compliance_check_id: string;
  rule_id: string | null; // Nullable for generated rules
  status: ComplianceStatus;
  found_value: string | null;
  expected_value: string | null;
  explanation: string | null;
  created_at: string;
  // For persisted rules
  compliance_rule?: ComplianceRule;
  // For generated (runtime-only) rules
  is_generated_rule?: boolean;
  generated_rule_name?: string;
  generated_rule_description?: string;
  generated_rule_category?: string;
}

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  flower: "Flower",
  edibles: "Edibles",
  concentrates: "Concentrates",
  topicals: "Topicals",
  tinctures: "Tinctures",
  pre_rolls: "Pre-Rolls",
  other: "Other",
};

export const PANEL_TYPE_LABELS: Record<PanelType, string> = {
  front: "Front Panel",
  back: "Back Panel",
  left_side: "Left Side",
  right_side: "Right Side",
  exit_bag: "Exit Bag",
  other: "Other",
};

export const RULE_CATEGORIES = [
  "Required Warnings",
  "Symbols & Icons",
  "Ingredient Panels",
  "Net Weight Format",
  "Placement Rules",
  "THC Content",
  "Manufacturer Info",
  "Batch & Testing",
  "General",
] as const;

// Hardcoded list of US states where cannabis is legal
export const LEGAL_CANNABIS_STATES = [
  { id: "alaska", name: "Alaska", abbreviation: "AK" },
  { id: "arizona", name: "Arizona", abbreviation: "AZ" },
  { id: "california", name: "California", abbreviation: "CA" },
  { id: "colorado", name: "Colorado", abbreviation: "CO" },
  { id: "connecticut", name: "Connecticut", abbreviation: "CT" },
  { id: "delaware", name: "Delaware", abbreviation: "DE" },
  { id: "district-of-columbia", name: "District of Columbia", abbreviation: "DC" },
  { id: "illinois", name: "Illinois", abbreviation: "IL" },
  { id: "maine", name: "Maine", abbreviation: "ME" },
  { id: "maryland", name: "Maryland", abbreviation: "MD" },
  { id: "massachusetts", name: "Massachusetts", abbreviation: "MA" },
  { id: "michigan", name: "Michigan", abbreviation: "MI" },
  { id: "minnesota", name: "Minnesota", abbreviation: "MN" },
  { id: "missouri", name: "Missouri", abbreviation: "MO" },
  { id: "montana", name: "Montana", abbreviation: "MT" },
  { id: "nevada", name: "Nevada", abbreviation: "NV" },
  { id: "new-hampshire", name: "New Hampshire", abbreviation: "NH" },
  { id: "new-jersey", name: "New Jersey", abbreviation: "NJ" },
  { id: "new-mexico", name: "New Mexico", abbreviation: "NM" },
  { id: "new-york", name: "New York", abbreviation: "NY" },
  { id: "ohio", name: "Ohio", abbreviation: "OH" },
  { id: "oregon", name: "Oregon", abbreviation: "OR" },
  { id: "rhode-island", name: "Rhode Island", abbreviation: "RI" },
  { id: "vermont", name: "Vermont", abbreviation: "VT" },
  { id: "virginia", name: "Virginia", abbreviation: "VA" },
  { id: "washington", name: "Washington", abbreviation: "WA" },
] as const;

