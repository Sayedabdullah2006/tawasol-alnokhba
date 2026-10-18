import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import QRCode from "qrcode";
import { PDFDocument } from "pdf-lib";
import { cardPublicUrl, type CardSnapshot } from "./business-card";

const W = 1004, H = 650;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
let logo: Promise<string> | undefined;
// resvg shapes Arabic correctly but uses physical SVG anchoring, so anchor its
// right edge explicitly instead of relying on CSS direction for text alignment.
const text = (s: string, x: number, y: number, size: number, color = "#102b57", rtl = true, weight = 400) => `<text x="${x}" y="${y}" font-family="Noto Sans Arabic" font-size="${size}" font-weight="${weight}" fill="${color}" ${rtl ? 'text-anchor="end"' : ''}>${esc(s)}</text>`;
export async function renderCard(snapshot: CardSnapshot, slug: string, side: "front" | "back", draft = false) {
  logo ??= readFile(path.join(process.cwd(), "public/logo.png")).then(b => `data:image/png;base64,${b.toString("base64")}`);
  const logoUrl = await logo;
  const qr = await QRCode.toDataURL(cardPublicUrl(slug), { width: 340, margin: 4, errorCorrectionLevel: "M", color: { dark: "#102b57", light: "#ffffff" } });
  const c = snapshot.company;
  const site = c.website.replace(/^https:\/\//, "").replace(/\/$/, "");
  const nameSize = snapshot.name.length > 45 ? 27 : snapshot.name.length > 30 ? 36 : 45;
  const titleSize = snapshot.title.length > 60 ? 18 : snapshot.title.length > 40 ? 24 : 29;
  const contact = [snapshot.email, snapshot.phone].filter(Boolean);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="1004" height="650" fill="${side === "front" ? "#fff" : "#102b57"}"/>
  ${side === "front" ? `
    <rect x="969" width="35" height="650" fill="#102b57"/><rect x="957" width="5" height="650" fill="#b99d59"/>
    <image x="755" y="45" width="145" height="161" href="${logoUrl}"/>
    ${text(c.name, 690, 115, 33, "#102b57", true, 700)}${text(c.tagline, 690, 160, 21, "#8b7444")}
    <path d="M65 237 H900" stroke="#e3e8ef" stroke-width="2"/>
    ${text(snapshot.name, 900, 322, nameSize, "#102b57", true, 700)}
    ${text(snapshot.title, 900, 385, titleSize, "#8b7444")}
    ${contact.map((s, i) => text(s, 65, 465 + i * 43, s.length > 45 ? 19 : 24, "#334155", false)).join("")}
    ${c.address ? text(c.address, 900, 546, c.address.length > 100 ? 10 : c.address.length > 65 ? 13 : 17, "#64748b") : ""}
    <rect x="65" y="566" width="835" height="2" fill="#b99d59"/>
    ${text(site, 65, 611, site.length > 55 ? 15 : 23, "#102b57", false)}${text("ADVERTISING & MARKETING", 540, 611, 17, "#64748b", false)}
  ` : `
    <circle cx="1010" cy="-95" r="405" fill="#173961"/><circle cx="1080" cy="-175" r="430" fill="none" stroke="#b99d59" stroke-opacity=".35" stroke-width="2"/>
    <rect x="65" y="157" width="340" height="340" rx="13" fill="#fff"/><image x="65" y="157" width="340" height="340" href="${qr}"/>
    ${text(c.name, 925, 180, 34, "#e2c47b", true, 700)}
    ${text("لنبقَ على تواصل", 925, 272, 43, "#ffffff", true, 700)}
    ${text("روابط التواصل المهني", 925, 332, 24, "#d7e2f1")}
    ${text(site, 470, 410, site.length > 40 ? 16 : 23, "#ffffff", false)}
    ${[c.email, c.phone].filter(Boolean).slice(0, 2).map((s, i) => text(s, 470, 452 + i * 37, 20, "#d7e2f1", false)).join("")}
    <path d="M65 565 H925" stroke="#b99d59" stroke-width="2"/>
    ${text(c.tagline, 925, 610, 23, "#e2c47b")}
  `}
  ${draft ? `<rect x="30" y="15" width="150" height="45" rx="10" fill="#fff2cc"/>${text("معاينة", 151, 47, 22, "#735b23")}` : ""}
  </svg>`;
  return new Resvg(svg, { font: { fontFiles: [path.join(process.cwd(), "public/fonts/NotoSansArabic-Variable.ttf")], loadSystemFonts: false, defaultFontFamily: "Noto Sans Arabic" } }).render().asPng();
}
export async function renderCardPdf(snapshot: CardSnapshot, slug: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${snapshot.name} | ${snapshot.company.name}`);
  pdf.setAuthor(snapshot.company.name);
  for (const side of ["front", "back"] as const) {
    const png = await pdf.embedPng(await renderCard(snapshot, slug, side));
    const page = pdf.addPage([85 / 25.4 * 72, 55 / 25.4 * 72]);
    page.drawImage(png, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  }
  return pdf.save();
}
