BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "financial_transactions"
        WHERE "amount" <= 0
    ) THEN
        RAISE EXCEPTION
            'Cannot add financial_transactions_amount_positive_check: financial_transactions contains amount <= 0';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "appointments"
        WHERE "durationMinutes" < 1
    ) THEN
        RAISE EXCEPTION
            'Cannot add appointments_duration_minutes_positive_check: appointments contains durationMinutes < 1';
    END IF;
END $$;

ALTER TABLE "financial_transactions"
    ADD CONSTRAINT "financial_transactions_amount_positive_check"
    CHECK ("amount" > 0);

ALTER TABLE "appointments"
    ADD CONSTRAINT "appointments_duration_minutes_positive_check"
    CHECK ("durationMinutes" >= 1);

COMMIT;
