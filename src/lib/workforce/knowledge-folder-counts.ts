type Folder = { id: string; parent_id: string | null };
type FilePage = { data: { folder_id: string }[] | null; count: number | null; error: unknown };

// The loader uses the signed-in actor so hidden task attachments stay uncounted.
export async function knowledgeFolderCounts<T extends Folder>(
  folders: T[],
  load: (from: number, to: number) => PromiseLike<FilePage>,
) {
  const direct = new Map(folders.map((folder) => [folder.id, 0]));
  let offset = 0;
  for (;;) {
    const page = await load(offset, offset + 999);
    if (page.error) throw page.error;
    const rows = page.data || [];
    for (const row of rows) {
      if (direct.has(row.folder_id)) direct.set(row.folder_id, direct.get(row.folder_id)! + 1);
    }
    offset += rows.length;
    if (!rows.length || (page.count !== null && offset >= page.count)) break;
  }
  const parents = new Map(folders.map((folder) => [folder.id, folder.parent_id]));
  const total = new Map(direct);
  for (const folder of folders) {
    const count = direct.get(folder.id)!;
    const seen = new Set([folder.id]);
    let parent = folder.parent_id;
    while (parent && parents.has(parent) && !seen.has(parent)) {
      seen.add(parent);
      total.set(parent, total.get(parent)! + count);
      parent = parents.get(parent)!;
    }
  }
  return folders.map((folder) => ({
    ...folder,
    direct_file_count: direct.get(folder.id)!,
    file_count: total.get(folder.id)!,
  }));
}
