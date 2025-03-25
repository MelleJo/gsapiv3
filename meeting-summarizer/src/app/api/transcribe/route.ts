// src/app/api/transcribe/route.ts
import { NextResponse } from 'next/server';
import openai from '@/lib/openai';
import { whisperModels } from '@/lib/config';
import { estimateAudioDuration, calculateTranscriptionCost } from '@/lib/tokenCounter';
import { 
  SIZE_LIMIT, 
  splitAudioBlob, 
  joinTranscriptions, 
  processChunks, 
  formatBytes 
} from '@/lib/audioChunker';

export const runtime = 'edge';
export const maxDuration = 300; // 5 minutes max execution time

// Configure timeout for fetch operations
const FETCH_TIMEOUT = 120000; // 2 minutes

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
    
    // Parameters for Blob URL processing
    const blobUrl = body.blobUrl;
    const originalFileName = body.originalFileName || 'audio.mp3';
    const fileType = body.fileType || 'audio/mpeg';
    const fileSize = body.fileSize || 0;
    const modelId = body.model || 'whisper-1';
    
    if (!blobUrl) {
      return NextResponse.json(
        { error: 'Geen audio URL aangeleverd' },
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
      console.log(`Fetching audio from blob URL...`);
      const audioResponse = await withTimeout(
        fetch(blobUrl), 
        FETCH_TIMEOUT, 
        'Timeout exceeded while fetching audio file. Please try again.'
      );
      
      if (!audioResponse.ok) {
        throw new Error(`Error fetching audio file: ${audioResponse.status} ${audioResponse.statusText}`);
      }
      
      const audioBlob = await audioResponse.blob();
      console.log(`Audio blob fetched. Size: ${formatBytes(audioBlob.size)}, Type: ${audioBlob.type}`);

      // Always use chunking for better reliability
      console.log(`Splitting audio into smaller chunks...`);
      const audioChunks = await splitAudioBlob(audioBlob, SIZE_LIMIT / 5); // Use smaller chunks (2MB) for better reliability
      console.log(`Split complete. Created ${audioChunks.length} chunks.`);
      
      // Function to process a single chunk
      const processChunk = async (chunk: Blob, index: number): Promise<string> => {
        console.log(`Processing chunk ${index + 1}/${audioChunks.length}, size: ${formatBytes(chunk.size)}`);
        
        // Create a valid File object for OpenAI API
        const chunkFileName = `chunk_${index + 1}_${originalFileName}`;
        const fileObject = new File([chunk], chunkFileName, { 
          type: 'audio/mpeg', // Always MP3 after conversion
          lastModified: Date.now()
        });
        
        // Process with OpenAI Whisper
        const result = await openai.audio.transcriptions.create({
          file: fileObject,
          model: modelId,
          language: 'nl',
          response_format: 'text',
        });
        
        console.log(`Successfully transcribed chunk ${index + 1}/${audioChunks.length} (${result.length} characters)`);
        return result;
      };
      
      // Process all chunks with improved error handling
      const transcription = await processChunks<string>(
        audioChunks,
        processChunk,
        joinTranscriptions,
        {
          maxConcurrent: audioChunks.length > 10 ? 1 : 2, // Process only 1 at a time for very large files
          retries: 3,
          delayBetweenChunks: 1500, // Longer delay between chunks
          timeoutPerChunk: 90 * 1000 // 90 second timeout per chunk
        }
      );

      console.log(`Transcription complete. Total length: ${transcription.length} characters`);
      
      return NextResponse.json({ 
        transcription,
        usage: {
          model: selectedModel.name,
          estimatedDurationMinutes,
          estimatedCost,
          chunked: true,
          chunks: audioChunks.length
        }
      });
      
    } catch (processingError: any) {
      console.error('Error processing audio:', processingError);
      
      let errorMessage = 'Processing error';
      let statusCode = 500;
      
      if (processingError.message?.includes('FFmpeg')) {
        errorMessage = `Audio conversion failed: ${processingError.message}. Please ensure the file is a valid audio file.`;
      } else if (processingError.message?.includes('timeout') || processingError.message?.includes('Timeout')) {
        errorMessage = `Verwerking duurde te lang voor dit bestand (${formatBytes(fileSize)}). Probeer een kleinere of kortere opname, of splits het bestand handmatig.`;
        statusCode = 408; // Request Timeout
      } else if (processingError.message?.includes('chunk')) {
        errorMessage = `Error bij het verwerken van een segment van het bestand: ${processingError.message}. Probeer een kortere opname.`;
      } else if (processingError.status === 413 || processingError.message?.includes('too large')) {
        errorMessage = `Bestand is te groot voor verwerking (${formatBytes(fileSize)}). Maximum is ongeveer 100MB. Verklein het bestand of verkort de opname.`;
        statusCode = 413;
      } else if (processingError.status === 429) {
        errorMessage = 'API limiet bereikt. Probeer het over enkele minuten opnieuw.';
        statusCode = 429;
      } else if (processingError.status === 401) {
        errorMessage = 'Authenticatiefout. Neem contact op met de beheerder.';
        statusCode = 401;
      } else if (processingError.status === 504 || processingError.message?.includes('timeout')) {
        errorMessage = `Verwerking duurde te lang voor dit bestand. De opname is mogelijk te lang (${estimatedDurationMinutes.toFixed(0)} minuten geschat). Probeer een kortere opname.`;
        statusCode = 504;
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