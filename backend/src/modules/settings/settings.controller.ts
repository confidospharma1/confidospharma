import { Request, Response } from 'express';
import prisma from '../../database/prisma';
import { logAuditEvent } from '../../utils/audit';

const DEFAULT_SETTINGS: Record<string, { value: string; description: string }> = {
  MIN_PURCHASE_DISCOUNT_PERCENT: {
    value: '0.0',
    description: 'Minimum allowable inward purchase discount limit (percentage)',
  },
  MAX_PURCHASE_DISCOUNT_PERCENT: {
    value: '20.0',
    description: 'Maximum allowable inward purchase discount limit (customizable policy limit)',
  },
  DEFAULT_PURCHASE_DISCOUNT_PERCENT: {
    value: '15.0',
    description: 'Default discount percentage applied on inward purchase invoices (15%-20%)',
  },
  DEFAULT_CGST_RATE: {
    value: '2.5',
    description: 'Default Central GST rate (percentage)',
  },
  DEFAULT_SGST_RATE: {
    value: '2.5',
    description: 'Default State GST rate (percentage)',
  },
  DEFAULT_COMBINED_GST_RATE: {
    value: '5.0',
    description: 'Default total GST rate (CGST + SGST)',
  },
  ALLOW_MANUAL_DISCOUNT: {
    value: 'true',
    description: 'Allow cashiers to apply manual discount during POS billing',
  },
  MAX_DISCOUNT_PERCENT: {
    value: '10.0',
    description: 'Maximum allowable discount percentage at POS billing',
  },
  NEAR_EXPIRY_THRESHOLD_DAYS: {
    value: '60',
    description: 'Alert window in days for flagging near-expiry stock batches',
  },
  COMPANY_NAME: {
    value: 'Confidos Pharma Ltd.',
    description: 'Primary corporate entity name',
  },
};

export const getSettings = async (req: Request, res: Response) => {
  try {
    const existing = await prisma.systemSetting.findMany({
      orderBy: { key: 'asc' },
    });

    const settingsMap: Record<string, string> = {};
    for (const s of existing) {
      settingsMap[s.key] = s.value;
    }

    // Auto-seed missing defaults if any are absent
    for (const [key, meta] of Object.entries(DEFAULT_SETTINGS)) {
      if (settingsMap[key] === undefined) {
        await prisma.systemSetting.create({
          data: {
            key,
            value: meta.value,
            description: meta.description,
          },
        });
        settingsMap[key] = meta.value;
      }
    }

    return res.json({
      settings: settingsMap,
      metadata: DEFAULT_SETTINGS,
    });
  } catch (error: any) {
    console.error('Failed to get settings:', error);
    return res.status(500).json({ message: 'Failed to retrieve system settings' });
  }
};

export const updateSettings = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Billing users cannot modify system configuration' });
    }

    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ message: 'Invalid settings payload: expected settings object' });
    }

    const updatedKeys: string[] = [];

    // Validation for financial and tax defaults
    if (settings.MIN_PURCHASE_DISCOUNT_PERCENT !== undefined) {
      const minDisc = parseFloat(settings.MIN_PURCHASE_DISCOUNT_PERCENT);
      if (isNaN(minDisc) || minDisc < 0 || minDisc > 100) {
        return res.status(400).json({ message: 'Minimum purchase discount must be between 0% and 100%' });
      }
    }

    if (settings.MAX_PURCHASE_DISCOUNT_PERCENT !== undefined) {
      const maxDisc = parseFloat(settings.MAX_PURCHASE_DISCOUNT_PERCENT);
      if (isNaN(maxDisc) || maxDisc < 0 || maxDisc > 100) {
        return res.status(400).json({ message: 'Maximum purchase discount limit must be between 0% and 100%' });
      }
    }

    if (settings.DEFAULT_PURCHASE_DISCOUNT_PERCENT !== undefined) {
      const disc = parseFloat(settings.DEFAULT_PURCHASE_DISCOUNT_PERCENT);
      if (isNaN(disc) || disc < 0 || disc > 100) {
        return res.status(400).json({ message: 'Default purchase discount must be between 0% and 100%' });
      }
    }

    if (settings.DEFAULT_CGST_RATE !== undefined || settings.DEFAULT_SGST_RATE !== undefined) {
      const cgst = settings.DEFAULT_CGST_RATE !== undefined ? parseFloat(settings.DEFAULT_CGST_RATE) : undefined;
      const sgst = settings.DEFAULT_SGST_RATE !== undefined ? parseFloat(settings.DEFAULT_SGST_RATE) : undefined;
      if (cgst !== undefined && (isNaN(cgst) || cgst < 0 || cgst > 50)) {
        return res.status(400).json({ message: 'Default CGST rate must be a valid percentage between 0% and 50%' });
      }
      if (sgst !== undefined && (isNaN(sgst) || sgst < 0 || sgst > 50)) {
        return res.status(400).json({ message: 'Default SGST rate must be a valid percentage between 0% and 50%' });
      }
    }

    // Automatically recalculate COMBINED_GST_RATE if CGST or SGST is updated
    let calculatedCombined: string | null = null;
    if (settings.DEFAULT_CGST_RATE !== undefined || settings.DEFAULT_SGST_RATE !== undefined) {
      const existingCGST = settings.DEFAULT_CGST_RATE !== undefined
        ? parseFloat(settings.DEFAULT_CGST_RATE)
        : parseFloat((await prisma.systemSetting.findUnique({ where: { key: 'DEFAULT_CGST_RATE' } }))?.value || '2.5');
      const existingSGST = settings.DEFAULT_SGST_RATE !== undefined
        ? parseFloat(settings.DEFAULT_SGST_RATE)
        : parseFloat((await prisma.systemSetting.findUnique({ where: { key: 'DEFAULT_SGST_RATE' } }))?.value || '2.5');
      calculatedCombined = (existingCGST + existingSGST).toFixed(2).replace(/\.00$/, '');
    }

    for (const [key, value] of Object.entries(settings)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        const strVal = String(value);
        await prisma.systemSetting.upsert({
          where: { key },
          update: { value: strVal },
          create: {
            key,
            value: strVal,
            description: DEFAULT_SETTINGS[key]?.description || 'Custom configuration',
          },
        });
        updatedKeys.push(key);
      }
    }

    if (calculatedCombined !== null) {
      await prisma.systemSetting.upsert({
        where: { key: 'DEFAULT_COMBINED_GST_RATE' },
        update: { value: calculatedCombined },
        create: {
          key: 'DEFAULT_COMBINED_GST_RATE',
          value: calculatedCombined,
          description: DEFAULT_SETTINGS.DEFAULT_COMBINED_GST_RATE.description,
        },
      });
      updatedKeys.push('DEFAULT_COMBINED_GST_RATE');
    }

    await logAuditEvent({
      userId: req.user.id,
      action: 'SETTING_UPDATE',
      targetEntity: 'SYSTEM_SETTINGS',
      entityId: 'SYSTEM',
      details: { updatedKeys, changedValues: settings },
      req,
    });

    const allSettings = await prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
    const resultMap: Record<string, string> = {};
    for (const s of allSettings) {
      resultMap[s.key] = s.value;
    }

    return res.json({
      message: 'System settings updated successfully',
      settings: resultMap,
    });
  } catch (error: any) {
    console.error('Failed to update settings:', error);
    return res.status(500).json({ message: error.message || 'Failed to update system settings' });
  }
};
