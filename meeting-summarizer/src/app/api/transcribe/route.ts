// src/app/api/transcribe/route.ts
import { NextResponse } from 'next/server';
import openai from '@/lib/openai';
import { whisperModels } from '@/lib/config';
import { estimateAudioDuration, calculateTranscriptionCost } from '@/lib/tokenCounter';
import { SIZE_LIMIT, splitAudioBlob, joinTranscriptions, processChunks } from '@/lib/audioChunker';
export const runtime = 'edge';
export const maxDuration = 300; // 5 minutes max execution time

// Configure timeout for fetch operations
const FETCH_TIMEOUT = 240000; // 4 minutes

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

    // File size notification
    const fileSizeMB = fileSize / (1024 * 1024);
    
    // Estimate duration and cost
    const estimatedDurationMinutes = estimateAudioDuration(fileSize);
    const selectedModel = whisperModels.find(m => m.id === modelId) || whisperModels[0];
    const estimatedCost = calculateTranscriptionCost(
      estimatedDurationMinutes, 
      selectedModel.costPerMinute
    );

    console.log(`Processing file: ${originalFileName}, Size: ${fileSizeMB.toFixed(2)}MB, Estimated duration: ${estimatedDurationMinutes.toFixed(2)} minutes`);
    
    try {
      // Fetch the audio blob from the URL
      console.log(`Fetching audio from: ${blobUrl}`);
      const audioResponse = await withTimeout(
        fetch(blobUrl), 
        FETCH_TIMEOUT, 
        'Timeout exceeded while fetching audio file. Please try again.'
      );
      
      if (!audioResponse.ok) {
        throw new Error(`Error fetching audio file: ${audioResponse.status} ${audioResponse.statusText}`);
      }
      
      const originalBlob = await audioResponse.blob();
      console.log(`Audio blob fetched. Size: ${(originalBlob.size / (1024 * 1024)).toFixed(2)}MB, Type: ${fileType}`);

      // Process the MP3 file
      const audioBlob = originalBlob;
      console.log(`Processing audio. Size: ${(audioBlob.size / (1024 * 1024)).toFixed(2)}MB`);

      // Always split into chunks for better reliability
      if (true) { // Force chunking for all files
        console.log(`Splitting audio into chunks with size limit of ${SIZE_LIMIT / (1024 * 1024)}MB...`);
        const audioChunks = await splitAudioBlob(audioBlob, 2 * 1024 * 1024); // Use 2MB chunks for better reliability
        console.log(`Split complete. Created ${audioChunks.length} chunks.`);
        
        // Process chunks in parallel with a limit
        const PARALLEL_LIMIT = 3; // Process 3 chunks at a time
        const results: string[] = [];
        
        for (let i = 0; i < audioChunks.length; i += PARALLEL_LIMIT) {
          const chunkGroup = audioChunks.slice(i, i + PARALLEL_LIMIT);
          const groupPromises = chunkGroup.map(async (chunk, groupIndex) => {
            const index = i + groupIndex;
            console.log(`Processing chunk ${index + 1}/${audioChunks.length}, size: ${(chunk.size / (1024 * 1024)).toFixed(2)}MB`);
            
            try {
              // Create a valid File object for OpenAI API
              const chunkFileName = `chunk_${index + 1}_${originalFileName}`;
              const fileObject = new File([chunk], chunkFileName, { 
                type: 'audio/mpeg', // Always MP3 after conversion
                lastModified: Date.now()
              });
              
              // Process with OpenAI Whisper with retries
              const result = await withRetry(async () => {
                return await openai.audio.transcriptions.create({
                  file: fileObject,
                  model: modelId,
                  language: 'nl',
                  response_format: 'text',
                });
              }, 3, 2000); // 3 retries, 2 second initial delay
              
              console.log(`Successfully transcribed chunk ${index + 1}/${audioChunks.length}`);
              return result;
            } catch (error: any) {
              console.error(`Error processing chunk ${index + 1}/${audioChunks.length}:`, error);
              
              // Provide more detailed error information
              const errorMessage = error.message || 'Unknown error';
              const statusCode = error.status || 500;
              throw new Error(`Failed to process chunk ${index + 1}/${audioChunks.length}: ${errorMessage} (${statusCode})`);
            }
          });

          // Process group in parallel
          const groupResults = await Promise.all(groupPromises);
          results.push(...groupResults);
          
          // Add a longer delay between groups to avoid rate limits
          if (i + PARALLEL_LIMIT < audioChunks.length) {
            console.log('Waiting between chunk groups to avoid rate limits...');
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }

        // Combine all results
        console.log(`Combining ${results.length} transcription chunks...`);
        const transcription = joinTranscriptions(results);

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
          type: 'audio/mpeg', // Always MP3 after conversion
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
      
      if (processingError.message?.includes('FFmpeg')) {
        errorMessage = `Audio conversion failed: ${processingError.message}. Please ensure the file is a valid audio file.`;
      } else if (processingError.message?.includes('timeout') || processingError.message?.includes('Timeout')) {
        errorMessage = processingError.message;
        statusCode = 408; // Request Timeout
      } else if (processingError.message?.includes('chunk')) {
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
      } else if (processingError.status === 504 || processingError.message?.includes('timeout')) {
        errorMessage = 'Processing timed out. The file might be too long or the server is busy. Please try again.';
        statusCode = 504;
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
