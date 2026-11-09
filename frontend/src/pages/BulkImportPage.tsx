import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertOctagon,
  Download,
  AlertTriangle,
  Copy,
  Layers,
  ArrowRight,
  Search,
  X,
} from 'lucide-react';
import { Badge } from '../components/Badge';
import { FilterButton } from '../components/FilterButton';
import { FilterField, FilterSelect } from '../components/FilterControls';

export const BulkImportPage: React.FC = () => {
  const { currentBranch, selectedBranchId, isBillingUser } = useAuth();

  const [importType, setImportType] = useState<'CATALOGUE' | 'STOCK_RECEIPT'>('CATALOGUE');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  const [importResult, setImportResult] = useState<any>(null);
  const [commitMessage, setCommitMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Staged Preview Filter State
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewStatusFilter, setPreviewStatusFilter] = useState('');
  const [previewIssueFilter, setPreviewIssueFilter] = useState('');

  const activePreviewFilterCount = [previewStatusFilter, previewIssueFilter].filter(Boolean).length;
  const resetPreviewFilters = () => {
    setPreviewStatusFilter('');
    setPreviewIssueFilter('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setImportResult(null);
      setCommitMessage(null);
    }
  };

  const handleUploadAndPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsUploading(true);
    setCommitMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('importType', importType);
      formData.append('branchId', selectedBranchId);

      const result = await api.uploadImportFile(formData);
      setImportResult(result);
    } catch (err: any) {
      setCommitMessage({ text: err.message || 'Failed to parse import file.', type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleCommit = async () => {
    if (!importResult?.importId) return;
    setIsCommitting(true);
    setCommitMessage(null);

    try {
      const res = await api.commitImport(importResult.importId);
      setCommitMessage({ text: res.message, type: 'success' });
      // Clear staged result after commit
      setImportResult(null);
      setSelectedFile(null);
    } catch (err: any) {
      setCommitMessage({ text: err.message || 'Failed to commit import records.', type: 'error' });
    } finally {
      setIsCommitting(false);
    }
  };

  const handleDownloadTemplate = async (type: 'catalogue' | 'stock_receipt') => {
    try {
      const blob = await api.downloadTemplate(type);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = type === 'catalogue' ? 'confidos_catalogue_template.csv' : 'confidos_stock_receipt_template.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setCommitMessage({
        text: err.message || 'Failed to download CSV template. Please ensure you are logged in.',
        type: 'error',
      });
    }
  };

  const handleDownloadErrors = () => {
    if (importResult?.importId) {
      window.open(api.downloadErrorsUrl(importResult.importId), '_blank');
    }
  };

  const filteredPreviewRows = (importResult?.previewRows || []).filter((r: any) => {
    if (previewSearch.trim()) {
      const q = previewSearch.toLowerCase();
      const matchBrand = (r.brandName || r.internalCode)?.toLowerCase().includes(q);
      const matchGen = r.genericName?.toLowerCase().includes(q);
      const matchBatch = r.batchNumber?.toLowerCase().includes(q);
      if (!matchBrand && !matchGen && !matchBatch) return false;
    }
    if (previewStatusFilter && r.status !== previewStatusFilter) {
      return false;
    }
    if (previewIssueFilter === 'ERRORS' && (!r.errors || r.errors.length === 0)) {
      return false;
    }
    if (previewIssueFilter === 'WARNINGS' && (!r.warnings || r.warnings.length === 0)) {
      return false;
    }
    if (previewIssueFilter === 'CLEAN' && ((r.errors && r.errors.length > 0) || (r.warnings && r.warnings.length > 0))) {
      return false;
    }
    return true;
  });

  if (isBillingUser) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm">
        Billing users are not authorized to access bulk upload. Please contact your Branch Admin.
      </div>
    );
  }

  return (
    <div className="p-3.5 sm:p-5 md:p-8 space-y-4 sm:space-y-6 max-w-7xl mx-auto overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Bulk Data Import & Staging</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Two-stage verified import with deterministic validation, preview, and audit protection (No LLM dependency).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleDownloadTemplate('catalogue')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            Catalogue Template (CSV)
          </button>
          <button
            onClick={() => handleDownloadTemplate('stock_receipt')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            Stock Receipt Template (CSV)
          </button>
        </div>
      </div>

      {commitMessage && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center justify-between ${
            commitMessage.type === 'success'
              ? 'bg-pharmagreen-50 text-pharmagreen-800 border border-pharmagreen-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {commitMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-pharmagreen-600 flex-shrink-0" />
            ) : (
              <AlertOctagon className="w-5 h-5 text-rose-600 flex-shrink-0" />
            )}
            <span>{commitMessage.text}</span>
          </div>
          <button onClick={() => setCommitMessage(null)} className="font-bold underline ml-2">
            Dismiss
          </button>
        </div>
      )}

      {/* Upload Form Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
        <form onSubmit={handleUploadAndPreview} className="space-y-5">
          {/* Step 1: Choose Import Type */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-2">
              1. Select Import Workflow (PRD Section 7.2)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
              <label
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  importType === 'CATALOGUE'
                    ? 'bg-brand-50/80 border-brand-500 text-brand-950 shadow-xs ring-1 ring-brand-500'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <input
                  type="radio"
                  name="importType"
                  value="CATALOGUE"
                  checked={importType === 'CATALOGUE'}
                  onChange={() => setImportType('CATALOGUE')}
                  className="mt-0.5 text-brand-600 focus:ring-brand-500"
                />
                <div>
                  <span className="font-bold text-xs block">Type A: Medicine Catalogue Import</span>
                  <span className="text-[11px] text-slate-500 leading-relaxed block mt-0.5">
                    Adds or updates master medicine definitions (Brand Name, Quantity, Free Quantity, Batch, Expiry, Manufacturer, MRP, GST). Extra columns in your CSV/Excel are automatically ignored.
                  </span>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  importType === 'STOCK_RECEIPT'
                    ? 'bg-brand-50/80 border-brand-500 text-brand-950 shadow-xs ring-1 ring-brand-500'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <input
                  type="radio"
                  name="importType"
                  value="STOCK_RECEIPT"
                  checked={importType === 'STOCK_RECEIPT'}
                  onChange={() => setImportType('STOCK_RECEIPT')}
                  className="mt-0.5 text-brand-600 focus:ring-brand-500"
                />
                <div>
                  <span className="font-bold text-xs block">Type B: Stock Receipt Import</span>
                  <span className="text-[11px] text-slate-500 leading-relaxed block mt-0.5">
                    Records incoming stock batches for <strong>{currentBranch?.name}</strong>. Validates batch number, non-expired date, and quantities.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Step 2: Choose File */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-2">
              2. Upload File (.xlsx, .csv, .xls)
            </label>
            <div className="border-2 border-dashed border-slate-300 hover:border-brand-500 rounded-xl p-6 text-center bg-slate-50/50 hover:bg-brand-50/20 transition-all max-w-xl">
              <UploadCloud className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <input
                type="file"
                id="file-upload"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <label
                htmlFor="file-upload"
                className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 shadow-xs cursor-pointer inline-block"
              >
                Choose Spreadsheet File
              </label>
              <p className="text-xs text-slate-500 mt-2">
                {selectedFile ? (
                  <span className="font-bold text-brand-700 font-mono">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                ) : (
                  'Drag and drop Excel or CSV file here, or click to browse'
                )}
              </p>
            </div>
          </div>

          {/* Submit Preview Button */}
          <div>
            <button
              type="submit"
              disabled={!selectedFile || isUploading}
              className={`px-5 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-xs ${
                !selectedFile || isUploading
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              {isUploading ? 'Parsing & Validating Rows...' : 'Parse & Generate Staging Preview'}
            </button>
          </div>
        </form>
      </div>

      {/* Staging & Preview Results Section (PRD Section 7.4) */}
      {importResult && (
        <div className="space-y-5 animate-in fade-in">
          {/* Metrics summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Total Rows</span>
              <p className="text-xl font-black font-mono text-slate-900 mt-1">{importResult.summary.totalRows}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-pharmagreen-200 text-center shadow-xs bg-pharmagreen-50/20">
              <span className="text-[11px] font-bold text-pharmagreen-700 uppercase">Valid Rows</span>
              <p className="text-xl font-black font-mono text-pharmagreen-700 mt-1">{importResult.summary.validRows}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-rose-200 text-center shadow-xs bg-rose-50/20">
              <span className="text-[11px] font-bold text-rose-700 uppercase">Error Rows</span>
              <p className="text-xl font-black font-mono text-rose-700 mt-1">{importResult.summary.errorRows}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-amber-200 text-center shadow-xs bg-amber-50/20">
              <span className="text-[11px] font-bold text-amber-700 uppercase">Duplicates</span>
              <p className="text-xl font-black font-mono text-amber-700 mt-1">{importResult.summary.duplicateRows}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Warnings</span>
              <p className="text-xl font-black font-mono text-slate-700 mt-1">{importResult.summary.warningRows}</p>
            </div>
            {importResult.summary.estimatedStockUnits !== undefined && (
              <div className="bg-white p-4 rounded-xl border border-blue-200 text-center shadow-xs bg-blue-50/20">
                <span className="text-[11px] font-bold text-blue-700 uppercase">Stock Units</span>
                <p className="text-xl font-black font-mono text-blue-700 mt-1">{importResult.summary.estimatedStockUnits}</p>
              </div>
            )}
          </div>

          {/* Action bar: Commit vs Download Errors */}
          <div className="p-4 bg-slate-900 text-white rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
            <div>
              <p className="font-bold text-sm">Review Staging Results</p>
              <p className="text-xs text-slate-300">
                {importResult.summary.validRows} rows ready to commit to database.
                {importResult.summary.errorRows > 0 && ` (${importResult.summary.errorRows} error rows will be excluded).`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {importResult.summary.errorRows > 0 && (
                <button
                  onClick={handleDownloadErrors}
                  className="flex items-center gap-1.5 px-3 py-2 bg-rose-600/80 hover:bg-rose-600 text-white rounded-lg text-xs font-semibold"
                >
                  <Download className="w-4 h-4" />
                  Download Error Rows (CSV)
                </button>
              )}
              <button
                onClick={handleCommit}
                disabled={isCommitting || importResult.summary.validRows === 0}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all shadow-xs ${
                  importResult.summary.validRows === 0 || isCommitting
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : 'bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                {isCommitting ? 'Writing to Database...' : `Authorize & Commit (${importResult.summary.validRows} Rows)`}
              </button>
            </div>
          </div>

          {/* Table Preview */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Staged Row Preview
                </h3>
                <p className="text-[10px] text-slate-500">
                  Showing {filteredPreviewRows.length} of {importResult.previewRows.length} parsed records
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search medicine, batch..."
                    value={previewSearch}
                    onChange={(e) => setPreviewSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg w-52 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-colors"
                  />
                </div>

                <FilterButton
                  activeFilterCount={activePreviewFilterCount}
                  onReset={resetPreviewFilters}
                  buttonLabel="Filter Rows"
                  popoverWidth="w-72"
                  align="right"
                >
                  <div className="space-y-3">
                    <FilterField label="Row Status">
                      <FilterSelect
                        value={previewStatusFilter}
                        onChange={(e) => setPreviewStatusFilter(e.target.value)}
                        options={[
                          { label: 'READY (Valid - Will Commit)', value: 'READY' },
                          { label: 'ERROR (Excluded from Commit)', value: 'ERROR' },
                        ]}
                      />
                    </FilterField>

                    <FilterField label="Validation Issues">
                      <FilterSelect
                        value={previewIssueFilter}
                        onChange={(e) => setPreviewIssueFilter(e.target.value)}
                        options={[
                          { label: 'Rows with Critical Errors', value: 'ERRORS' },
                          { label: 'Rows with Warnings', value: 'WARNINGS' },
                          { label: 'Clean Validated Rows', value: 'CLEAN' },
                        ]}
                      />
                    </FilterField>
                  </div>
                </FilterButton>
              </div>
            </div>

            {/* Active Preview Filter Badges */}
            {(activePreviewFilterCount > 0 || previewSearch) && (
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center flex-wrap gap-2 text-xs">
                <span className="text-slate-500 font-medium text-[11px]">Filtered by:</span>
                {previewSearch && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700 text-[11px]">
                    Search: "{previewSearch}"
                    <button onClick={() => setPreviewSearch('')} className="hover:text-rose-500">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {previewStatusFilter && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 border border-brand-200 text-brand-800 text-[11px]">
                    Status: {previewStatusFilter}
                    <button onClick={() => setPreviewStatusFilter('')} className="hover:text-rose-500">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {previewIssueFilter && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 border border-brand-200 text-brand-800 text-[11px]">
                    Issues: {previewIssueFilter}
                    <button onClick={() => setPreviewIssueFilter('')} className="hover:text-rose-500">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                <button
                  onClick={() => {
                    setPreviewSearch('');
                    resetPreviewFilters();
                  }}
                  className="text-[11px] text-brand-600 hover:text-brand-800 font-semibold underline ml-1"
                >
                  Clear All
                </button>
              </div>
            )}

            <div className="overflow-x-auto touch-scroll max-h-96">
              <table className="w-full text-left text-xs min-w-[1200px]">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 sticky top-0 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3 text-center">Row</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3">Medicine Name</th>
                    <th className="py-2.5 px-3">Batch No</th>
                    <th className="py-2.5 px-3">Expiry Date</th>
                    <th className="py-2.5 px-3">HSN No</th>
                    <th className="py-2.5 px-3">Manufacturer</th>
                    <th className="py-2.5 px-3 text-center">Strip Qty in Box</th>
                    <th className="py-2.5 px-3 text-center">Strip Unit Qty</th>
                    <th className="py-2.5 px-3 text-center">Total Units</th>
                    <th className="py-2.5 px-3 text-center font-bold text-emerald-800">Physical Units</th>
                    <th className="py-2.5 px-3 text-right">Strip P.Price</th>
                    <th className="py-2.5 px-3 text-right">Strip MRP</th>
                    <th className="py-2.5 px-3 text-right">Unit P.Price</th>
                    <th className="py-2.5 px-3 text-right font-bold text-emerald-800">Unit Selling Price</th>
                    <th className="py-2.5 px-4">Validation Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredPreviewRows.length === 0 ? (
                    <tr>
                      <td colSpan={16} className="py-8 text-center text-slate-400">
                        No staging preview rows match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredPreviewRows.map((r: any, idx: number) => (
                      <tr key={idx} className={r.status === 'ERROR' ? 'bg-rose-50/40 hover:bg-rose-50/60' : 'hover:bg-slate-50/50'}>
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-500">
                          {r.rowIndex}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <Badge variant={r.status === 'READY' ? 'success' : 'danger'} size="sm">
                            {r.status}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">
                          {r.medicineName || r.brandName || r.internalCode || '-'}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-700 font-semibold">
                          {r.batchNumber || '-'}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600">
                          {r.expiryDate ? String(r.expiryDate).slice(0, 10) : '-'}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-500">
                          {r.hsnCode || '-'}
                        </td>
                        <td className="py-2 px-3 text-slate-700">
                          {r.manufacturer || '-'}
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-semibold">
                          {r.stripQuantityInBox !== undefined ? r.stripQuantityInBox : (r.quantity || 1)}
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-semibold">
                          {r.stripUnitQuantity !== undefined ? r.stripUnitQuantity : 10}
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-800">
                          {r.totalUnits !== undefined ? r.totalUnits : (r.quantity || 10)}
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-emerald-800 bg-emerald-50/40">
                          {r.pharmacyPhysicalUnits !== undefined ? r.pharmacyPhysicalUnits : (r.totalUnits || r.quantity || 10)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700">
                          ₹{Number(r.stripPurchasePrice !== undefined ? r.stripPurchasePrice : (r.purchaseRate || 0)).toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                          ₹{Number(r.stripMrpPrice !== undefined ? r.stripMrpPrice : (r.mrp || 0)).toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-blue-700">
                          ₹{Number(r.purchaseUnitPrice !== undefined ? r.purchaseUnitPrice : (r.stripUnitQuantity ? ((r.stripPurchasePrice || r.purchaseRate || 0) / r.stripUnitQuantity) : 0)).toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-black text-emerald-900 bg-emerald-50/40">
                          ₹{Number(r.unitSellingPrice !== undefined ? r.unitSellingPrice : (r.stripUnitQuantity ? ((r.stripMrpPrice || r.mrp || 0) / r.stripUnitQuantity) : 0)).toFixed(2)}
                        </td>
                        <td className="py-2 px-4 text-[11px]">
                          {r.errors && r.errors.length > 0 && (
                            <span className="text-rose-600 font-semibold block">{r.errors.join('; ')}</span>
                          )}
                          {r.warnings && r.warnings.length > 0 && (
                            <span className="text-amber-600 block">{r.warnings.join('; ')}</span>
                          )}
                          {(!r.errors || r.errors.length === 0) && (!r.warnings || r.warnings.length === 0) && (
                            <span className="text-emerald-700 font-semibold">Ready to Import</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
