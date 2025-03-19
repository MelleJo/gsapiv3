// src/app/api/transcribe/route.ts

import { NextResponse } from 'next/server';
import openai from '@/lib/openai';
import { whisperModels } from '@/lib/config';
import { estimateAudioDuration, calculateTranscriptionCost } from '@/lib/tokenCounter';
import { SIZE_LIMIT, splitAudioBlob, joinTranscriptions, processChunks } from '@/lib/audioChunker';

export const config = {
  runtime: 'nodejs',
  maxDuration: 300, // 5 minutes max execution time
};

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Parameters for Blob URL processing
    const blobUrl = body.blobUrl;
    const originalFileName = body.originalFileName || 'audio.mp3';
    const fileType = body.fileType || 'audio/mpeg';
    const fileSize = body.fileSize || 0;
    const modelId = body.model || 'whisper-1';
    
    if (!blobUrl) {
      return NextResponse.json(
        { error: 'No audio URL provided' },
        { status: 400 }
      );
    }

    // Get the file extension from the original filename
    const fileExt = originalFileName.split('.').pop()?.toLowerCase();
    const validExtensions = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];
    
    if (!fileExt || !validExtensions.includes(fileExt)) {
      return NextResponse.json(
        { error: `Invalid file format. Supported formats: ${validExtensions.join(', ')}` },
        { status: 400 }
      );
    }

    // File size and chunking notification
    const fileSizeMB = fileSize / (1024 * 1024);
    const needsChunking = fileSize > SIZE_LIMIT;
    
    // Calculate chunks for cost estimation
    const numChunks = needsChunking ? Math.ceil(fileSize / SIZE_LIMIT) : 1;
    
    // Estimate duration and cost
    const estimatedDurationMinutes = estimateAudioDuration(fileSize);
    const selectedModel = whisperModels.find(m => m.id === modelId) || whisperModels[0];
    const estimatedCost = calculateTranscriptionCost(
      estimatedDurationMinutes, 
      selectedModel.costPerMinute
    );

    console.log(`Processing file: ${originalFileName}, Size: ${fileSizeMB.toFixed(2)}MB, Estimated duration: ${estimatedDurationMinutes.toFixed(2)} minutes`);
    if (needsChunking) {
      console.log(`File will be split into approximately ${numChunks} chunks due to size > ${SIZE_LIMIT / (1024 * 1024)}MB`);
    }

    try {
      // First, fetch the audio blob from the URL
      const audioResponse = await withTimeout(
        fetch(blobUrl), 
        FETCH_TIMEOUT, 
        'Timeout exceeded while fetching audio file. Please try again.'
      );
      
      if (!audioResponse.ok) {
        throw new Error(`Error fetching audio file: ${audioResponse.status} ${audioResponse.statusText}`);
      }
      
      const audioBlob = await audioResponse.blob();
      
      // Determine appropriate MIME type
      const mimeType = fileType || audioBlob.type || `audio/${fileExt}`;
      
      console.log(`Audio blob fetched. Size: ${(audioBlob.size / (1024 * 1024)).toFixed(2)}MB, Type: ${mimeType}`);
      
      // Split audio into chunks
      console.log(`Splitting audio into chunks with size limit of ${SIZE_LIMIT / (1024 * 1024)}MB...`);
      const audioChunks = await splitAudioBlob(audioBlob);
      console.log(`Split complete. Created ${audioChunks.length} chunks.`);
      
      // Process each chunk and combine results
      const transcription = await processChunks<string>(
        audioChunks,
        async (chunk, index) => {
          console.log(`Processing chunk ${index + 1}/${audioChunks.length}, size: ${(chunk.size / (1024 * 1024)).toFixed(2)}MB`);
          
          try {
            // Create a valid File object for OpenAI API
            const chunkFileName = `chunk_${index + 1}_${originalFileName}`;
            const fileObject = new File([chunk], chunkFileName, { 
              type: mimeType,
              lastModified: Date.now()
            });
            
            // For debugging, log the created file object
            console.log(`Created File object: name=${fileObject.name}, size=${fileObject.size}, type=${fileObject.type}`);
            
            // Process with OpenAI Whisper with proper error handling
            const result = await withRetry(async () => {
              return await openai.audio.transcriptions.create({
                file: fileObject,
                model: modelId,
                language: 'nl',
                response_format: 'text',
              });
            }, 2, 2000);
            
            console.log(`Successfully transcribed chunk ${index + 1}/${audioChunks.length}`);
            return result;
          } catch (error: any) {
            console.error(`Error processing chunk ${index + 1}/${audioChunks.length}:`, error);
            
            // Provide more detailed error information
            const errorMessage = error.message || 'Unknown error';
            const statusCode = error.status || 500;
            throw new Error(`Failed to process chunk ${index + 1}/${audioChunks.length}: ${errorMessage} (${statusCode})`);
          }
        },
        // Combine function
        (results) => {
          console.log(`Combining ${results.length} transcription chunks...`);
          return joinTranscriptions(results);
        }
      );

      console.log(`Transcription complete. Length: ${transcription.length} characters`);
      
      return NextResponse.json({ 
        transcription,
        usage: {
          model: selectedModel.name,
          estimatedDurationMinutes,
          estimatedCost,
          chunked: needsChunking,
          chunks: audioChunks.length
        }
      });
    } catch (processingError: any) {
      console.error('Error processing audio:', processingError);
      
      let errorMessage = 'Processing error';
      let statusCode = 500;
      
      // Improved error handling with specific error messages
      if (processingError.message?.includes('timeout') || processingError.message?.includes('Timeout')) {
        errorMessage = processingError.message;
        statusCode = 408; // Request Timeout
      } else if (processingError.message?.includes('chunk')) {
        // This is from our chunk processing error
        errorMessage = processingError.message;
      } else if (processingError.status === 413 || processingError.message?.includes('too large')) {
        errorMessage = 'Audio file is too large even after chunking. Please try a smaller file.';
        statusCode = 413;
      } else if (processingError.status === 429) {
        errorMessage = 'API rate limit reached. Please try again later.';
        statusCode = 429;
      } else if (processingError.status === 401) {
        errorMessage = 'Authentication error. Check your OpenAI API key.';
        statusCode = 401;
      } else if (processingError.message) {
        errorMessage = `Error: ${processingError.message}`;
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