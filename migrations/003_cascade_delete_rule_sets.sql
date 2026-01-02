-- Migration: Add CASCADE DELETE to rule_sets foreign key
-- This allows deleting a rule set along with all its compliance checks

-- Drop the existing foreign key constraint
ALTER TABLE compliance_checks
  DROP CONSTRAINT IF EXISTS compliance_checks_rule_set_id_fkey;

-- Re-add with ON DELETE CASCADE
ALTER TABLE compliance_checks
  ADD CONSTRAINT compliance_checks_rule_set_id_fkey
    FOREIGN KEY (rule_set_id) REFERENCES rule_sets(id) ON DELETE CASCADE;

