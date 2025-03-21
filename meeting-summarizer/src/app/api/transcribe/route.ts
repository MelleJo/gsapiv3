// src/app/api/transcribe/route.ts
import { NextResponse } from 'next/server';
import openai from '@/lib/openai';
import { whisperModels } from '@/lib/config';
import { estimateAudioDuration, calculateTranscriptionCost } from '@/lib/tokenCounter';
import { SIZE_LIMIT, splitAudioBlob, joinTranscriptions, processChunks } from '@/lib/audioChunker';

export const runtime = 'nodejs';
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

// This is the most important fix - ensuring we export a POST handler function
export async function POST(request: Request) {
  try {
    // Log the incoming request for debugging
    console.log(`Received transcription request to ${request.url}`);
    
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

    // Determine if we need to use an alternative approach for certain file types
    const isComplexFormat = fileExt === 'm4a' || fileExt === 'mp4';
    
    // File size and chunking notification
    const fileSizeMB = fileSize / (1024 * 1024);
    const needsChunking = fileSize > SIZE_LIMIT;
    
    // Estimate duration and cost
    const estimatedDurationMinutes = estimateAudioDuration(fileSize);
    const selectedModel = whisperModels.find(m => m.id === modelId) || whisperModels[0];
    const estimatedCost = calculateTranscriptionCost(
      estimatedDurationMinutes, 
      selectedModel.costPerMinute
    );

    console.log(`Processing file: ${originalFileName}, Size: ${fileSizeMB.toFixed(2)}MB, Estimated duration: ${estimatedDurationMinutes.toFixed(2)} minutes`);
    
    try {
      // First, fetch the audio blob from the URL
      console.log(`Fetching audio from: ${blobUrl}`);
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
      
      // For M4A or other complex formats that exceed the size limit,
      // we'll send the whole file directly to OpenAI and handle the error
      // if it's too large, rather than trying to chunk it incorrectly
      if (isComplexFormat && needsChunking) {
        console.log(`Complex format (${fileExt}) detected that requires chunking. Using special handling.`);
        return await handleComplexFormatFile(audioBlob, mimeType, originalFileName, modelId, selectedModel, estimatedDurationMinutes, estimatedCost);
      }
      
      // Regular approach for other formats or smaller files
      // Split audio into chunks if needed
      if (needsChunking) {
        console.log(`Splitting audio into chunks with size limit of ${SIZE_LIMIT / (1024 * 1024)}MB...`);
        const audioChunks = await splitAudioBlob(audioBlob);
        console.log(`Split complete. Created ${audioChunks.length} chunks.`);
        
        // Process each chunk and combine results
        const transcription = await processChunks<string>(
          audioChunks,
          async (chunk: Blob, index: number) => {
            console.log(`Processing chunk ${index + 1}/${audioChunks.length}, size: ${(chunk.size / (1024 * 1024)).toFixed(2)}MB`);
            
            try {
              // Create a valid File object for OpenAI API
              const chunkFileName = `chunk_${index + 1}_${originalFileName}`;
              const fileObject = new File([chunk], chunkFileName, { 
                type: mimeType,
                lastModified: Date.now()
              });
              
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
          (results: string[]) => {
            console.log(`Combining ${results.length} transcription chunks...`);
            return joinTranscriptions(results);
          }
        );

        console.log(`Chunked transcription complete. Length: ${transcription.length} characters`);
        
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
      } else {
        // No chunking needed, process the whole file
        console.log(`File is under size limit. Processing as single file.`);
        
        // Create a File object for OpenAI API
        const fileObject = new File([audioBlob], originalFileName, { 
          type: mimeType,
          lastModified: Date.now()
        });
        
        // Process with OpenAI Whisper
        const transcription = await withRetry(async () => {
          return await openai.audio.transcriptions.create({
            file: fileObject,
            model: modelId,
            language: 'nl',
            response_format: 'text',
          });
        }, 2, 2000);
        
        console.log(`Transcription complete. Length: ${transcription.length} characters`);
        
        return NextResponse.json({ 
          transcription,
          usage: {
            model: selectedModel.name,
            estimatedDurationMinutes,
            estimatedCost,
            chunked: false,
            chunks: 1
          }
        });
      }
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
        errorMessage = 'Audio file is too large for the API. Please use a smaller file or compress it.';
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

// Helper function to handle complex format files (like M4A)
async function handleComplexFormatFile(
  audioBlob: Blob,
  mimeType: string,
  originalFileName: string,
  modelId: string,
  selectedModel: any,
  estimatedDurationMinutes: number,
  estimatedCost: number
) {
  console.log(`Using time-based chunking for complex format.`);
  
  try {
    // For complex formats, we'll slice the file in segments and try to transcribe directly
    // This is a best-effort approach since we can't properly split M4A files without decoding
    
    // First, try the whole file - it might work if it's not too large
    try {
      console.log(`Attempting to transcribe entire file first...`);
      
      const fileObject = new File([audioBlob], originalFileName, { 
        type: mimeType,
        lastModified: Date.now()
      });
      
      const transcription = await openai.audio.transcriptions.create({
        file: fileObject,
        model: modelId,
        language: 'nl',
        response_format: 'text',
      });
      
      console.log(`Full file transcription successful!`);
      
      return NextResponse.json({ 
        transcription,
        usage: {
          model: selectedModel.name,
          estimatedDurationMinutes,
          estimatedCost,
          chunked: false,
          chunks: 1
        }
      });
    } catch (fullFileError: any) {
      // If the file is too large, we'll log the error and try our alternative approach
      console.log(`Full file approach failed:`, fullFileError.message);
      
      if (fullFileError.status !== 413 && !fullFileError.message.includes('too large')) {
        // If it's not a size issue, rethrow the error
        throw fullFileError;
      }
    }
    
    // Create binary chunks - this is not ideal for M4A but might work 
    // for some parts of the file
    console.log(`Falling back to binary chunking for complex format.`);
    const chunks: Blob[] = [];
    const chunkSize = 25 * 1024 * 1024; // 25MB max for OpenAI
    
    for (let start = 0; start < audioBlob.size; start += chunkSize) {
      const end = Math.min(start + chunkSize, audioBlob.size);
      const chunk = audioBlob.slice(start, end, mimeType);
      chunks.push(chunk);
    }
    
    console.log(`Created ${chunks.length} binary chunks`);
    
    // Try to transcribe each chunk
    let combinedTranscription = '';
    let successfulChunks = 0;
    
    for (let i = 0; i < chunks.length; i++) {
      try {
        console.log(`Processing binary chunk ${i+1}/${chunks.length}`);
        
        const chunkFile = new File([chunks[i]], `chunk_${i+1}_${originalFileName}`, {
          type: mimeType,
          lastModified: Date.now()
        });
        
        const chunkTranscription = await openai.audio.transcriptions.create({
          file: chunkFile,
          model: modelId,
          language: 'nl',
          response_format: 'text',
        });
        
        if (chunkTranscription.trim()) {
          if (combinedTranscription) combinedTranscription += '\n\n';
          combinedTranscription += chunkTranscription;
          successfulChunks++;
        }
      } catch (chunkError: any) {
        console.error(`Error processing binary chunk ${i+1}:`, chunkError.message);
        // Continue with next chunk even if this one fails
      }
    }
    
    if (!combinedTranscription) {
      throw new Error(`Failed to transcribe any part of the ${originalFileName} file. The file format may not be supported for chunking.`);
    }
    
    console.log(`Successfully transcribed ${successfulChunks} out of ${chunks.length} chunks.`);
    
    return NextResponse.json({ 
      transcription: combinedTranscription,
      usage: {
        model: selectedModel.name,
        estimatedDurationMinutes,
        estimatedCost,
        chunked: true,
        chunks: chunks.length,
        successfulChunks
      }
    });
  } catch (error: any) {
    console.error(`Complex format handling failed:`, error);
    
    // Try one more approach: split the file into equal parts without considering format
    // This is a last resort and might not work well, but it's worth trying
    return NextResponse.json(
      { 
        error: `Could not process the M4A/MP4 file. Error: ${error.message || 'Unknown error'}. 
               Try converting your file to MP3 format for better results.` 
      },
      { status: 500 }
    );
  }
}