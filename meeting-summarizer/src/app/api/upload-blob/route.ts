// src/app/api/upload-blob/route.ts
// import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { nanoid } from '@/lib/nanoid';

export const runtime = 'edge';
export const maxDuration = 300; // 5 minutes max execution time
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) {
      return Response.json(
        { error: 'Geen bestand aangeleverd' },
        { status: 400 }
      );
    }

    // Get the file extension and generate a unique filename
    const fileName = file.name;
    const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
    const uniqueFileName = `${nanoid()}-${Date.now()}.${fileExt}`;
    
    // Create a comprehensive mapping of file extensions to MIME types
    const validMimeTypes = {
      // Common audio formats
      mp3: ['audio/mp3', 'audio/mpeg', 'audio/x-mpeg', 'audio/mpeg3'],
      wav: ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'],
      ogg: ['audio/ogg', 'audio/x-ogg', 'audio/vorbis', 'audio/oga'],
      flac: ['audio/flac', 'audio/x-flac'],
      m4a: ['audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mp4', 'audio/x-mp4'],
      aac: ['audio/aac', 'audio/x-aac', 'audio/aacp'],
      mpeg: ['audio/mpeg', 'audio/x-mpeg'],
      mpga: ['audio/mpeg', 'audio/mpga'],
      oga: ['audio/ogg', 'audio/oga'],
      webm: ['audio/webm', 'video/webm'],
      mp4: ['video/mp4', 'audio/mp4', 'application/mp4', 'video/x-mp4']
    };
    
    // Valid extensions list (for user-friendly error messages)
    const validExtensions = Object.keys(validMimeTypes);
    
    // Validate file extension
    const isValidExtension = validExtensions.includes(fileExt);
    
    // Get file type from File object
    const fileType = file.type.toLowerCase();
    
    // Check if MIME type is valid based on our mapping
    const isValidMimeType = Object.values(validMimeTypes).some(types => 
      types.includes(fileType)
    );
    
    // Special case for m4a files which might be reported as mp4 audio
    const isM4aWithMp4MimeType = 
      (fileExt === 'm4a' && fileType === 'audio/mp4') || 
      (fileExt === 'm4a' && fileType === 'video/mp4');
    
    if (!isValidExtension && !isValidMimeType && !isM4aWithMp4MimeType) {
      return Response.json(
        { error: `Ongeldig bestandsformaat. Ondersteunde formaten: ${validExtensions.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Set appropriate content type for the upload
    let uploadContentType = file.type;
    
    // Fix content type for special cases
    if (fileExt === 'm4a' && fileType === 'video/mp4') {
      uploadContentType = 'audio/mp4';
    }

    // File size check and logging
    const fileSize = file.size;
    const fileSizeMB = fileSize / (1024 * 1024);
    
    // Theoretically we can handle up to 4.5GB with Vercel Blob, but
    // set a reasonable limit that works within API limitations
    const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
    if (fileSize > MAX_FILE_SIZE) {
      return Response.json(
        { error: `Bestand te groot (${fileSizeMB.toFixed(2)}MB). Maximale bestandsgrootte is 500MB.` },
        { status: 400 }
      );
    }
    
    console.log(`Bestandsupload naar Vercel Blob: ${fileName}, grootte: ${fileSizeMB.toFixed(2)}MB`);

    // Upload naar Vercel Blob
    const blob = await put(uniqueFileName, file, {
      access: 'public',
      contentType: uploadContentType,
    } as any);

    return Response.json({
      success: true,
      blob: {
        url: blob.url,
        size: fileSize,
        contentType: uploadContentType,
        originalName: fileName,
      }
    });
  } catch (error) {
    console.error('Fout bij uploaden naar Vercel Blob:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Fout bij uploaden naar Vercel Blob';
    
    return Response.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
