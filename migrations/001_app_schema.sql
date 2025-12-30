-- Label Check Application Schema
-- Run this AFTER running `npx @better-auth/cli migrate` for auth tables

-- Rule Sets (groups of rules for a specific state/product)
CREATE TABLE IF NOT EXISTS rule_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  state_name TEXT,
  state_abbreviation TEXT,
  product_type TEXT NOT NULL CHECK (product_type IN ('flower', 'edibles', 'concentrates', 'topicals', 'tinctures', 'pre_rolls', 'other')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual Compliance Rules
CREATE TABLE IF NOT EXISTS compliance_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id UUID NOT NULL REFERENCES rule_sets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT DEFAULT 'error' CHECK (severity IN ('error', 'warning', 'info')),
  validation_prompt TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compliance Checks (a single check run)
CREATE TABLE IF NOT EXISTS compliance_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  rule_set_id UUID NOT NULL REFERENCES rule_sets(id),
  product_name TEXT,
  overall_status TEXT CHECK (overall_status IN ('pass', 'warning', 'fail')),
  pass_count INT DEFAULT 0,
  warning_count INT DEFAULT 0,
  fail_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Uploaded Panel Images
CREATE TABLE IF NOT EXISTS panel_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compliance_check_id UUID NOT NULL REFERENCES compliance_checks(id) ON DELETE CASCADE,
  panel_type TEXT NOT NULL CHECK (panel_type IN ('front', 'back', 'left_side', 'right_side', 'exit_bag', 'other')),
  blob_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  extracted_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Check Results (one per rule per check)
CREATE TABLE IF NOT EXISTS check_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compliance_check_id UUID NOT NULL REFERENCES compliance_checks(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES compliance_rules(id),
  status TEXT NOT NULL CHECK (status IN ('pass', 'warning', 'fail')),
  found_value TEXT,
  expected_value TEXT,
  explanation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rule_sets_user ON rule_sets(user_id);
CREATE INDEX IF NOT EXISTS idx_rule_sets_active ON rule_sets(is_active);
CREATE INDEX IF NOT EXISTS idx_compliance_checks_user ON compliance_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_compliance_checks_created ON compliance_checks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_rule_set ON compliance_rules(rule_set_id);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_active ON compliance_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_panel_uploads_check ON panel_uploads(compliance_check_id);
CREATE INDEX IF NOT EXISTS idx_check_results_check ON check_results(compliance_check_id);
CREATE INDEX IF NOT EXISTS idx_check_results_rule ON check_results(rule_id);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for auto-updating updated_at
DROP TRIGGER IF EXISTS update_rule_sets_updated_at ON rule_sets;
CREATE TRIGGER update_rule_sets_updated_at
    BEFORE UPDATE ON rule_sets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_compliance_rules_updated_at ON compliance_rules;
CREATE TRIGGER update_compliance_rules_updated_at
    BEFORE UPDATE ON compliance_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

