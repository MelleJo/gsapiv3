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
  // Dummy implementation: replace with actual implementation if available.
  return new Promise((resolve) => {
    resolve({
      url: "https://dummy.vercel.blob/" + name,
      pathname: "/dummy/" + name,
      size: file.size,
      contentType: options.contentType || file.type,
      originalName: file.name
    });
  });
}
