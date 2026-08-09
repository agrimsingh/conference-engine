-- Recusal: assignment remains for audit, but is excluded from required completion.
ALTER TABLE review_assignments ADD COLUMN recused_at INTEGER;
