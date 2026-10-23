type PolicyFolder = {
  id: string;
  parent_id: string | null;
  name: string;
  system_key: string | null;
};

// Resolve the company repository, never similarly named customer/staff folders.
export function companyPolicyFolderIds(folders: PolicyFolder[]) {
  const company = folders.find((folder) => folder.system_key === "company");
  if (!company) return [];
  const ids = new Set(folders.filter((folder) =>
    folder.parent_id === company.id &&
    (folder.system_key === "company-policies" || folder.name === "السياسات وإجراءات العمل")
  ).map((folder) => folder.id));
  let added = true;
  while (added) {
    added = false;
    for (const folder of folders) {
      if (folder.parent_id && ids.has(folder.parent_id) && !ids.has(folder.id)) {
        ids.add(folder.id);
        added = true;
      }
    }
  }
  return [...ids];
}
