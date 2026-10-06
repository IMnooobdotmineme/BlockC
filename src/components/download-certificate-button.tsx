"use client";
import { useState } from "react";

export function DownloadCertificateButton({ id }: { id: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/certificates/${encodeURIComponent(id)}/pdf`, { cache: "no-store" });
      if (!response.ok) {
        const message = response.status === 401 ? "Your session has expired. Please log in again." : response.status === 404 ? "Certificate not found or unavailable to your organization." : response.status === 409 ? "Confirm blockchain registration before downloading this certificate." : "PDF generation failed. Please try again.";
        throw new Error(message);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "certificate.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Download failed. Please try again.");
    } finally {
      setPending(false);
    }
  }
  return <div className="mb-6"><button type="button" className="btn-primary disabled:cursor-wait disabled:opacity-60" disabled={pending} onClick={download}>{pending ? "Preparing PDF…" : "Download PDF Certificate"}</button><div aria-live="polite">{error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}</div></div>;
}
