"use client";

import { useRef, useState } from "react";
import { put } from "@vercel/blob";
import type { BlobFile } from "../types/vercelBlob";

interface FileUploaderProps {
  onFileUploaded?: (blob: BlobFile) => void;
}

export default function FileUploader({ onFileUploaded }: FileUploaderProps) {
  const inputFileRef = useRef<HTMLInputElement>(null);
  const [blobResult, setBlobResult] = useState<BlobFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!inputFileRef.current || !inputFileRef.current.files || inputFileRef.current.files.length === 0) {
      setError("No file selected");
      return;
    }
    const file = inputFileRef.current.files[0];
    try {
      setUploading(true);
      const blob = await put(file.name, file, { access: "public" });
      setBlobResult(blob);
      if (onFileUploaded) {
        onFileUploaded(blob);
      }
    } catch (err: any) {
      setError("Upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="file" ref={inputFileRef} required accept="video/mp4,audio/*" />
      <button type="submit" disabled={uploading}>
        {uploading ? "Uploading..." : "Upload"}
      </button>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {blobResult && (
        <div>
          <p>Upload successful. Blob URL:</p>
          <a href={blobResult.url} target="_blank" rel="noopener noreferrer">
            {blobResult.url}
          </a>
        </div>
      )}
    </form>
  );
}
