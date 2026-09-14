-- Migration 009: Expand invoice_month in rent_invoices to VARCHAR(100)
ALTER TABLE rent_invoices ALTER COLUMN invoice_month TYPE VARCHAR(100);
