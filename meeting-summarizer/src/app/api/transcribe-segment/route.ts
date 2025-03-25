// src/app/api/transcribe-segment/route.ts
import { NextResponse } from 'next/server';
import openai from '@/lib/openai';
import { withRetry } from '@/lib/utils';

export const runtime = 'edge';
export const maxDuration = 120; // 2 minutes max execution time for a single segment

/**
 * API endpoint for transcribing a single audio segment
 * This is designed for chunked processing of large audio files
 * where each chunk is processed separately to avoid timeouts
 */
export async function POST(request: Request) {
  try {
    console.log('Received segment transcription request');
    
    const body = await request.json();
    
    // Required parameters
    const blobUrl = body.blobUrl;
    const fileName = body.fileName || 'segment.mp3';
    const segmentId = body.segmentId || 0;
    const modelId = body.model || 'whisper-1';
    
    // Validate inputs
    if (!blobUrl) {
      return NextResponse.json(
        { error: 'No blob URL provided for the segment' },
        { status: 400 }
      );
    }

    // Fetch the audio segment from blob storage
    console.log(`Fetching segment ${segmentId} from: ${blobUrl}`);
    const audioResponse = await fetch(blobUrl);
    
    if (!audioResponse.ok) {
      throw new Error(`Error fetching audio segment: ${audioResponse.status} ${audioResponse.statusText}`);
    }
    
    const segmentBlob = await audioResponse.blob();
    console.log(`Segment ${segmentId} fetched: ${(segmentBlob.size / (1024 * 1024)).toFixed(2)}MB`);
    
    // Create a File object for OpenAI API
    const fileObject = new File([segmentBlob], fileName, { 
      type: 'audio/mpeg',
      lastModified: Date.now()
    });
    
    // Process with OpenAI Whisper with retries
    console.log(`Transcribing segment ${segmentId} with model ${modelId}`);
    const transcription = await withRetry(async () => {
      return await openai.audio.transcriptions.create({
        file: fileObject,
        model: modelId,
        language: 'nl',
        response_format: 'text',
      });
    }, 3, 2000); // 3 retries, 2 second initial delay
    
    console.log(`Segment ${segmentId} transcription complete: ${transcription.length} characters`);
    
    return NextResponse.json({ 
      segmentId,
      transcription,
      success: true
    });
    
  } catch (error: any) {
    console.error('Segment transcription error:', error);
    
    const errorMessage = error.message || 'Segment transcription failed';
    const statusCode = error.status || 500;
    
    return NextResponse.json(
      { 
        error: errorMessage,
        segmentId: error.segmentId || 0
      },
      { status: statusCode }
    );
  }
}
