import test from 'node:test';
import assert from 'node:assert/strict';
import { companyPolicyFolderIds } from '../src/lib/workforce/company-policy-files.ts';

const folder = (id, parent_id, name = '', system_key = null) => ({id, parent_id, name, system_key});
test('company policies include descendants but exclude customer policies and other company files', () => {
  const folders = [
    folder('company', null, 'الشركة', 'company'),
    folder('policies', 'company', 'السياسات وإجراءات العمل'),
    folder('attendance', 'policies', 'الحضور'),
    folder('archive', 'attendance', 'أرشيف'),
    folder('strategy', 'company', 'الاستراتيجية'),
    folder('clients', null, 'العملاء', 'clients'),
    folder('client-policy', 'clients', 'السياسات وإجراءات العمل'),
  ];
  assert.deepEqual(companyPolicyFolderIds(folders), ['policies', 'attendance', 'archive']);
  assert.deepEqual(companyPolicyFolderIds(folders.filter(f => f.id !== 'company')), []);
});
test('stable policy key supports a renamed company folder', () => {
  assert.deepEqual(companyPolicyFolderIds([
    folder('company', null, 'الشركة', 'company'),
    folder('policies', 'company', 'سياساتنا', 'company-policies'),
  ]), ['policies']);
});
