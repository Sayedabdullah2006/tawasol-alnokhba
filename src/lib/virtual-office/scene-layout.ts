import {
  appearanceForStaff,
  type OfficeStaff,
  type OfficePersonId,
} from "./domain";
import {
  OFFICE_DEPARTMENTS,
  agentsForDepartment,
  departmentAppearance,
  type DepartmentId,
} from "./departments";
/** Real staff add desks; they never replace the six permanent virtual colleagues. */
export function officeActors(staff: OfficeStaff[], department: DepartmentId) {
  return [
    ...agentsForDepartment(department).map((agent) => ({
      ...agent,
      id: agent.id as OfficePersonId,
      name: agent.firstName,
      fullName: agent.firstName,
      role: agent.name,
      human: false,
      appearance: departmentAppearance(department, agent.id),
    })),
    ...staff.map((person, index) => {
      const row = Math.floor(index / 4),
        count = Math.min(4, staff.length - row * 4);
      return {
        id: `staff:${person.id}` as OfficePersonId,
        name: person.name.trim().split(/\s+/)[0] || person.name,
        fullName: person.name,
        role: person.jobTitle || "فريق تواصل النخبة",
        color: "#567895",
        position: [
          ((index % 4) - (count - 1) / 2) * 4.5,
          9 + row * 4,
        ] as readonly [number, number],
        human: true,
        appearance: appearanceForStaff(person.appearance),
      };
    }),
  ];
}
export function companyRooms(staff: OfficeStaff[], columns: 2 | 4 = 4) {
  const maxRows = Math.max(
    3,
    ...OFFICE_DEPARTMENTS.map((d) =>
      Math.ceil(
        (6 + staff.filter((p) => p.officeDepartment === d.id).length) / 3,
      ),
    ),
  );
  const depth = maxRows * 4 + 6;
  const rows = Math.ceil(OFFICE_DEPARTMENTS.length / columns);
  return OFFICE_DEPARTMENTS.map((department, index) => ({
    department,
    x: ((index % columns) - (columns - 1) / 2) * 20,
    z: (Math.floor(index / columns) - (rows - 1) / 2) * (depth + 8),
    depth,
    rotation: Math.floor(index / columns) % 2 === 0 ? 0 : Math.PI,
    members: officeActors(
      staff.filter((p) => p.officeDepartment === department.id),
      department.id,
    ).map((person, seat) => ({
      ...person,
      key: `${department.id}:${person.id}`,
      position: [
        ((seat % 3) - 1) * 5,
        -depth / 2 + 4 + Math.floor(seat / 3) * 4,
      ] as readonly [number, number],
    })),
  }));
}
