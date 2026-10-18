import {
  apiError,
  assertMutation,
  createServiceRoleClient,
  requireAdmin,
  workforceActor,
} from "@/lib/workforce/server";
import {
  employeeFields,
  textField,
  uuid,
  WorkforceError,
} from "@/lib/workforce/validation";

export async function GET(request: Request) {
  try {
    const actor = await workforceActor();
    requireAdmin(actor);
    const params = new URL(request.url).searchParams;
    const page = Math.max(
      1,
      Math.min(10000, Math.floor(Number(params.get("page")) || 1)),
    );
    const search = (params.get("q") ?? "")
      .replace(/[%_,()"\\]/g, "")
      .slice(0, 100);
    const status = params.get("status");
    const sort = params.get("sort");
    const sortColumn =
      sort === "name"
        ? "full_name"
        : sort === "start"
          ? "start_date"
          : "created_at";
    let query = actor.db
      .from("wf_employees")
      .select("*", { count: "exact" })
      .order(sortColumn, { ascending: sort === "name" })
      .order("id")
      .range((page - 1) * 20, page * 20 - 1);
    if (search)
      query = query.or(
        `full_name.ilike.%${search}%,job_title.ilike.%${search}%,email.ilike.%${search}%`,
      );
    if (status && ["active", "suspended", "ended"].includes(status))
      query = query.eq("status", status);
    const department = params.get("department");
    if (department) query = query.eq("department_id", uuid(department));
    const [result, departments] = await Promise.all([
      query,
      actor.db.from("wf_departments").select("*").order("name"),
    ]);
    if (result.error || departments.error)
      throw result.error || departments.error;
    return Response.json(
      {
        employees: result.data,
        count: result.count,
        departments: departments.data,
        page,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertMutation(request);
    const actor = await workforceActor();
    requireAdmin(actor);
    const body = await request.json();
    const fields = employeeFields(body);
    const email = textField(
      body.email,
      "البريد الإلكتروني",
      5,
      254,
    ).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new WorkforceError("البريد الإلكتروني غير صحيح");
    const password = textField(body.password, "كلمة المرور الأولية", 12, 128);
    const id = uuid(body.request_key);
    const service = await createServiceRoleClient();
    const { data: existing } = await service
      .from("wf_employees")
      .select("id,email")
      .eq("id", id)
      .maybeSingle();
    if (existing) {
      if (existing.email !== email)
        throw new WorkforceError("مفتاح الطلب مستخدم لعملية أخرى", 409);
      return Response.json({ id: existing.id });
    }
    if (fields.department_id) {
      const { data } = await actor.db
        .from("wf_departments")
        .select("id")
        .eq("id", fields.department_id)
        .maybeSingle();
      if (!data) throw new WorkforceError("القسم غير متاح");
    }
    // Creates only a new account. Never converts an existing client or sends email implicitly.
    const { data: created, error: createError } =
      await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fields.full_name },
      });
    if (createError || !created.user)
      throw new WorkforceError(
        "تعذر إنشاء الحساب؛ قد يكون البريد مستخدمًا أو كلمة المرور غير مقبولة",
        409,
      );
    const userId = created.user.id;
    try {
      const { error: profileError } = await service
        .from("profiles")
        .upsert({ id: userId, full_name: fields.full_name, role: "employee" });
      if (profileError) throw profileError;
      const { error } = await service
        .from("wf_employees")
        .insert({
          id,
          user_id: userId,
          email,
          ...fields,
          created_by: actor.user.id,
          updated_by: actor.user.id,
        });
      if (error) throw error;
    } catch (error) {
      // Compensation applies only to this newly-created account, never an existing user.
      await service.auth.admin.deleteUser(userId);
      throw error;
    }
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
