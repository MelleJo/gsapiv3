// src/app/api/client-upload/route.ts
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // We could add authentication here if needed
        // This is where we validate the upload before it starts
        
        return {
          allowedContentTypes: [
            'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 
            'audio/flac', 'audio/m4a', 'audio/oga', 'audio/webm', 
            'video/mp4', 'video/webm'
          ],
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

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('Client upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 } // The webhook will retry 5 times waiting for a 200
    );
  }
}
