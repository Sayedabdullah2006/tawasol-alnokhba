import type { SupabaseClient } from '@supabase/supabase-js';
import type { SettlementQuote } from './final-settlement';
import { WorkforceError } from './validation';

type SettlementRow = {
  id: string; employee_id: string; status: string; snapshot: SettlementQuote;
  approved_at: string; paid_at: string | null; payment_reference: string | null;
};
type FinancialSummary = Pick<SettlementQuote,
  'ends_on' | 'gross' | 'leave_amount' | 'eos_amount' | 'expenses' | 'insurance' |
  'attendance' | 'other' | 'already_paid' | 'recovered_amount' | 'additional_credits' |
  'additional_debits' | 'net_due'>;
export type EmployeeFinalSettlement = FinancialSummary & {
  id: string; status: 'approved' | 'paid'; approved_at: string;
  paid_at: string | null; payment_reference: string | null; leave_days: number;
  months: {month: string; due: string; paid: string}[];
  adjustments: {kind: 'credit' | 'debit' | 'recovery'; title: string; amount: string}[];
};

// Only the frozen, manager-approved snapshot is published. Never calculate a
// fresh quote here: an employee read must not change payroll or reveal a draft.
export function employeeSettlement(row: SettlementRow, employeeId: string): EmployeeFinalSettlement | null {
  if (row.employee_id !== employeeId || !['approved', 'paid'].includes(row.status)) return null;
  const q = row.snapshot;
  if (q.employee_id !== employeeId) throw new WorkforceError('تعذر قراءة التسوية المعتمدة', 503);
  return {
    id: row.id, status: row.status as 'approved' | 'paid', approved_at: row.approved_at,
    paid_at: row.status === 'paid' ? row.paid_at : null,
    payment_reference: row.status === 'paid' ? row.payment_reference : null,
    ends_on: q.ends_on, gross: q.gross, leave_amount: q.leave_amount, eos_amount: q.eos_amount,
    expenses: q.expenses, insurance: q.insurance, attendance: q.attendance, other: q.other,
    already_paid: q.already_paid, recovered_amount: q.recovered_amount ?? '0.00',
    additional_credits: q.additional_credits, additional_debits: q.additional_debits, net_due: q.net_due,
    leave_days: q.leave.available,
    months: q.sources.map(s => ({month: s.month, due: s.due, paid: s.paid})),
    adjustments: q.inputs.adjustments.map(a => ({kind: a.kind, title: a.title, amount: a.amount})),
  };
}

export async function ownFinalSettlements(
  actor: {role: string; employee: {id: string} | null}, db: SupabaseClient,
): Promise<EmployeeFinalSettlement[]> {
  // Use the authenticated employee, never a query-string ID or delegated team access.
  if (actor.role !== 'employee' || !actor.employee) throw new WorkforceError('الملف غير متاح', 403);
  const employeeId = actor.employee.id;
  const result = await db.from('wf_final_settlements')
    .select('id,employee_id,status,snapshot,approved_at,paid_at,payment_reference')
    .eq('employee_id', employeeId).in('status', ['approved', 'paid'])
    .order('approved_at', {ascending: false});
  if (result.error) throw result.error;
  return ((result.data ?? []) as SettlementRow[])
    .map(row => employeeSettlement(row, employeeId)).filter(row => row !== null);
}
