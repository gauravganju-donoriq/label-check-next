-- Update product_type CHECK constraint to only allow: flower, edibles, concentrates, topicals
-- Removes: tinctures, pre_rolls, other

ALTER TABLE rule_sets 
DROP CONSTRAINT rule_sets_product_type_check;

ALTER TABLE rule_sets 
ADD CONSTRAINT rule_sets_product_type_check 
CHECK (product_type IN ('flower', 'edibles', 'concentrates', 'topicals'));

