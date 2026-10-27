import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { AuditEvent } from '../types';
import { History, Search, Shield, Filter, Eye, X } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { FilterButton } from '../components/FilterButton';
import { FilterField, FilterSelect, FilterInput } from '../components/FilterControls';

export const AuditLogsPage: React.FC = () => {
  const { isSuperAdmin, selectedBranchId, branches } = useAuth();
  const [logs, setLogs] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [targetEntityFilter, setTargetEntityFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  const activeFilterCount = [
    actionFilter,
    targetEntityFilter,
    branchFilter,
    startDate,
    endDate,
  ].filter(Boolean).length;

  const resetFilters = () => {
    setActionFilter('');
    setTargetEntityFilter('');
    setBranchFilter('');
    setStartDate('');
    setEndDate('');
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getAuditLogs({
        branchId: isSuperAdmin ? (branchFilter || undefined) : selectedBranchId,
        action: actionFilter || undefined,
        targetEntity: targetEntityFilter || undefined,
      });
      setLogs(data.events || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [actionFilter, targetEntityFilter, branchFilter, selectedBranchId]);

  const getActionVariant = (action: string) => {
    if (action.includes('FAIL') || action.includes('CANCEL')) return 'danger';
    if (action.includes('ADJUST') || action.includes('UPDATE')) return 'warning';
    if (action.includes('CREATE') || action.includes('RECEIPT') || action.includes('COMMITTED')) return 'success';
    return 'neutral';
  };

  const filteredLogs = logs.filter((log) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const match =
        log.action.toLowerCase().includes(q) ||
        log.targetEntity.toLowerCase().includes(q) ||
        (log.details && log.details.toLowerCase().includes(q)) ||
        (log.ipAddress && log.ipAddress.toLowerCase().includes(q)) ||
        (log.branch?.name && log.branch.name.toLowerCase().includes(q));
      if (!match) return false;
    }

    if (startDate) {
      const logDate = new Date(log.createdAt).toISOString().split('T')[0];
      if (logDate < startDate) return false;
    }

    if (endDate) {
      const logDate = new Date(log.createdAt).toISOString().split('T')[0];
      if (logDate > endDate) return false;
    }

    return true;
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto overflow-y-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Immutable Audit Trail</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Append-only security, authentication, and inventory transaction audit log (PRD Section 13.4).
          </p>
        </div>
      </div>

      {/* Toolbar: Search & Filter Button */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search audit trail by entity, details, IP address..."
              className="w-full pl-10 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-medium"
            />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <FilterButton
              activeCount={activeFilterCount}
              onReset={resetFilters}
              title="Filter Audit Records"
              buttonLabel="Filter Audit Trail"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FilterField label="Audit Action" className="sm:col-span-2">
                  <FilterSelect
                    value={actionFilter}
                    onChange={(e) => setActionFilter(e.target.value)}
                    options={[
                      { label: 'All Audit Actions', value: '' },
                      { label: 'LOGIN_SUCCESS', value: 'LOGIN_SUCCESS' },
                      { label: 'LOGIN_FAILED', value: 'LOGIN_FAILED' },
                      { label: 'SALE_CREATE', value: 'SALE_CREATE' },
                      { label: 'SALE_CANCEL', value: 'SALE_CANCEL' },
                      { label: 'STOCK_RECEIPT', value: 'STOCK_RECEIPT' },
                      { label: 'STOCK_ADJUST', value: 'STOCK_ADJUST' },
                      { label: 'BULK_IMPORT_COMMITTED', value: 'BULK_IMPORT_COMMITTED' },
                      { label: 'BRANCH_TRANSFER_DISPATCH', value: 'BRANCH_TRANSFER_DISPATCH' },
                      { label: 'BRANCH_TRANSFER_RECEIVE', value: 'BRANCH_TRANSFER_RECEIVE' },
                    ]}
                  />
                </FilterField>

                <FilterField label="Target Entity">
                  <FilterSelect
                    value={targetEntityFilter}
                    onChange={(e) => setTargetEntityFilter(e.target.value)}
                    options={[
                      { label: 'All Target Entities', value: '' },
                      { label: 'Sales Invoices (SALES_INVOICE)', value: 'SALES_INVOICE' },
                      { label: 'Stock Batches (STOCK_BATCH)', value: 'STOCK_BATCH' },
                      { label: 'Purchase Invoices (PURCHASE_INVOICE)', value: 'PURCHASE_INVOICE' },
                      { label: 'Branch Transfers (BRANCH_TRANSFER)', value: 'BRANCH_TRANSFER' },
                      { label: 'Medicines (MEDICINE_PRODUCT)', value: 'MEDICINE_PRODUCT' },
                      { label: 'Staff Accounts (USER)', value: 'USER' },
                      { label: 'Branches (BRANCH)', value: 'BRANCH' },
                    ]}
                  />
                </FilterField>

                {isSuperAdmin && (
                  <FilterField label="Pharmacy Branch">
                    <FilterSelect
                      value={branchFilter}
                      onChange={(e) => setBranchFilter(e.target.value)}
                      options={[
                        { label: 'All Branches (Enterprise)', value: '' },
                        ...branches.map((b) => ({ label: `${b.name} (${b.code})`, value: b.id })),
                      ]}
                    />
                  </FilterField>
                )}

                <FilterField label="From Date">
                  <FilterInput
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </FilterField>

                <FilterField label="To Date">
                  <FilterInput
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </FilterField>
              </div>
            </FilterButton>
          </div>
        </div>

        {/* Active Filter Badges */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
            <span className="text-[11px] font-semibold text-slate-500 mr-1">Active Filters:</span>
            {actionFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                Action: {actionFilter}
                <button type="button" onClick={() => setActionFilter('')} className="hover:text-brand-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {targetEntityFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                Entity: {targetEntityFilter}
                <button type="button" onClick={() => setTargetEntityFilter('')} className="hover:text-brand-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {branchFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                Branch: {branches.find((b) => b.id === branchFilter)?.name || branchFilter}
                <button type="button" onClick={() => setBranchFilter('')} className="hover:text-brand-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {(startDate || endDate) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                Date: {startDate || 'Start'} to {endDate || 'Now'}
                <button
                  type="button"
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="hover:text-brand-900"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={resetFilters}
              className="text-[11px] text-slate-500 hover:text-rose-600 font-semibold underline ml-1"
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-3">Action</th>
                <th className="py-3 px-3">Target Entity</th>
                <th className="py-3 px-3">Branch</th>
                <th className="py-3 px-4">Audit Details</th>
                <th className="py-3 px-3 text-center">IP Address</th>
                <th className="py-3 px-3 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Loading audit trail...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No audit records recorded yet.
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <p className="text-sm font-bold text-slate-700">No audit records match your filter criteria.</p>
                    <p className="text-xs text-slate-400 mt-1">Try resetting the filter options or adjusting your search term.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        resetFilters();
                      }}
                      className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold transition-colors"
                    >
                      Clear Filters & Search
                    </button>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-3">
                      <Badge variant={getActionVariant(log.action)} size="sm">
                        {log.action}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-slate-800">{log.targetEntity}</td>
                    <td className="py-3 px-3 text-slate-700">{log.branch?.name || 'Head Office'}</td>
                    <td className="py-3 px-4 text-slate-600 truncate max-w-xs font-mono text-[11px]">
                      {log.details || '-'}
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-slate-500 text-[11px]">
                      {log.ipAddress || '127.0.0.1'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => setSelectedEvent(log)}
                        className="p-1 text-slate-400 hover:text-brand-700 transition-colors"
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspect Modal */}
      <Modal
        isOpen={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        title="Audit Event Details"
        maxWidth="lg"
      >
        {selectedEvent && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 font-mono">
              <div>
                <span className="text-slate-500 block text-[11px]">Event Action:</span>
                <span className="font-bold text-slate-900">{selectedEvent.action}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Timestamp:</span>
                <span className="text-slate-900">{new Date(selectedEvent.createdAt).toISOString()}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Actor User ID:</span>
                <span className="text-slate-900">{selectedEvent.userId}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Entity ID:</span>
                <span className="text-slate-900">{selectedEvent.entityId || 'N/A'}</span>
              </div>
            </div>

            <div>
              <span className="text-xs font-bold text-slate-700 block mb-1">Raw Payload Details:</span>
              <pre className="p-3 bg-slate-950 text-emerald-400 rounded-lg font-mono text-xs overflow-x-auto leading-relaxed">
                {JSON.stringify(JSON.parse(selectedEvent.details || '{}'), null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
