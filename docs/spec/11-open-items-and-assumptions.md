# Open Items and Assumptions

Defaults implemented behind settings or interfaces until product, finance, or legal decisions are finalised:

- O1 Repayment reporting: CSV upload plus manual update form behind `repayment_reports` interface.
- O2 Non-Uber/Bolt ride-hailing fallback: `CASH_ROUTE` via `settings.non_eligible_platform_fallback`.
- O3 Daily repayment estimate formula: placeholder `estimateDailyRepayment()` behind `settings.daily_estimate_config` with indicative label.
- O4 Pre-inspection fee credit against repair total: `fee_credit_kes = 0` by default; schema and templates support non-zero values.
- O5 VAT display: 16% VAT added on top of catalogue prices.
- O6 Fee refunds: manual refund recorded by accounts only.
- O7 Fee receipt: M-Pesa receipt plus email receipt (eTIMS deferred).
- O8 M-Pesa AccountReference: fixed `531974` behind configuration.
- O9 Lender user invitations: Ask AutoParts admins only.
- O10 Lender maker-checker payment approval: off unless `lenders.maker_checker_threshold_kes` is set.
- O11 Lender scope edits: lender approves terms only; price changes go through ops as a new scope version.
- O12 Lender offer letter: uploaded by lender.
- O13 Failed payroll deductions: reported by lender as `arrears` with a note.
- O14 No logbook surrender, no tracker: applies to both products.
- O15 Scope variance threshold: `10%` via `settings.scope_variance_pct`.
- O16 OTP e-signature legal sufficiency: implemented as specified; counsel review before launch.
- O17 ODPC registration and retention: defaults from section 09 (7 years for uploads/fees, 12 months for auth/notification logs).
- O18 Antivirus scanning: scan job implemented; defaults to `pending` when scanner is not configured.
- O19 Swahili: English at launch; all copy stored in `messages/en.json` via `next-intl`.
- O20 WhatsApp: phase 9 feature-flagged.
- O21 Lender API: portal only at launch; domain functions support thin `/api/lender/v1/*` wrapper later.
- O22 Garage entity: Garden Estate Service Point treated as one garage record with a branch name.
- O23 Drive Easy points: hidden on Handover Certificate unless points are provided.
- O24 Salaried payslip: not required by default (configurable in `product_document_requirements`).
- O25 Legal texts: versioned placeholder copy in `/legal/*`, replaced by counsel before launch.
