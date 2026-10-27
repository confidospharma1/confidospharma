import React, { useState } from 'react';
import { api } from '../services/api';
import { Scale, ShieldCheck, Mail, Building, FileCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import { Badge } from '../components/Badge';

export const LegalPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'PRIVACY' | 'TERMS' | 'REFUND' | 'GRIEVANCE' | 'DSR'>('PRIVACY');

  // DSR Form state
  const [dsrForm, setDsrForm] = useState({
    requesterName: '',
    requesterEmail: '',
    requesterPhone: '',
    requestType: 'ACCESS',
    details: '',
  });

  const [dsrSuccess, setDsrSuccess] = useState<string | null>(null);
  const [dsrError, setDsrError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmitDSR = async (e: React.FormEvent) => {
    e.preventDefault();
    setDsrSuccess(null);
    setDsrError(null);
    setIsSubmitting(true);

    try {
      const res = await api.submitPrivacyRequest(dsrForm);
      setDsrSuccess(`Request ticket #${res.ticketNumber} registered successfully. Our Grievance Officer will respond within statutory limits.`);
      setDsrForm({
        requesterName: '',
        requesterEmail: '',
        requesterPhone: '',
        requestType: 'ACCESS',
        details: '',
      });
    } catch (err: any) {
      setDsrError(err.message || 'Failed to submit privacy request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl mx-auto overflow-y-auto">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-slate-900">Governance, Legal & Privacy Compliance</h1>
          <Badge variant="brand" size="sm">
            India DPDP Compliant
          </Badge>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Mandatory Indian pharmaceutical regulatory disclosures, terms, grievance mechanisms, and data subject rights.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('PRIVACY')}
          className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
            activeTab === 'PRIVACY' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Privacy Policy
        </button>
        <button
          onClick={() => setActiveTab('TERMS')}
          className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
            activeTab === 'TERMS' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Terms of Service
        </button>
        <button
          onClick={() => setActiveTab('REFUND')}
          className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
            activeTab === 'REFUND' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Return & Refund Policy
        </button>
        <button
          onClick={() => setActiveTab('GRIEVANCE')}
          className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
            activeTab === 'GRIEVANCE' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Grievance Officer
        </button>
        <button
          onClick={() => setActiveTab('DSR')}
          className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
            activeTab === 'DSR' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Data Rights Portal (DSR)
        </button>
      </div>

      {/* Tab Panels */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs leading-relaxed text-xs text-slate-700 space-y-4">
        {activeTab === 'PRIVACY' && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900">Privacy Policy (Confidos Pharma)</h2>
            <p className="text-slate-500 text-[11px]">Last Updated: October 2026 | Effective for physical branches</p>

            <h3 className="text-sm font-bold text-slate-800 pt-2">1. Scope and Principles</h3>
            <p>
              Confidos Healthcare & Pharmaceuticals Private Limited operates physical pharmacy branches in Vijayawada, Guntur, and Tenali. This Privacy Policy outlines our commitment to data minimization, lawful processing under the Digital Personal Data Protection (DPDP) Act, 2023, and applicable Drugs and Cosmetics Rules.
            </p>

            <h3 className="text-sm font-bold text-slate-800 pt-2">2. Data We Collect</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Billing & Sales Data:</strong> Customer name and contact phone number provided voluntarily at counter billing for invoice delivery.</li>
              <li><strong>Prescription Records:</strong> Registered medical practitioner details when dispensing Schedule H and H1 medications as mandated by Indian drug regulations.</li>
              <li><strong>Staff Account Data:</strong> Internal usernames, official email addresses, role permissions, and access audit logs for fraud prevention.</li>
            </ul>

            <h3 className="text-sm font-bold text-slate-800 pt-2">3. Ethical UX & Zero Advertising Guarantee</h3>
            <p>
              Confidos Pharma strictly prohibits third-party advertising trackers, marketing cookies, social media pixels, and automated profile building. We never monetize customer medical purchase histories or sell prescription data to insurers or brokers.
            </p>

            <h3 className="text-sm font-bold text-slate-800 pt-2">4. Data Retention</h3>
            <p>
              Tax and sales invoices are preserved in compliance with GST statutory requirements (6 years). Controlled drug dispensing registers are retained in accordance with CDSCO guidelines.
            </p>
          </div>
        )}

        {activeTab === 'TERMS' && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900">Terms of Pharmacy Service</h2>
            <p className="text-slate-500 text-[11px]">Effective Date: October 2026</p>

            <h3 className="text-sm font-bold text-slate-800 pt-2">1. Operating Model</h3>
            <p>
              Confidos Pharma operates as a licensed physical retail pharmacy management system. The software enforces strict branch inventory separation between Vijayawada, Guntur, and Tenali branches.
            </p>

            <h3 className="text-sm font-bold text-slate-800 pt-2">2. Dispensing Restrictions</h3>
            <p>
              All Schedule H and Schedule H1 drugs (such as antibiotics and cardiac medicines) require valid prescriptions from a registered medical practitioner. Cashiers and staff cannot override state drug safety rules or sell expired stock.
            </p>

            <h3 className="text-sm font-bold text-slate-800 pt-2">3. Audit Integrity</h3>
            <p>
              Every transaction, price change, and stock adjustment generates an immutable system audit event. Completed bills cannot be silently edited or deleted without supervisor audit authorization.
            </p>
          </div>
        )}

        {activeTab === 'REFUND' && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900">Medicine Return & Refund Policy</h2>
            <p className="text-slate-500 text-[11px]">Physical Pharmacy Branch Policy</p>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
              <p className="font-bold">Important Pharmacy Safety Notice:</p>
              <p className="mt-0.5">
                To guarantee medication safety and potency, temperature-sensitive cold chain drugs (Insulins, Vaccines) cannot be returned once handed over to the patient.
              </p>
            </div>

            <h3 className="text-sm font-bold text-slate-800 pt-2">1. Return Eligibility</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Returns must be submitted within <strong>7 days</strong> of invoice date at the branch where the medicine was purchased.</li>
              <li>The original printed Tax Invoice must be presented at the counter.</li>
              <li>Medicines must be in original, unopened strips or sealed manufacturer bottles with matching batch numbers.</li>
            </ul>

            <h3 className="text-sm font-bold text-slate-800 pt-2">2. Reversal and Stock Inspection</h3>
            <p>
              Returned medicines undergo pharmacist physical inspection before being accepted. Reversals are processed through the audited invoice cancellation/refund workflow, and refunds are credited via original payment mode.
            </p>
          </div>
        )}

        {activeTab === 'GRIEVANCE' && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900">Grievance & Privacy Officer Details</h2>
            <p className="text-slate-500 text-[11px]">Published under Section 5 of the Information Technology Rules and DPDP Act</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Designated Grievance Officer
                </span>
                <p className="text-sm font-bold text-slate-900">Mr. K. V. Subramanyam</p>
                <p className="text-slate-600">Head of Regulatory Compliance & Data Privacy</p>
                <div className="pt-2 border-t border-slate-200 space-y-1 text-slate-700">
                  <p><strong>Email:</strong> grievance@confidospharma.com</p>
                  <p><strong>Phone:</strong> +91 866 2554401 (Mon-Fri, 10 AM - 5 PM IST)</p>
                  <p><strong>Office:</strong> Plot 42, APIIC Tech Zone, Vijayawada, AP - 520008</p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Corporate Licensing Identity
                </span>
                <p className="text-sm font-bold text-slate-900">Confidos Healthcare & Pharmaceuticals Pvt Ltd</p>
                <div className="pt-2 border-t border-slate-200 space-y-1 text-slate-700">
                  <p><strong>CIN:</strong> U24239AP2024PTC109822</p>
                  <p><strong>Corporate GSTIN:</strong> 37AAAAA1234A1Z5</p>
                  <p><strong>State Drug Control Directorate:</strong> Andhra Pradesh</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'DSR' && (
          <div className="space-y-4 max-w-xl">
            <div>
              <h2 className="text-base font-bold text-slate-900">Data Subject Rights (DSR) Request Portal</h2>
              <p className="text-slate-500 text-[11px]">
                Submit access, correction, restriction, or erasure requests regarding your personal data.
              </p>
            </div>

            {dsrSuccess && (
              <div className="p-3 bg-pharmagreen-50 border border-pharmagreen-200 rounded-lg text-pharmagreen-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-pharmagreen-600 flex-shrink-0" />
                <span>{dsrSuccess}</span>
              </div>
            )}

            {dsrError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{dsrError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitDSR} className="space-y-3 pt-2">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Your Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Anjali Sharma"
                  value={dsrForm.requesterName}
                  onChange={(e) => setDsrForm({ ...dsrForm, requesterName: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="anjali@gmail.com"
                    value={dsrForm.requesterEmail}
                    onChange={(e) => setDsrForm({ ...dsrForm, requesterEmail: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="98480xxxxx"
                    value={dsrForm.requesterPhone}
                    onChange={(e) => setDsrForm({ ...dsrForm, requesterPhone: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Right to Exercise *</label>
                <select
                  value={dsrForm.requestType}
                  onChange={(e) => setDsrForm({ ...dsrForm, requestType: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white font-medium"
                >
                  <option value="ACCESS">Right to Access Personal Information</option>
                  <option value="CORRECTION">Right to Correction / Rectification</option>
                  <option value="DELETION">Right to Erasure (Subject to statutory GST retention)</option>
                  <option value="RESTRICTION">Grievance / Processing Restriction</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Request Details & Context *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Provide details about the counter transaction or staff account you wish to access or correct..."
                  value={dsrForm.details}
                  onChange={(e) => setDsrForm({ ...dsrForm, details: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Data Request'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
