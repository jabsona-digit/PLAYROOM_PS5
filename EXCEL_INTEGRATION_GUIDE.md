# Excel Integration Guide for Backend Developers

This document outlines the current state and logic of the Excel Import/Export system implemented in the Playroom Admin Panel frontend.

## Overview
The system uses the `xlsx` library to handle spreadsheet operations entirely on the client side.

### Frontend Files
- `lib/excel.ts`: Core utility for template generation, JSON-to-Excel export, and Excel-to-JSON parsing.
- `components/admin/inventory.tsx`: Logic for bulk importing products and automatic category creation.
- `components/admin/accounting.tsx`: Logic for exporting financial reports and importing expenses.

## Current Logic
### Inventory Import
1. **Category Handling**: 
   - The importer reads the `კატეგორია` (Category) column.
   - It performs a case-insensitive check against existing `bar_categories`.
   - **Missing Categories**: If a category name is not found, the frontend performs an immediate `INSERT` into `bar_categories` using `supabase.from('bar_categories').insert(...).select()`.
   - The returned IDs are then used to map the products.
2. **Product Bulk Insert**:
   - Products are inserted in a single bulk operation via `supabase.from('bar_products').insert(toInsert)`.

### Accounting Integration
- **Export**: Generates a spreadsheet containing PNL KPIs and the `expenses` list for the selected date range.
- **Expense Import**: Reads the `კატეგორია` column, maps it to `ExpenseCategory` keys using a label lookup, and uses the `add_expense` RPC for insertion.

## To-Be-Done / Backend Requirements
- **Validation**: Currently, there is minimal server-side validation for duplicate barcodes during bulk insert (PostgreSQL unique constraint will throw an error).
- **Triggers**: Ensure `bar_products` inserts correctly update any summary tables if they exist in the future.
- **RPC for Products**: Consider moving the "Category Creation + Product Insert" logic into a single database function (PL/pgSQL) to ensure atomicity and reduce round-trips.

## Contact
This feature was implemented by Antigravity (AI Assistant). For questions about UI styling, refer to the Neumorphic Design System documentation.
