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
    
    // Toegestane bestandsformaten controleren
    const validExtensions = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];
    
    if (!validExtensions.includes(fileExt)) {
      return Response.json(
        { error: `Ongeldig bestandsformaat. Ondersteunde formaten: ${validExtensions.join(', ')}` },
        { status: 400 }
      );
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
      contentType: file.type,
    } as any);

    return Response.json({
      success: true,
      blob: {
        url: blob.url,
        size: fileSize,
        contentType: file.type,
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
