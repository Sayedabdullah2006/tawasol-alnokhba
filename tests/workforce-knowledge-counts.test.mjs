import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeFolderCounts } from '../src/lib/workforce/knowledge-folder-counts.ts';

const folders = [
  { id: 'company', parent_id: null, name: 'الشركة' },
  { id: 'guides', parent_id: 'company' },
  { id: 'nested', parent_id: 'guides' },
  { id: 'empty', parent_id: 'company' },
  { id: 'clients', parent_id: null },
];

test('counts direct files and all descendants without crossing sibling roots', async () => {
  const rows = ['company', 'guides', 'nested', 'nested', 'clients'].map(folder_id => ({ folder_id }));
  const result = await knowledgeFolderCounts(folders, async () => ({ data: rows, count: rows.length, error: null }));
  assert.deepEqual(result.map(f => [f.id, f.direct_file_count, f.file_count]), [
    ['company', 1, 4], ['guides', 1, 3], ['nested', 2, 2], ['empty', 0, 0], ['clients', 1, 1],
  ]);
  assert.equal(result[0].name, 'الشركة');
});

test('counts beyond one API page even when the server caps the page size', async () => {
  const rows = Array.from({ length: 1205 }, () => ({ folder_id: 'nested' }));
  let calls = 0;
  const result = await knowledgeFolderCounts(folders, async (from, to) => {
    calls++;
    assert.equal(to, from + 999);
    return { data: rows.slice(from, from + 500), count: rows.length, error: null };
  });
  assert.equal(calls, 3);
  assert.equal(result[0].file_count, 1205);
});

test('refresh reflects moves and removals, and propagates read failures', async () => {
  const load = async folder_id => knowledgeFolderCounts(folders, async () => ({ data: folder_id ? [{folder_id}] : [], count: folder_id ? 1 : 0, error: null }));
  assert.equal((await load('nested'))[0].file_count, 1);
  assert.equal((await load('clients'))[0].file_count, 0);
  assert.equal((await load(null))[0].file_count, 0);
  await assert.rejects(knowledgeFolderCounts(folders, async () => ({ data: null, count: null, error: new Error('read failed') })), /read failed/);
});
