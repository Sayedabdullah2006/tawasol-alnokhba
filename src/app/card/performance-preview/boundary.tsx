"use client";
import {type ReactNode,useState} from "react";
export default function PreviewBoundary({children}:{children:ReactNode}){const [message,setMessage]=useState("");return <div onClickCapture={e=>{const link=(e.target as Element).closest("a[href]");if(link&&!link.getAttribute("href")?.startsWith("/card/performance-preview")){e.preventDefault();setMessage("المعاينة للعرض فقط؛ لا تُرسل أي بيانات");}}}>{message&&<p role="status" className="sticky top-2 z-50 mx-auto max-w-lg rounded-xl bg-[#10243c] p-3 text-center text-xs text-white">{message}</p>}{children}</div>;}
