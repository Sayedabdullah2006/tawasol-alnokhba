import Link from "next/link";
export default function Page() {
  return (
    <div className="mx-auto my-12 max-w-xl rounded-2xl border border-border bg-white p-8 text-center">
      <h1 className="text-2xl font-bold">الملف الوظيفي غير متاح</h1>
      <p className="my-5 text-sm leading-8 text-muted">
        قد يكون الحساب غير مخصص للموظفين أو تم تعليق الوصول إليه. تواصل مع مدير
        النظام لمراجعة حالته.
      </p>
      <Link href="/auth/login" className="font-bold text-green underline">
        العودة إلى تسجيل الدخول
      </Link>
    </div>
  );
}
