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
} from 'lucide-react';
import { Badge } from '../components/Badge';

export const BulkImportPage: React.FC = () => {
  const { currentBranch, selectedBranchId, isBillingUser } = useAuth();

  const [importType, setImportType] = useState<'CATALOGUE' | 'STOCK_RECEIPT'>('CATALOGUE');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  const [importResult, setImportResult] = useState<any>(null);
  const [commitMessage, setCommitMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

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

  const handleDownloadTemplate = (type: 'catalogue' | 'stock_receipt') => {
    window.open(`/api/imports/template/${type}`, '_blank');
  };

  const handleDownloadErrors = () => {
    if (importResult?.importId) {
      window.open(`/api/imports/${importResult.importId}/download-errors`, '_blank');
    }
  };

  if (isBillingUser) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm">
        Billing users are not authorized to access bulk upload. Please contact your Branch Admin.
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Bulk Data Import & Staging</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Two-stage verified import with deterministic validation, preview, and audit protection (No LLM dependency).
          </p>
        </div>

        <div className="flex items-center gap-2">
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
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {commitMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
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
                    ? 'bg-emerald-50/80 border-emerald-600 text-emerald-950 shadow-xs ring-1 ring-emerald-600'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <input
                  type="radio"
                  name="importType"
                  value="CATALOGUE"
                  checked={importType === 'CATALOGUE'}
                  onChange={() => setImportType('CATALOGUE')}
                  className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <span className="font-bold text-xs block">Type A: Medicine Catalogue Import</span>
                  <span className="text-[11px] text-slate-500 leading-relaxed block mt-0.5">
                    Adds or updates master medicine definitions (brand, generic, strength, HSN, MRP). Does not affect branch live stock.
                  </span>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  importType === 'STOCK_RECEIPT'
                    ? 'bg-emerald-50/80 border-emerald-600 text-emerald-950 shadow-xs ring-1 ring-emerald-600'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <input
                  type="radio"
                  name="importType"
                  value="STOCK_RECEIPT"
                  checked={importType === 'STOCK_RECEIPT'}
                  onChange={() => setImportType('STOCK_RECEIPT')}
                  className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
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
            <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-6 text-center bg-slate-50/50 hover:bg-emerald-50/20 transition-all max-w-xl">
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
                  <span className="font-bold text-emerald-700 font-mono">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
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
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
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
            <div className="bg-white p-4 rounded-xl border border-emerald-200 text-center shadow-xs bg-emerald-50/20">
              <span className="text-[11px] font-bold text-emerald-700 uppercase">Valid Rows</span>
              <p className="text-xl font-black font-mono text-emerald-700 mt-1">{importResult.summary.validRows}</p>
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
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all ${
                  importResult.summary.validRows === 0 || isCommitting
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black shadow-sm'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                {isCommitting ? 'Writing to Database...' : `Authorize & Commit (${importResult.summary.validRows} Rows)`}
              </button>
            </div>
          </div>

          {/* Table Preview */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Staged Row Preview (Showing {importResult.previewRows.length} rows)
              </h3>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3 text-center">Row</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Item / Description</th>
                    <th className="py-2.5 px-3">Batch / Code</th>
                    <th className="py-2.5 px-3 text-right">Price / MRP</th>
                    <th className="py-2.5 px-4">Validation Notes / Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {importResult.previewRows.map((r: any, idx: number) => (
                    <tr key={idx} className={r.status === 'ERROR' ? 'bg-rose-50/30' : 'hover:bg-slate-50/50'}>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-500">
                        {r.rowIndex}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant={r.status === 'READY' ? 'success' : 'danger'} size="sm">
                          {r.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-800">
                        {r.brandName || r.internalCode}
                        {r.genericName && <span className="block text-[11px] text-slate-500 font-normal">{r.genericName}</span>}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        {r.batchNumber || r.strength || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                        ₹{(r.mrp || 0).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-4 text-[11px]">
                        {r.errors && r.errors.length > 0 && (
                          <span className="text-rose-600 font-semibold block">{r.errors.join('; ')}</span>
                        )}
                        {r.warnings && r.warnings.length > 0 && (
                          <span className="text-amber-600 block">{r.warnings.join('; ')}</span>
                        )}
                        {r.errors?.length === 0 && r.warnings?.length === 0 && (
                          <span className="text-emerald-700">Validated</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
