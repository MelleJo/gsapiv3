// src/app/api/client-upload/route.ts
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
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
        
        console.log(`Client upload requested for: ${pathname}`);
        
        return {
          allowedContentTypes,
          maximumSizeInBytes: 500 * 1024 * 1024, // 500MB
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // This happens after the upload is complete
        console.log('Blob upload completed:', blob.url, blob.pathname);
        
        // You could update a database here if needed
        // No return value needed
      },
    });

    return Response.json(jsonResponse);
  } catch (error) {
    console.error('Client upload error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 } // The webhook will retry 5 times waiting for a 200
    );
  }
}
