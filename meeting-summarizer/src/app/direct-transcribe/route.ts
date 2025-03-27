// src/app/api/direct-transcribe/route.ts
import { NextResponse } from 'next/server';
import openai from '@/lib/openai';
import { formatBytes } from '@/lib/enhancedAudioChunker';

export const runtime = 'edge';
export const maxDuration = 720; // 12 minutes (720 seconds) - maximum for Fluid Compute

// Maximum file size to accept (19MB to stay under OpenAI's 20MB limit)
const MAX_FILE_SIZE = 19 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    // First, get the chunked audio data and metadata
    const formData = await request.formData();
    
    // Get audio data from FormData
    const audioBlob = formData.get('audio') as Blob | null;
    const chunkIndex = formData.get('chunkIndex') as string | null;
    const fileName = formData.get('fileName') as string | null;
    const modelId = formData.get('model') as string | null || 'whisper-1';
    
    if (!audioBlob) {
      return NextResponse.json(
        { error: 'No audio data provided', chunkIndex },
        { status: 400 }
      );
    }
    
    // Validate file size
    if (audioBlob.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { 
          error: `Audio chunk is too large (${formatBytes(audioBlob.size)}). Maximum size is ${formatBytes(MAX_FILE_SIZE)}.`,
          chunkIndex 
        },
        { status: 413 }
      );
    }

    console.log(`Processing direct audio chunk ${chunkIndex}, size: ${formatBytes(audioBlob.size)}`);
    
    // Create a File object for OpenAI API
    const fileObject = new File(
      [audioBlob], 
      fileName || `chunk_${chunkIndex}.wav`, 
      { type: audioBlob.type || 'audio/wav' }
    );
    
    // Process with OpenAI Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fileObject,
      model: modelId,
      language: 'nl',
      response_format: 'text',
    });

    console.log(`Successfully transcribed chunk ${chunkIndex} (${transcription.length} characters)`);
    
    return NextResponse.json({ 
      success: true,
      chunkIndex,
      transcription 
    });
    
  } catch (error: any) {
    console.error('Direct transcription error:', error);
    
    const errorMessage = error.message || 'Direct transcription failed';
    const statusCode = error.status || 500;
    const chunkIndex = error.chunkIndex || 0;
    
    return NextResponse.json(
      { 
        error: errorMessage,
        chunkIndex,
        retryable: isRetryableError(errorMessage)
      },
      { status: statusCode }
    );
  }
}

// Helper function to determine if an error is retryable
function isRetryableError(errorMessage: string): boolean {
  return (
    errorMessage.includes('timeout') ||
    errorMessage.includes('rate limit') ||
    errorMessage.includes('429') ||
    errorMessage.includes('5') || // 5xx server errors
    errorMessage.includes('network') ||
    errorMessage.includes('connection')
  );
}