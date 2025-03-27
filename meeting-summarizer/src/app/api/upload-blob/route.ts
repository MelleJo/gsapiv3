// src/app/api/upload-blob/route.ts
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
// Removed NextResponse import
import { nanoid } from '@/lib/nanoid'; // Assuming you have this utility

// Use edge runtime for optimal performance with handleUpload
export const runtime = 'edge';
export const dynamic = 'force-dynamic'; // Ensure dynamic execution

// Define valid MIME types more robustly
const validMimeTypesMap: Record<string, string[]> = {
  // Common audio formats
  mp3: ['audio/mp3', 'audio/mpeg'],
  wav: ['audio/wav', 'audio/x-wav'],
  ogg: ['audio/ogg', 'audio/vorbis'],
  flac: ['audio/flac'],
  m4a: ['audio/m4a', 'audio/mp4', 'audio/x-m4a'], // Often reported as audio/mp4
  aac: ['audio/aac'],
  webm_audio: ['audio/webm'], // Specifically audio webm
  // Common video formats (allow video upload, conversion happens later)
  mp4: ['video/mp4'],
  mov: ['video/quicktime'],
  avi: ['video/x-msvideo'],
  webm_video: ['video/webm'],
  wmv: ['video/x-ms-wmv'],
};

// Flattened list of allowed MIME types for Vercel Blob
const allowedContentTypes = Array.from(new Set(Object.values(validMimeTypesMap).flat()));

export async function POST(request: Request): Promise<Response> { // Changed return type to Promise<Response>
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname /*, clientPayload */) => {
        // Generate a unique pathname prefix and keep original extension
        const extension = pathname.split('.').pop()?.toLowerCase() || 'bin';
        // Simple sanitization for the base name part
        const baseName = pathname.substring(0, pathname.lastIndexOf('.'))
                                .replace(/[^a-zA-Z0-9_.-]/g, '_');

        const newPathname = `${nanoid()}/${baseName}.${extension}`;

        console.log(`Generating token for pathname: ${pathname}, newPathname: ${newPathname}`);

        // Basic validation based on extension before generating token
        if (!Object.keys(validMimeTypesMap).includes(extension)) {
            // Handle cases like 'webm' which can be audio or video
            if (!(extension === 'webm' || extension === 'mp4')) {
              console.warn(`Potentially invalid extension provided: ${extension}`);
              // Consider throwing error here if strict validation is needed pre-upload
              // throw new Error(`Invalid file extension: ${extension}`);
            }
        }


        return {
          allowedContentTypes: allowedContentTypes, // Use the defined list
          tokenPayload: JSON.stringify({
            originalFilename: pathname, // Store original filename if needed
            // userId: 'user123', // Example: Add user context if available
          }),
          // Set cache control for uploaded files (e.g., 1 year immutable)
          cacheControlMaxAge: 365 * 24 * 60 * 60,
          // Add unique prefix to the pathname
          pathname: newPathname,
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Optional: Perform actions after upload is complete
        // Corrected: Removed blob.size as it's not in PutBlobResult
        console.log('✅ Blob upload completed:', blob.pathname);
        try {
          // Example: Log completion with payload data
          const payload = JSON.parse(tokenPayload || '{}');
          console.log('Original filename from token:', payload.originalFilename);
          // await db.update({ blobUrl: blob.url, ...payload });
        } catch (error) {
          console.error('Error in onUploadCompleted:', error);
          // Don't throw from here to avoid breaking the client response
        }
      },
    });

    // handleUpload returns the blob details upon success (PutBlobResult)
    // Use Response.json instead of NextResponse.json
    return Response.json(jsonResponse);
  } catch (error) {
    console.error('❌ Error in /api/upload-blob:', error);
    // The error message is passed from handleUpload or caught exceptions
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    // Ensure a standard error structure
    // Use Response.json instead of NextResponse.json
    return Response.json(
      { error: message },
      // handleUpload might throw errors with specific statuses (e.g., 400 for bad requests)
      // Use 400 as default if status is not available
      { status: (error as any).status || 400 },
    );
  }
}