// src/app/api/client-upload/route.ts
import { handleUpload } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { formatBytes } from '@/lib/enhancedAudioChunker';

export const runtime = 'edge';
export const maxDuration = 60; // 60 seconds to match transcribe-segment endpoint
export const dynamic = 'force-dynamic';

// Add timeout wrapper for better handling
const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Operation ${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
};

// Safe formatBytes wrapper that handles various input types
const safeFormatBytes = (bytes: unknown): string => {
  if (typeof bytes === 'number') {
    return formatBytes(bytes);
  } else if (typeof bytes === 'string' && !isNaN(Number(bytes))) {
    return formatBytes(Number(bytes));
  }
  return 'unknown size';
};

export async function POST(request: Request) {
  let startTime = Date.now();
  let requestDetails = 'unknown file';
  
  try {
    // Parse request body with timeout
    const body = await withTimeout(
      request.json(),
      5000, // 5 second timeout for JSON parsing
      'request parsing'
    );
    
    // Log basic request info
    console.log(`Upload request received (${Date.now() - startTime}ms elapsed)`);
    
    // Process upload with timeout
    const jsonResponse = await withTimeout(
      handleUpload({
        body,
        request,
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          // We could add authentication here if needed
          // This is where we validate the upload before it starts
          
          // Create a comprehensive list of allowed MIME types
          const allowedContentTypes = [
            // MP3 formats
            'audio/mp3', 'audio/mpeg', 'audio/x-mpeg', 'audio/mpeg3',
            
            // WAV formats
            'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave',
            
            // OGG formats
            'audio/ogg', 'audio/x-ogg', 'audio/vorbis', 'audio/oga',
            
            // FLAC formats
            'audio/flac', 'audio/x-flac',
            
            // M4A and AAC formats
            'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mp4', 'audio/x-mp4', 
            'audio/x-aac', 'audio/aacp',
            
            // Other audio formats
            'audio/webm',
            
            // Video formats (that contain audio)
            'video/mp4', 'video/x-mp4', 'application/mp4', 'video/webm'
          ];
          
          // Update requestDetails with the pathname for better logging
          requestDetails = pathname.split('/').pop() || 'unknown file';
          console.log(`Client upload token requested for: ${pathname} (${Date.now() - startTime}ms elapsed)`);
          
          // Reduce maximum size to avoid timeouts
          const maximumSizeInBytes = 200 * 1024 * 1024; // 200MB max
          
          // Safely check content length if available
          if (clientPayload && typeof clientPayload === 'object') {
            const contentLengthKey = 'contentLength';
            const contentLengthValue = (clientPayload as Record<string, unknown>)[contentLengthKey];
            
            if (contentLengthValue !== undefined) {
              let contentLength: number;
              
              if (typeof contentLengthValue === 'number') {
                contentLength = contentLengthValue;
              } else if (typeof contentLengthValue === 'string' && !isNaN(Number(contentLengthValue))) {
                contentLength = Number(contentLengthValue);
              } else {
                // Skip validation if we can't parse the content length
                return { allowedContentTypes, maximumSizeInBytes };
              }
              
              console.log(`Content length: ${safeFormatBytes(contentLength)} (${contentLength} bytes)`);
              
              // Reject if file is too large
              if (contentLength > maximumSizeInBytes) {
                throw new Error(
                  `File too large: ${safeFormatBytes(contentLength)}. Maximum size is ${safeFormatBytes(maximumSizeInBytes)}`
                );
              }
            }
          }
          
          return {
            allowedContentTypes,
            maximumSizeInBytes,
          };
        },
        onUploadCompleted: async ({ blob }) => {
          // This happens after the upload is complete
          console.log(
            `Blob upload completed: ${blob.pathname}, ` +
            `Duration: ${(Date.now() - startTime) / 1000}s`
          );
        },
      }),
      45000, // 45 second timeout for the entire upload process
      'handleUpload'
    );

    console.log(`Upload for "${requestDetails}" succeeded in ${(Date.now() - startTime) / 1000}s`);
    return Response.json(jsonResponse);
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    console.error(`Client upload error for "${requestDetails}" after ${duration}s:`, errorMessage);
    
    // Determine if this is a timeout error
    const isTimeout = errorMessage.includes('timeout') || duration >= 45;
    
    // Create a more detailed error response
    return Response.json(
      { 
        error: errorMessage,
        type: isTimeout ? 'timeout' : 'upload_error',
        details: {
          file: requestDetails,
          duration: `${duration}s`,
          recommendation: isTimeout 
            ? 'Try uploading a smaller file or use the chunked uploader'
            : 'Check file format and try again'
        }
      },
      { status: isTimeout ? 408 : 400 }
    );
  }
}
