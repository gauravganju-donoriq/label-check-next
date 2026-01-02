-- Migration: Fix rule deletion by using CASCADE instead of SET NULL
-- When a compliance_rule is deleted, its check_results should be deleted too

-- First, drop the problematic check constraint
ALTER TABLE check_results
  DROP CONSTRAINT IF EXISTS check_results_rule_source;

-- Drop the existing foreign key with SET NULL
ALTER TABLE check_results
  DROP CONSTRAINT IF EXISTS check_results_rule_id_fkey;

-- Re-add foreign key with ON DELETE CASCADE
-- This means: when a rule is deleted, all its check_results are deleted
ALTER TABLE check_results
  ADD CONSTRAINT check_results_rule_id_fkey
    FOREIGN KEY (rule_id) REFERENCES compliance_rules(id) ON DELETE CASCADE;

-- Re-add the check constraint (still needed for generated rules validation)
-- But now it only applies to new inserts, not to cascade deletes
ALTER TABLE check_results
  ADD CONSTRAINT check_results_rule_source 
    CHECK (
      (rule_id IS NOT NULL) OR 
      (is_generated_rule = true AND generated_rule_name IS NOT NULL)
    );

