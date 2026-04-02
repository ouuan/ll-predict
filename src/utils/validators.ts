import { t } from '../i18n';
import type { PredictionDraftItem } from '../types/domain';

export interface ValidationIssue {
  field: string;
  message: string;
}

export function validateNickname(value: string): ValidationIssue | null {
  if (!value.trim()) {
    return { field: 'nickname', message: t('ui.validation.nicknameRequired') };
  }
  if (value.length > 50) {
    return { field: 'nickname', message: t('ui.validation.nicknameMaxLength') };
  }
  return null;
}

export function validateDescription(value: string): ValidationIssue | null {
  if (value.length > 1000) {
    return { field: 'description', message: t('ui.validation.descriptionMaxLength') };
  }
  return null;
}

export function validateTextItem(value: string): ValidationIssue | null {
  if (!value.trim()) {
    return { field: 'text', message: t('ui.validation.textItemRequired') };
  }
  if (value.length > 200) {
    return { field: 'text', message: t('ui.validation.textItemMaxLength') };
  }
  return null;
}

export function validateItemNote(value: string): ValidationIssue | null {
  if (value.length > 100) {
    return { field: 'item.note', message: t('ui.validation.itemNoteMaxLength') };
  }
  return null;
}

export function validatePredictionItems(items: PredictionDraftItem[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (items.length === 0) {
    issues.push({ field: 'items', message: t('ui.validation.atLeastOneItem') });
  }

  if (items.length > 100) {
    issues.push({ field: 'items', message: t('ui.validation.totalItemsMaxLength') });
  }

  items.forEach((item, index) => {
    if (item.type === 'song' && !item.songId) {
      issues.push({ field: `items[${index}]`, message: t('ui.validation.songItemMissingSongId') });
    }
    if (item.type === 'text') {
      const issue = validateTextItem(item.text ?? '');
      if (issue) {
        issues.push({ field: `items[${index}]`, message: issue.message });
      }
    }
    const noteIssue = validateItemNote(item.note ?? '');
    if (noteIssue) {
      issues.push({ field: `items[${index}].note`, message: noteIssue.message });
    }
  });

  return issues;
}
