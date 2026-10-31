import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Modal } from './Modal';
import { Sliders, CheckCircle2, AlertCircle, Percent, DollarSign, RefreshCw } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSettingsSaved }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [settings, setSettings] = useState({
    MIN_PURCHASE_DISCOUNT_PERCENT: '0.0',
    MAX_PURCHASE_DISCOUNT_PERCENT: '20.0',
    DEFAULT_PURCHASE_DISCOUNT_PERCENT: '15.0',
    DEFAULT_CGST_RATE: '2.5',
    DEFAULT_SGST_RATE: '2.5',
    DEFAULT_COMBINED_GST_RATE: '5.0',
    MAX_DISCOUNT_PERCENT: '10.0',
    NEAR_EXPIRY_THRESHOLD_DAYS: '60',
    COMPANY_NAME: 'Confidos Pharma Ltd.',
  });

  const loadSettings = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const data = await api.getSettings();
      if (data && data.settings) {
        setSettings({
          MIN_PURCHASE_DISCOUNT_PERCENT: data.settings.MIN_PURCHASE_DISCOUNT_PERCENT || '0.0',
          MAX_PURCHASE_DISCOUNT_PERCENT: data.settings.MAX_PURCHASE_DISCOUNT_PERCENT || '20.0',
          DEFAULT_PURCHASE_DISCOUNT_PERCENT: data.settings.DEFAULT_PURCHASE_DISCOUNT_PERCENT || '15.0',
          DEFAULT_CGST_RATE: data.settings.DEFAULT_CGST_RATE || '2.5',
          DEFAULT_SGST_RATE: data.settings.DEFAULT_SGST_RATE || '2.5',
          DEFAULT_COMBINED_GST_RATE: data.settings.DEFAULT_COMBINED_GST_RATE || '5.0',
          MAX_DISCOUNT_PERCENT: data.settings.MAX_DISCOUNT_PERCENT || '10.0',
          NEAR_EXPIRY_THRESHOLD_DAYS: data.settings.NEAR_EXPIRY_THRESHOLD_DAYS || '60',
          COMPANY_NAME: data.settings.COMPANY_NAME || 'Confidos Pharma Ltd.',
        });
      }
    } catch (err: any) {
      // Error handled by defaults
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  // Dynamic calculation for Combined GST
  const cgstVal = parseFloat(settings.DEFAULT_CGST_RATE) || 0;
  const sgstVal = parseFloat(settings.DEFAULT_SGST_RATE) || 0;
  const computedCombinedGST = (cgstVal + sgstVal).toFixed(2).replace(/\.00$/, '');

  // Live illustrative preview calculation
  const previewGross = 1000;
  const previewDiscPct = parseFloat(settings.DEFAULT_PURCHASE_DISCOUNT_PERCENT) || 0;
  const previewDiscAmt = (previewGross * previewDiscPct) / 100;
  const previewTaxable = Math.max(0, previewGross - previewDiscAmt);
  const previewCGSTAmt = (previewTaxable * cgstVal) / 100;
  const previewSGSTAmt = (previewTaxable * sgstVal) / 100;
  const previewTotalTax = previewCGSTAmt + previewSGSTAmt;
  const previewGrandTotal = previewTaxable + previewTotalTax;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        ...settings,
        DEFAULT_COMBINED_GST_RATE: computedCombinedGST,
      };
      await api.updateSettings(payload);
      setMessage({ text: 'System settings & defaults successfully saved and updated across all modules.', type: 'success' });
      if (onSettingsSaved) onSettingsSaved();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to save settings.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Pharmacy System Configuration & Defaults" maxWidth="2xl">
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-xs">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          Loading system settings...
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-5 text-xs">
          {message && (
            <div
              className={`p-3 rounded-lg flex items-center justify-between ${
                message.type === 'success'
                  ? 'bg-pharmagreen-50 text-pharmagreen-800 border border-pharmagreen-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              <span>{message.text}</span>
              <button type="button" onClick={() => setMessage(null)} className="font-bold underline ml-2">
                Dismiss
              </button>
            </div>
          )}

          {/* Section: Discount Configuration */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-brand-500" />
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                Purchase Discount Configuration (Customizable Limit)
              </h3>
            </div>
            <p className="text-[11px] text-slate-500">
              Configure inward purchase discount policy limits and default rate. Set custom limits (e.g. 15% - 20%, 30%, 50%) for inward supplier invoices.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Min Purchase Discount Limit (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  required
                  value={settings.MIN_PURCHASE_DISCOUNT_PERCENT}
                  onChange={(e) =>
                    setSettings({ ...settings, MIN_PURCHASE_DISCOUNT_PERCENT: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-800 focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Max Purchase Discount Limit (%) *
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    required
                    value={settings.MAX_PURCHASE_DISCOUNT_PERCENT}
                    onChange={(e) =>
                      setSettings({ ...settings, MAX_PURCHASE_DISCOUNT_PERCENT: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono font-bold text-brand-900 focus:ring-2 focus:ring-brand-500"
                  />
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, MAX_PURCHASE_DISCOUNT_PERCENT: '20.0' })}
                      className="px-1.5 py-1 bg-slate-200 hover:bg-slate-300 rounded text-[10px] font-bold text-slate-700"
                    >
                      20%
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, MAX_PURCHASE_DISCOUNT_PERCENT: '30.0' })}
                      className="px-1.5 py-1 bg-slate-200 hover:bg-slate-300 rounded text-[10px] font-bold text-slate-700"
                    >
                      30%
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, MAX_PURCHASE_DISCOUNT_PERCENT: '50.0' })}
                      className="px-1.5 py-1 bg-slate-200 hover:bg-slate-300 rounded text-[10px] font-bold text-slate-700"
                    >
                      50%
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Default Purchase Discount (%) *
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    required
                    value={settings.DEFAULT_PURCHASE_DISCOUNT_PERCENT}
                    onChange={(e) =>
                      setSettings({ ...settings, DEFAULT_PURCHASE_DISCOUNT_PERCENT: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono font-bold text-brand-900 focus:ring-2 focus:ring-brand-500"
                  />
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, DEFAULT_PURCHASE_DISCOUNT_PERCENT: '15.0' })}
                      className="px-1.5 py-1 bg-slate-200 hover:bg-slate-300 rounded text-[10px] font-bold text-slate-700"
                    >
                      15%
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, DEFAULT_PURCHASE_DISCOUNT_PERCENT: '18.0' })}
                      className="px-1.5 py-1 bg-slate-200 hover:bg-slate-300 rounded text-[10px] font-bold text-slate-700"
                    >
                      18%
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, DEFAULT_PURCHASE_DISCOUNT_PERCENT: '20.0' })}
                      className="px-1.5 py-1 bg-slate-200 hover:bg-slate-300 rounded text-[10px] font-bold text-slate-700"
                    >
                      20%
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Max Retail Counter Discount (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="50"
                  required
                  value={settings.MAX_DISCOUNT_PERCENT}
                  onChange={(e) =>
                    setSettings({ ...settings, MAX_DISCOUNT_PERCENT: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* Section: Indian GST Configuration */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-brand-500" />
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                Default GST Tax Configuration (CGST 2.5% + SGST 2.5% = 5%)
              </h3>
            </div>
            <p className="text-[11px] text-slate-500">
              Configure default intra-state GST component rates. Note: Products with specific tax categories (e.g. 12%, 18%) retain their configured rate.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Default CGST Rate (%) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="50"
                  required
                  value={settings.DEFAULT_CGST_RATE}
                  onChange={(e) =>
                    setSettings({ ...settings, DEFAULT_CGST_RATE: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-800 focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Default SGST Rate (%) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="50"
                  required
                  value={settings.DEFAULT_SGST_RATE}
                  onChange={(e) =>
                    setSettings({ ...settings, DEFAULT_SGST_RATE: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-800 focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Calculated Total GST (%)
                </label>
                <div className="w-full px-3 py-2 text-xs bg-brand-50 border border-brand-200 rounded-lg font-mono font-black text-brand-900">
                  {computedCombinedGST}% (CGST + SGST)
                </div>
              </div>
            </div>
          </div>

          {/* Illustrative Dual Percentage & Amount Preview */}
          <div className="p-3 bg-white rounded-xl border border-brand-200 shadow-xs space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-700 block">
              Live Invoice Calculation Preview (For ₹1,000.00 Base Gross)
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-700 font-mono">
              <div className="p-2 bg-slate-50 rounded border border-slate-200">
                <span className="text-[10px] text-slate-500 font-sans block">Purchase Gross</span>
                <span className="font-bold">₹{previewGross.toFixed(2)}</span>
              </div>
              <div className="p-2 bg-slate-50 rounded border border-slate-200">
                <span className="text-[10px] text-slate-500 font-sans block">Discount ({previewDiscPct}%)</span>
                <span className="text-rose-600 font-bold">-₹{previewDiscAmt.toFixed(2)}</span>
              </div>
              <div className="p-2 bg-slate-50 rounded border border-slate-200">
                <span className="text-[10px] text-slate-500 font-sans block">Taxable Base</span>
                <span className="font-bold">₹{previewTaxable.toFixed(2)}</span>
              </div>
              <div className="p-2 bg-pharmagreen-50 rounded border border-pharmagreen-200">
                <span className="text-[10px] text-pharmagreen-800 font-sans block">Final Payable</span>
                <span className="text-pharmagreen-900 font-black">₹{previewGrandTotal.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100 font-mono gap-1">
              <span>CGST ({cgstVal}%): ₹{previewCGSTAmt.toFixed(2)}</span>
              <span>SGST ({sgstVal}%): ₹{previewSGSTAmt.toFixed(2)}</span>
              <span className="font-bold text-slate-700">Total GST ({computedCombinedGST}%): ₹{previewTotalTax.toFixed(2)}</span>
            </div>
          </div>

          {/* Section: Operational Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Near-Expiry Alert Threshold (Days)
              </label>
              <input
                type="number"
                min="10"
                max="365"
                required
                value={settings.NEAR_EXPIRY_THRESHOLD_DAYS}
                onChange={(e) =>
                  setSettings({ ...settings, NEAR_EXPIRY_THRESHOLD_DAYS: e.target.value })
                }
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono text-slate-800"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Company Display Name
              </label>
              <input
                type="text"
                required
                value={settings.COMPANY_NAME}
                onChange={(e) => setSettings({ ...settings, COMPANY_NAME: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-semibold"
              />
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto px-5 py-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-1.5 focus:ring-2 focus:ring-brand-500"
            >
              {saving ? 'Saving Settings...' : 'Save & Apply Configuration'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};
