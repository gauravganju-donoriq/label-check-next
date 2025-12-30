-- Migration: Support for generated (runtime-only) compliance rules
-- This allows check_results to store inline rule details when rules are 
-- generated at runtime by the LLM based on state/product type

-- Make rule_id nullable to support generated rules that aren't persisted
ALTER TABLE check_results 
  ALTER COLUMN rule_id DROP NOT NULL;

-- Add columns to store generated rule details inline
ALTER TABLE check_results
  ADD COLUMN IF NOT EXISTS generated_rule_name TEXT,
  ADD COLUMN IF NOT EXISTS generated_rule_description TEXT,
  ADD COLUMN IF NOT EXISTS generated_rule_category TEXT;

-- Add a flag to indicate if this result came from a generated rule
ALTER TABLE check_results
  ADD COLUMN IF NOT EXISTS is_generated_rule BOOLEAN DEFAULT false;

-- Add index for filtering by generated rules
CREATE INDEX IF NOT EXISTS idx_check_results_is_generated 
  ON check_results(is_generated_rule);

-- Update constraint: either rule_id is set OR generated_rule_name is set
-- This is enforced via check constraint
ALTER TABLE check_results
  DROP CONSTRAINT IF EXISTS check_results_rule_id_fkey;

ALTER TABLE check_results
  ADD CONSTRAINT check_results_rule_id_fkey 
    FOREIGN KEY (rule_id) REFERENCES compliance_rules(id) ON DELETE SET NULL;

-- Ensure we have either a rule_id or generated rule details
ALTER TABLE check_results
  ADD CONSTRAINT check_results_rule_source 
    CHECK (
      (rule_id IS NOT NULL) OR 
      (is_generated_rule = true AND generated_rule_name IS NOT NULL)
    );

