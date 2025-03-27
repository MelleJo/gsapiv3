// src/app/api/transcribe/route.ts
import { NextResponse } from 'next/server';
import openai from '@/lib/openai';
import { whisperModels } from '@/lib/config';
import { estimateAudioDuration, calculateTranscriptionCost } from '@/lib/tokenCounter';
import { 
  joinTranscriptions,
  formatBytes 
} from '@/lib/audioChunker';

export const runtime = 'edge';
export const maxDuration = 300; // 5 minutes max execution time

// Configure timeout for fetch operations
const FETCH_TIMEOUT = 120000; // 2 minutes

// Helper function to add retry logic
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, delay = 1000): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      console.log(`Attempt ${attempt} failed. ${attempt < maxRetries ? 'Retrying...' : 'Giving up.'}`);
      
      // If this is not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay * attempt)); // Exponential backoff
      }
    }
  }
  
  throw lastError;
}

// Main route handler
export async function POST(request: Request) {
  try {
    // Log the incoming request for debugging
    console.log(`Received transcription request`);
    
    const body = await request.json();
    
    // Parameters for the transcription
    const blobUrl = body.blobUrl;
    const originalFileName = body.originalFileName || 'audio.mp3';
    const fileType = body.fileType || 'audio/mpeg';
    const fileSize = body.fileSize || 0;
    const modelId = body.model || 'whisper-1';
    const transcriptionSegments = body.transcriptionSegments || [];
    
    // If we already have transcription segments, just join them
    if (transcriptionSegments && transcriptionSegments.length > 0) {
      console.log(`Received ${transcriptionSegments.length} pre-transcribed segments, joining them`);
      
      // Estimate duration and cost
      const estimatedDurationMinutes = estimateAudioDuration(fileSize);
      const selectedModel = whisperModels.find(m => m.id === modelId) || whisperModels[0];
      const estimatedCost = calculateTranscriptionCost(
        estimatedDurationMinutes, 
        selectedModel.costPerMinute
      );
      
      // Join the segments
      const transcription = joinTranscriptions(transcriptionSegments);
      
      return NextResponse.json({ 
        transcription,
        usage: {
          model: selectedModel.name,
          estimatedDurationMinutes,
          estimatedCost,
          chunked: true,
          chunks: transcriptionSegments.length
        }
      });
    }
    
    // Otherwise, we need to fetch and transcribe the audio from the URL
    if (!blobUrl) {
      return NextResponse.json(
        { error: 'Geen audio URL of transcriptie segmenten aangeleverd' },
        { status: 400 }
      );
    }

    // Get the file extension from the original filename
    const fileExt = originalFileName.split('.').pop()?.toLowerCase();
    const validExtensions = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];
    
    if (!fileExt || !validExtensions.includes(fileExt)) {
      return NextResponse.json(
        { error: `Ongeldig bestandsformaat. Ondersteunde formaten: ${validExtensions.join(', ')}` },
        { status: 400 }
      );
    }

    // File size notification
    const fileSizeMB = fileSize / (1024 * 1024);
    
    // Estimate duration and cost
    const estimatedDurationMinutes = estimateAudioDuration(fileSize);
    const selectedModel = whisperModels.find(m => m.id === modelId) || whisperModels[0];
    const estimatedCost = calculateTranscriptionCost(
      estimatedDurationMinutes, 
      selectedModel.costPerMinute
    );

    console.log(`Processing file: ${originalFileName}, Size: ${formatBytes(fileSize)}, Estimated duration: ${estimatedDurationMinutes.toFixed(2)} minutes`);
    
    try {
      // Fetch the audio blob from the URL
      console.log(`Fetching audio from URL...`);
      const audioResponse = await fetch(blobUrl);
      
      if (!audioResponse.ok) {
        throw new Error(`Error fetching audio file: ${audioResponse.status} ${audioResponse.statusText}`);
      }
      
      const audioBlob = await audioResponse.blob();
      console.log(`Audio blob fetched. Size: ${formatBytes(audioBlob.size)}, Type: ${audioBlob.type}`);

      // Create a File object for OpenAI API
      const fileObject = new File([audioBlob], originalFileName, { 
        type: fileType,
        lastModified: Date.now()
      });

      // Process with OpenAI Whisper
      console.log(`Transcribing with OpenAI Whisper model: ${modelId}`);
      const result = await openai.audio.transcriptions.create({
        file: fileObject,
        model: modelId,
        language: 'nl',
        response_format: 'text',
      });
      
      console.log(`Transcription complete. Total length: ${result.length} characters`);
      
      return NextResponse.json({ 
        transcription: result,
        usage: {
          model: selectedModel.name,
          estimatedDurationMinutes,
          estimatedCost,
          chunked: false,
          chunks: 1
        }
      });
      
    } catch (processingError: any) {
      console.error('Error processing audio:', processingError);
      
      let errorMessage = 'Processing error';
      let statusCode = 500;
      
      if (processingError.message?.includes('timeout') || processingError.message?.includes('Timeout')) {
        errorMessage = `Verwerking duurde te lang voor dit bestand (${formatBytes(fileSize)}). Probeer een kleinere of kortere opname, of splits het bestand handmatig.`;
        statusCode = 408; // Request Timeout
      } else if (processingError.status === 413 || processingError.message?.includes('too large')) {
        errorMessage = `Bestand is te groot voor verwerking (${formatBytes(fileSize)}). Maximum is ongeveer 100MB. Verklein het bestand of verkort de opname.`;
        statusCode = 413;
      } else if (processingError.status === 429) {
        errorMessage = 'API limiet bereikt. Probeer het over enkele minuten opnieuw.';
        statusCode = 429;
      } else if (processingError.status === 401) {
        errorMessage = 'Authenticatiefout. Neem contact op met de beheerder.';
        statusCode = 401;
      } else if (processingError.message) {
        errorMessage = `Fout: ${processingError.message}`;
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: statusCode }
      );
    }
  } catch (error: any) {
    console.error('Transcription error:', error);
    
    const errorMessage = error.message || 'Audio transcription failed';
    const statusCode = error.status || 500;
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}