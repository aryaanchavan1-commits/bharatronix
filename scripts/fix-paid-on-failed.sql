-- Correct orders that were marked paid while Dodo recorded the payment as failed.
-- Cause: the return page treated "Dodo returned a payment_id" as proof of payment.
-- Affected: CRN-1793803381412-A2JD6, CRN-1793803547530-MCOYJ, CRN-1793803717659-ORNLH
-- Run once. Guarded on status = 'paid' so re-running is a no-op.
\set ON_ERROR_STOP on

BEGIN;

\echo '--- BEFORE (record of the license keys being voided) ---'
SELECT o.order_number,
       o.status,
       o.total,
       o.stripe_payment_intent_id AS dodo_payment,
       o.invoice_number,
       item ->> 'slug'        AS slug,
       item ->> 'licenseKey'  AS voided_key
FROM orders o,
     jsonb_array_elements(o.items) AS item
WHERE o.order_number IN (
  'CRN-1793803381412-A2JD6',
  'CRN-1793803547530-MCOYJ',
  'CRN-1793803717659-ORNLH'
)
ORDER BY o.order_number;

UPDATE payments
SET status = 'failed'
WHERE order_id IN (
  SELECT id FROM orders WHERE order_number IN (
    'CRN-1793803381412-A2JD6',
    'CRN-1793803547530-MCOYJ',
    'CRN-1793803717659-ORNLH'
  )
);

UPDATE orders
SET status            = 'failed',
    invoice_number    = NULL,
    next_retry_at     = NULL,
    retry_count       = 0,
    items = (
      SELECT jsonb_agg(item - 'licenseKey')
      FROM jsonb_array_elements(items) AS item
    )
WHERE order_number IN (
  'CRN-1793803381412-A2JD6',
  'CRN-1793803547530-MCOYJ',
  'CRN-1793803717659-ORNLH'
)
AND status = 'paid';

\echo '--- AFTER (keys must be gone, invoice null, status failed) ---'
SELECT o.order_number, o.status, o.total, o.invoice_number, o.items
FROM orders o
WHERE o.order_number IN (
  'CRN-1793803381412-A2JD6',
  'CRN-1793803547530-MCOYJ',
  'CRN-1793803717659-ORNLH'
)
ORDER BY o.order_number;

\echo '--- no order anywhere may remain paid on a failed Dodo payment ---'
SELECT count(*) AS paid_orders_remaining FROM orders WHERE status = 'paid';

COMMIT;
