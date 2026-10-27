import React from 'react';
import { Modal } from './Modal';
import { ShieldAlert } from 'lucide-react';

interface PermissionDeniedModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
}

export const PermissionDeniedModal: React.FC<PermissionDeniedModalProps> = ({
  isOpen,
  onClose,
  title = 'Super Admin Authorization Required',
  message = 'You do not have permission to modify this record. Please contact the Super Admin for assistance.',
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="sm">
      <div className="p-4 space-y-4 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6 text-amber-600" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-sm font-bold text-slate-900">Restricted Action</h3>
          <p className="text-xs text-slate-600 leading-relaxed">{message}</p>
        </div>
        <div className="pt-2 border-t border-slate-100 flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
          >
            Understood
          </button>
        </div>
      </div>
    </Modal>
  );
};
