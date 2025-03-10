// src/app/api/upload-blob/route.ts
import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { nanoid } from '@/lib/nanoid';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) {
      return NextResponse.json(
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
      return NextResponse.json(
        { error: `Ongeldig bestandsformaat. Ondersteunde formaten: ${validExtensions.join(', ')}` },
        { status: 400 }
      );
    }

    // Geen harde limiet voor bestandsgrootte meer
    const fileSize = file.size;
    const fileSizeMB = fileSize / (1024 * 1024);
    
    console.log(`Bestandsupload naar Vercel Blob: ${fileName}, grootte: ${fileSizeMB.toFixed(2)}MB`);

    // Upload naar Vercel Blob
    const blob = await put(uniqueFileName, file, {
      access: 'public',
      contentType: file.type,
    });

    return NextResponse.json({
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
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}