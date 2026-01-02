-- Migration: Add source citation and generation status fields to compliance_rules
-- This stores the rule_text_citation URL and status from the external rules extraction API

-- Add source_citation column to store the regulatory source URL
ALTER TABLE compliance_rules
  ADD COLUMN IF NOT EXISTS source_citation TEXT;

-- Add generation_status column to store the status from the API (new, updated, unchanged)
ALTER TABLE compliance_rules
  ADD COLUMN IF NOT EXISTS generation_status TEXT CHECK (generation_status IN ('new', 'updated', 'unchanged'));

-- Add index for efficient lookups when matching existing rules
CREATE INDEX IF NOT EXISTS idx_compliance_rules_source_citation 
  ON compliance_rules(source_citation);

