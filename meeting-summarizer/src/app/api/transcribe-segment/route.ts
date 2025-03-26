// src/app/api/transcribe-segment/route.ts
import { NextResponse } from 'next/server';
import openai from '@/lib/openai';
import { formatBytes } from '@/lib/enhancedAudioChunker';

export const runtime = 'edge';
export const maxDuration = 60; // Reduced to 60 seconds per segment for better reliability

// Add a timeout wrapper for any promise
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
  let timeoutHandle: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(errorMessage || `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([
    promise,
    timeoutPromise
  ]).finally(() => {
    clearTimeout(timeoutHandle);
  }) as Promise<T>;
};

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
    const segmentId = body.segmentId ?? 0;
    const modelId = body.model || 'whisper-1';
    
    // Validate inputs
    if (!blobUrl) {
      return NextResponse.json(
        { error: 'No blob URL provided for the segment', segmentId },
        { status: 400 }
      );
    }

    // Fetch the audio segment from blob storage with timeout
    console.log(`Fetching segment ${segmentId} from blob URL`);
    const audioResponse = await withTimeout(
      fetch(blobUrl), 
      30000, // 30 second timeout for fetch
      `Timeout fetching segment ${segmentId}`
    );
    
    if (!audioResponse.ok) {
      throw new Error(`Error fetching audio segment: ${audioResponse.status} ${audioResponse.statusText}`);
    }
    
    const segmentBlob = await audioResponse.blob();
    console.log(`Segment ${segmentId} fetched: ${formatBytes(segmentBlob.size)}`);
    
    // Validate segment size - reject if too large
    if (segmentBlob.size > 20 * 1024 * 1024) { // 20MB max for whisper API
      throw new Error(`Segment ${segmentId} is too large (${formatBytes(segmentBlob.size)}). Maximum size is 20MB.`);
    }
    
    // Create a File object for OpenAI API
    const fileObject = new File([segmentBlob], `segment_${segmentId}.mp3`, { 
      type: 'audio/mpeg',
      lastModified: Date.now()
    });
    
    // Process with OpenAI Whisper with timeout
    console.log(`Transcribing segment ${segmentId} with model ${modelId}`);
    
    const transcriptionPromise = openai.audio.transcriptions.create({
      file: fileObject,
      model: modelId,
      language: 'nl',
      response_format: 'text',
    });
    
    // Set a timeout for the transcription process
    const transcription = await withTimeout(
      transcriptionPromise,
      45000, // 45 second timeout for transcription
      `Transcription timeout for segment ${segmentId}`
    );
    
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
    const segmentId = error.segmentId ?? 0; // Extract segmentId from error if possible
    
    // Provide a more specific error message for common failures
    let enhancedErrorMessage = errorMessage;
    
    if (errorMessage.includes('too large')) {
      enhancedErrorMessage = `Audio segment is too large. Maximum size is 20MB.`;
    } else if (errorMessage.includes('timeout')) {
      enhancedErrorMessage = `Timeout processing audio segment. The segment may be too long.`;
    } else if (errorMessage.includes('rate limit')) {
      enhancedErrorMessage = `OpenAI API rate limit reached. Please try again in a few moments.`;
    }
    
    return NextResponse.json(
      { 
        error: enhancedErrorMessage,
        segmentId: segmentId
      },
      { status: statusCode }
    );
  }
}