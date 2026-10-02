"use client";

import { FileUp } from "lucide-react";
import { useRef, useState } from "react";

export function ReportPicker() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>();
  return <div className="report-picker">
    <input ref={inputRef} className="sr-only" type="file" id="demo-report" accept=".pdf,.png,.jpg,.jpeg,.dcm,application/pdf,image/png,image/jpeg" onChange={(event) => setFileName(event.target.files?.[0]?.name)} />
    <button type="button" className="report-picker__button" onClick={() => inputRef.current?.click()}><FileUp size={18} aria-hidden="true" /> Select a report locally</button>
    <p className="editorial-note">Local preview only. To store an explicitly requested document privately, use document coordination in Care Workspace.</p>
    {fileName && <p role="status"><strong>{fileName}</strong> selected locally. It has not been uploaded or stored.</p>}
  </div>;
}
