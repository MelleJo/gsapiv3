export interface BlobFile {
  url: string;
  pathname: string;
  size: number;
  contentType: string;
  originalName: string;
}

export async function put(
  name: string,
  file: File,
  options: { access: "public" | "private"; contentType?: string }
): Promise<BlobFile> {
  // Dummy implementation: simulate a valid, resolvable Blob URL for testing.
  return new Promise((resolve) => {
    resolve({
      url: "https://example.com/blob/" + name,
      pathname: "/blob/" + name,
      size: file.size,
      contentType: options.contentType || file.type,
      originalName: file.name
    });
  });
}
