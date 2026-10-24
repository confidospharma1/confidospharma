import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { AuditEvent } from '../types';
import { History, Search, Shield, Filter, Eye } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';

export const AuditLogsPage: React.FC = () => {
  const { isSuperAdmin, selectedBranchId } = useAuth();
  const [logs, setLogs] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getAuditLogs({
        branchId: isSuperAdmin ? undefined : selectedBranchId,
        action: actionFilter || undefined,
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
  }, [actionFilter, selectedBranchId]);

  const getActionVariant = (action: string) => {
    if (action.includes('FAIL') || action.includes('CANCEL')) return 'danger';
    if (action.includes('ADJUST') || action.includes('UPDATE')) return 'warning';
    if (action.includes('CREATE') || action.includes('RECEIPT') || action.includes('COMMITTED')) return 'success';
    return 'neutral';
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto overflow-y-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Immutable Audit Trail</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Append-only security, authentication, and inventory transaction audit log (PRD Section 13.4).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-emerald-500 font-medium"
          >
            <option value="">All Audit Actions</option>
            <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
            <option value="LOGIN_FAILED">LOGIN_FAILED</option>
            <option value="SALE_CREATE">SALE_CREATE</option>
            <option value="SALE_CANCEL">SALE_CANCEL</option>
            <option value="STOCK_RECEIPT">STOCK_RECEIPT</option>
            <option value="STOCK_ADJUST">STOCK_ADJUST</option>
            <option value="BULK_IMPORT_COMMITTED">BULK_IMPORT_COMMITTED</option>
            <option value="BRANCH_TRANSFER_DISPATCH">BRANCH_TRANSFER_DISPATCH</option>
            <option value="BRANCH_TRANSFER_RECEIVE">BRANCH_TRANSFER_RECEIVE</option>
          </select>
        </div>
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
                    No audit records found matching criteria.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
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
                        className="p-1 text-slate-400 hover:text-emerald-700 transition-colors"
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
