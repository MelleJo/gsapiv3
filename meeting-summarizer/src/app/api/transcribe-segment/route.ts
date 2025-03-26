// src/app/api/transcribe-segment/route.ts
import { NextResponse } from 'next/server';
import openai from '@/lib/openai';
import { formatBytes } from '@/lib/enhancedAudioChunker';

export const runtime = 'edge';
export const maxDuration = 60; // 60 seconds per segment for better reliability

// Enhanced timeout wrapper with retry capability
const withTimeoutAndRetry = async <T>(
  operation: () => Promise<T>, 
  options: {
    timeoutMs: number, 
    retries: number,
    retryDelayMs: number,
    operationName: string,
    shouldRetry?: (error: any) => boolean
  }
): Promise<T> => {
  let lastError: any;
  
  // Custom should retry function
  const defaultShouldRetry = (error: any) => {
    const errorMsg = error?.message || String(error);
    return (
      errorMsg.includes('timeout') || 
      errorMsg.includes('aborted') || 
      errorMsg.includes('network') ||
      errorMsg.includes('ECONNRESET') ||
      errorMsg.includes('ETIMEDOUT')
    );
  };
  
  const shouldRetry = options.shouldRetry || defaultShouldRetry;
  
  for (let attempt = 0; attempt <= options.retries; attempt++) {
    try {
      // Create abort controller for this attempt
      const controller = new AbortController();
      const signal = controller.signal;
      
      // Set timeout
      const timeoutId = setTimeout(() => {
        controller.abort(new Error(`Operation '${options.operationName}' timed out after ${options.timeoutMs}ms`));
      }, options.timeoutMs);
      
      // Track attempt for logging
      const attemptInfo = attempt > 0 ? ` (Attempt ${attempt + 1}/${options.retries + 1})` : '';
      console.log(`Executing ${options.operationName}${attemptInfo} with ${options.timeoutMs}ms timeout`);
      
      // For OpenAI calls we can't directly pass the AbortSignal, so we use Promise.race
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          signal.addEventListener('abort', () => {
            reject(signal.reason);
          });
        })
      ]);
      
      // Clear timeout if successful
      clearTimeout(timeoutId);
      return result;
      
    } catch (error: any) {
      lastError = error;
      
      // Log the error
      console.error(`Error in ${options.operationName} (Attempt ${attempt + 1}/${options.retries + 1}):`, error);
      
      // Check if we should retry
      if (attempt < options.retries && shouldRetry(error)) {
        // Wait before retrying with exponential backoff
        const delay = options.retryDelayMs * Math.pow(1.5, attempt);
        console.log(`Retrying ${options.operationName} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Out of retries or not retryable
      throw error;
    }
  }
  
  // This should never happen as we either return or throw above
  throw lastError || new Error(`Unexpected error in ${options.operationName}`);
};

/**
 * API endpoint for transcribing a single audio segment
 * Enhanced with better timeout handling and retries
 */
export async function POST(request: Request) {
  try {
    console.log('Received segment transcription request');
    
    // Parse request with timeout (rare, but possible to hang)
    const body = await withTimeoutAndRetry(
      async () => await request.json(),
      { 
        timeoutMs: 5000, 
        retries: 1, 
        retryDelayMs: 1000, 
        operationName: 'request parsing' 
      }
    );
    
    // Required parameters
    const blobUrl = body.blobUrl;
    const segmentId = body.segmentId ?? 0;
    const modelId = body.model || 'whisper-1';
    const attempt = body.attempt || 1;
    
    console.log(`Processing segment ${segmentId}, attempt ${attempt}`);
    
    // Validate inputs
    if (!blobUrl) {
      return NextResponse.json(
        { error: 'No blob URL provided for the segment', segmentId },
        { status: 400 }
      );
    }

    // Add cache-busting parameter to URL
    const blobUrlWithTimestamp = new URL(blobUrl);
    blobUrlWithTimestamp.searchParams.append('t', Date.now().toString());
    
    // Fetch the audio segment from blob storage with advanced timeout and retry
    console.log(`Fetching segment ${segmentId} from blob URL`);
    const audioResponse = await withTimeoutAndRetry(
      async () => {
        // First do a HEAD request to check if blob is available
        const headResponse = await fetch(blobUrlWithTimestamp.toString(), { 
          method: 'HEAD',
          // No need to pass signal - withTimeoutAndRetry will handle timeout
        });
        
        if (!headResponse.ok) {
          throw new Error(`Blob not accessible: status ${headResponse.status}`);
        }
        
        // Then fetch the actual blob
        return fetch(blobUrlWithTimestamp.toString());
      },
      { 
        timeoutMs: 20000, // 20 second timeout for fetch
        retries: 2, // Try up to 3 times total
        retryDelayMs: 2000, // Start with 2 second delay
        operationName: `fetching segment ${segmentId}` 
      }
    );
    
    // Get blob from response
    const segmentBlob = await audioResponse.blob();
    console.log(`Segment ${segmentId} fetched: ${formatBytes(segmentBlob.size)}`);
    
    // Validate segment size - reject if too large
    if (segmentBlob.size > 20 * 1024 * 1024) { // 20MB max for whisper API
      throw new Error(`Segment ${segmentId} is too large (${formatBytes(segmentBlob.size)}). Maximum size is 20MB.`);
    }
    
    // Create a File object for OpenAI API
    const fileObject = new File([segmentBlob], `segment_${segmentId}_${Date.now()}.mp3`, { 
      type: 'audio/mpeg',
      lastModified: Date.now()
    });
    
    // Process with OpenAI Whisper with advanced timeout and retry
    console.log(`Transcribing segment ${segmentId} with model ${modelId}`);
    
    // Determine timeout based on file size (larger files need more time)
    const transcriptionTimeout = Math.min(
      45000, // Cap at 45 seconds max
      15000 + (segmentBlob.size / (1024 * 1024)) * 1000 // 15s + 1s per MB
    );
    
    const transcription = await withTimeoutAndRetry(
      async () => {
        const result = await openai.audio.transcriptions.create({
          file: fileObject,
          model: modelId,
          language: 'nl',
          response_format: 'text',
        });
        return result;
      }, 
      { 
        timeoutMs: transcriptionTimeout,
        retries: 1, // Only retry once for OpenAI API calls to avoid excessive billing
        retryDelayMs: 3000,
        operationName: `transcribing segment ${segmentId}`,
        shouldRetry: (error) => {
          // Custom retry logic for OpenAI errors
          const errorMsg = error?.message || String(error);
          return (
            errorMsg.includes('timeout') || 
            errorMsg.includes('rate limit') ||
            errorMsg.includes('server error') ||
            errorMsg.includes('5') // 5xx errors
          );
        }
      }
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
    const statusCode = determineStatusCode(error);
    const segmentId = error.segmentId ?? 0;
    
    // Provide a more specific error message for common failures
    let enhancedErrorMessage = enhanceErrorMessage(errorMessage);
    
    return NextResponse.json(
      { 
        error: enhancedErrorMessage,
        segmentId: segmentId,
        retryable: isRetryableError(errorMessage)
      },
      { status: statusCode }
    );
  }
}

// Helper function to enhance error messages for better diagnosis
function enhanceErrorMessage(errorMessage: string): string {
  if (errorMessage.includes('too large')) {
    return `Audio segment is too large. Maximum size is 20MB.`;
  } else if (errorMessage.includes('timeout')) {
    return `Timeout processing audio segment. The segment may be too long or the service is experiencing high load.`;
  } else if (errorMessage.includes('rate limit')) {
    return `OpenAI API rate limit reached. Please try again in a few moments.`;
  } else if (errorMessage.includes('blob') && (errorMessage.includes('not found') || errorMessage.includes('not accessible'))) {
    return `Audio segment could not be accessed. The file may have been deleted or is temporarily unavailable.`;
  } else if (errorMessage.includes('fetch')) {
    return `Network error while accessing audio segment. Please check your connection and try again.`;
  }
  
  return errorMessage;
}

// Helper function to determine appropriate status code
function determineStatusCode(error: any): number {
  // Extract status code if it exists
  if (error.status && typeof error.status === 'number') {
    return error.status;
  }
  
  const errorMsg = error.message || String(error);
  
  if (errorMsg.includes('not found') || errorMsg.includes('404')) {
    return 404;
  } else if (errorMsg.includes('rate limit') || errorMsg.includes('429')) {
    return 429;
  } else if (errorMsg.includes('timeout') || errorMsg.includes('aborted')) {
    return 408;
  } else if (errorMsg.includes('too large')) {
    return 413;
  } else if (errorMsg.includes('bad request') || errorMsg.includes('invalid')) {
    return 400;
  }
  
  // Default to 500 for unknown errors
  return 500;
}

// Helper function to determine if an error is retryable
function isRetryableError(errorMessage: string): boolean {
  return (
    errorMessage.includes('timeout') ||
    errorMessage.includes('aborted') ||
    errorMessage.includes('rate limit') ||
    errorMessage.includes('429') ||
    errorMessage.includes('5') || // 5xx server errors
    errorMessage.includes('network') ||
    errorMessage.includes('connection') ||
    errorMessage.includes('temporary')
  );
}
