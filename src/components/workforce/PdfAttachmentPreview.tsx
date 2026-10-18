"use client";
import { useEffect, useRef, useState } from "react";
import type {
  PDFDocumentProxy,
  PDFDocumentLoadingTask,
  RenderTask,
} from "pdfjs-dist";
import Button from "@/components/ui/Button";
import { Notice } from "./shared";

/** Render pixels and text only; never execute document scripts or external links. */
export default function PdfAttachmentPreview({ url }: { url: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState(1);
  const [error, setError] = useState(""),
    [rendering, setRendering] = useState(false),
    [text, setText] = useState("");
  const [width, setWidth] = useState(550),
    [retry, setRetry] = useState(0);
  const container = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const value = entries[0]?.contentRect.width;
      if (value) setWidth(value);
    });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let disposed = false,
      task: PDFDocumentLoadingTask | undefined;
    (async () => {
      try {
        const lib = await import("pdfjs-dist");
        if (disposed) return;
        const assets = `/vendor/pdfjs/${lib.version}`;
        lib.GlobalWorkerOptions.workerSrc = `${assets}/pdf.worker.min.mjs`;
        task = lib.getDocument({
          url,
          withCredentials: true,
          disableRange: true,
          disableStream: true,
          cMapUrl: `${assets}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${assets}/standard_fonts/`,
          wasmUrl: `${assets}/wasm/`,
          iccUrl: `${assets}/iccs/`,
        });
        const doc = await task.promise;
        if (disposed) {
          await task.destroy();
          return;
        }
        setPdf(doc);
        setPage(1);
        setError("");
      } catch {
        if (!disposed)
          setError(
            "تعذرت معاينة PDF. تحقق من جلسة الدخول أو نزّل الملف لفتحه. الملفات المحمية بكلمة مرور تُفتح بعد تنزيلها.",
          );
      }
    })();
    return () => {
      disposed = true;
      if (task) void task.destroy().catch(() => {});
    };
  }, [url, retry]);
  useEffect(() => {
    if (!pdf) return;
    let disposed = false,
      render: RenderTask | undefined;
    (async () => {
      try {
        setRendering(true);
        const p = await pdf.getPage(page);
        if (disposed || !canvas.current) return;
        const base = p.getViewport({ scale: 1 }),
          scale = Math.min(
            (width / base.width) * zoom,
            Math.sqrt(8000000 / (base.width * base.height)),
          );
        const viewport = p.getViewport({ scale }),
          ratio = Math.min(window.devicePixelRatio || 1, 2);
        const target = canvas.current;
        target.width = Math.ceil(viewport.width * ratio);
        target.height = Math.ceil(viewport.height * ratio);
        target.style.width = `${viewport.width}px`;
        target.style.height = `${viewport.height}px`;
        render = p.render({
          canvas: target,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        await render.promise;
        const content = await p.getTextContent();
        if (!disposed) {
          setText(
            content.items
              .map((item) => ("str" in item ? item.str : ""))
              .join(" "),
          );
          setError("");
        }
      } catch (e) {
        if (!disposed && (e as Error).name !== "RenderingCancelledException")
          setError("تعذر عرض الصفحة. يمكنك تنزيل الملف الأصلي.");
      } finally {
        if (!disposed) setRendering(false);
      }
    })();
    return () => {
      disposed = true;
      render?.cancel();
    };
  }, [pdf, page, zoom, width]);
  return (
    <div className="space-y-3">
      <Notice message={error} error />
      {!pdf && !error && <p role="status">جارٍ تحميل معاينة PDF…</p>}
      {error && !pdf && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setError("");
            setRetry((n) => n + 1);
          }}
        >
          إعادة محاولة المعاينة
        </Button>
      )}
      {pdf && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={rendering || page <= 1}
            onClick={() => setPage((n) => n - 1)}
          >
            الصفحة السابقة
          </Button>
          <span>
            صفحة {page} من {pdf.numPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={rendering || page >= pdf.numPages}
            onClick={() => setPage((n) => n + 1)}
          >
            الصفحة التالية
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={rendering || zoom >= 2}
            onClick={() => setZoom((n) => Math.min(2, n + 0.25))}
          >
            تكبير
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={rendering || zoom <= 0.5}
            onClick={() => setZoom((n) => Math.max(0.5, n - 0.25))}
          >
            تصغير
          </Button>
        </div>
      )}
      {rendering && <p role="status">جارٍ رسم الصفحة…</p>}
      <div
        ref={container}
        className="max-h-[60dvh] min-w-0 overflow-auto rounded-xl border bg-slate-100"
        dir="ltr"
      >
        <canvas
          ref={canvas}
          aria-label={`معاينة صفحة PDF رقم ${page}`}
          className="mx-auto bg-white"
          hidden={!pdf}
        />
      </div>
      <p className="sr-only">{text}</p>
    </div>
  );
}
