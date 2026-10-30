# Confidos Pharma — Test Execution Results & Baseline Inventory

**Project:** Confidos Pharma Enterprise Multi-Branch Inventory and Billing Platform  
**Repository:** [https://github.com/jamesyuvaraj27/confidospharma](https://github.com/jamesyuvaraj27/confidospharma)  
**Execution Environment:** Node.js v26.5.1, Vitest v2.1.9, Supertest v7.0.0, Neon PostgreSQL  
**Date:** October 30, 2026  

---

## 1. Test Suite Summary Table

| Test Suite File | Module Under Test | Tests Executed | Passed | Failed | Blocked | Duration | Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `tests/purchase_import.test.ts` | Purchase Inward Import, Normalization & Target Branch | 28 | 28 | 0 | 0 | 65.98s | **PASS** |
| `tests/api.test.ts` | Core Endpoints, Auth, Setup, Branch Isolation | 20 | 20 | 0 | 0 | 3.57s | **PASS** |
| `tests/stock_monitoring_and_purchase_fix.test.ts` | Stock Monitoring, FEFO Drill-Down, Inward Stock FK Fix | 11 | 11 | 0 | 0 | 72.34s | **PASS** |
| `tests/pos_unit_selector_enhancements.test.ts` | POS Unit Selector, Bottle Support, Stock Deductions | 9 | 9 | 0 | 0 | 61.96s | **PASS** |
| `tests/dummy_data_verification.test.ts` | Unit Conversion Math, Packaging Rules, Pricing Parity | 29 | 29 | 0 | 0 | 3.61s | **PASS** |
| `tests/unit_pricing_conversion.test.ts` | Pricing Engine, Discount Enforcement (0-20%), Rounding | 14 | 14 | 0 | 0 | 48.42s | **PASS** |
| `tests/medicine_stock_and_navigation_enhancements.test.ts` | Initial Stock Entry, Pack Conversions, Route Safety | 9 | 9 | 0 | 0 | 62.92s | **PASS** |
| `tests/audit_fixes.test.ts` | Audit Logs, Event Persistence, Entity Tracking | 18 | 18 | 0 | 0 | 3.18s | **PASS** |
| `tests/enterprise_defects_verification.test.ts` | Bulk Deletions, Safeguards, Supplier Quick Add, Route Shadowing | 12 | 12 | 0 | 0 | 33.40s | **PASS** |
| `tests/imports.test.ts` | CSV / XLSX File Parsing, Column Header Collisions | 17 | 17 | 0 | 0 | 4.96s | **PASS** |
| `tests/quality_audit_fixes_regression.test.ts` | Purchase Cancellation Pack Unit Reversal, Stock Guard, Bulk Delete Guidance & Edge Cases | 10 | 10 | 0 | 0 | 89.01s | **PASS** |
| **Total** | **All 11 Core Application & Regression Modules** | **177** | **177** | **0** | **0** | **495.61s** | **100% PASS** |

---

## 2. Tested Key Domain Logic & Scenarios

### 2.1 Multi-Unit Packaging & Conversion
- **Linear Hierarchy:** 1 Box = 10 Strips = 100 Tablets. Unit cost = Purchase Price / 100. Verified across multiple test suites.
- **Sachets:** Box to Sachet packaging conversion tested.
- **Liquids / Syrups:** Bottle base unit tested with ml and box multipliers.
- **Blister Tablet Rules:** Blister medicines reject invalid Bottle unit sales unless specifically configured.

### 2.2 Financial Math & GST Compliance
- **Tax-inclusive Reverse Math:**
  `taxable = net / (1 + gstRate / 100)`
  `lineTax = net - taxable`
  Intra-state split: `CGST = lineTax / 2`, `SGST = lineTax / 2`.
- **Policy Discounts:** 0% to 10% on POS counter; 0% to 20% on purchases. Rejection of negative discounts and discounts exceeding policy limit.
- **Standard Rounding:** Grand total rounded to nearest rupee with `roundOff` tracking.

### 2.3 Branch Isolation & Security
- Super Admin company-wide access vs Branch Admin branch-scoped access verified.
- Cross-branch snooping and modifying records of foreign branches rejected with HTTP 403.
- Staff self-deactivation blocked with HTTP 400.
- Mandatory safeguard preventing deactivation of the last remaining Super Admin verified.
