declare module "@vercel/blob" {
  export interface BlobFile {
    url: string;
    pathname: string;
    size: number;
    contentType: string;
    originalName: string;
  }

  export function put(
    name: string,
    file: File,
    options: { access: "public" | "private"; contentType?: string }
  ): Promise<BlobFile>;

  export {};
}
