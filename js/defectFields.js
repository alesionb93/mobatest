import { supabase } from './supabaseClient.js';
import { escapeHtml } from './ui.js';

export async function fetchFailureReasons() {
  const { data } = await supabase.from('failure_reasons').select('*').eq('is_active', true).order('label');
  return data || [];
}

export async function fetchContacts(kind) {
  const { data } = await supabase.from('contacts').select('*').eq('kind', kind).eq('is_active', true).order('name');
  return data || [];
}

export function failureReasonOptionsHtml(reasons, selectedId) {
  return `<option value="">— Selecione —</option>` +
    reasons.map((r) => `<option value="${r.id}" ${r.id === selectedId ? 'selected' : ''}>${escapeHtml(r.label)}</option>`).join('');
}

export function contactOptionsHtml(contacts, selectedId) {
  return `<option value="">— Sem responsável —</option>` +
    contacts.map((c) => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
}
