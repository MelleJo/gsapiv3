// src/lib/audioChunker.ts

/**
 * This module provides utilities for processing large audio files
 * by splitting them into manageable chunks for transcription.
 */

// Maximum size limit for a single chunk in bytes (reduced from 25MB to 10MB for greater reliability)
export const SIZE_LIMIT = 10 * 1024 * 1024;

// Default chunk size for binary chunking (using smaller chunks to avoid timeouts)
export const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks are more reliable

// Segment size for multi-step processing
export const SEGMENT_SIZE = 5 * 1024 * 1024; // 5MB segments

// Maximum duration for processing a single chunk (in seconds)
export const CHUNK_TIMEOUT = 120; // 2 minutes per chunk, leaving buffer for 3 minute limit

/**
 * Splits an audio blob into smaller chunks based on size constraints.
 * Uses optimized binary chunking strategy for large files.
 * 
 * @param audioBlob The audio blob to split
 * @param maxChunkSize Maximum size for each chunk in bytes
 * @returns Array of audio blob chunks
 */
export async function splitAudioBlob(
  audioBlob: Blob,
  maxChunkSize: number = DEFAULT_CHUNK_SIZE
): Promise<Blob[]> {
  // For files under the size limit, return as-is
  if (audioBlob.size <= maxChunkSize) {
    console.log(`Audio blob size (${audioBlob.size} bytes) is smaller than threshold. Using as-is.`);
    return [audioBlob];
  }

  console.log(`Splitting audio blob of size ${audioBlob.size} bytes into chunks of max ${maxChunkSize} bytes`);
  
  // Adaptive chunking - use smaller chunks for very large files
  const actualChunkSize = audioBlob.size > 100 * 1024 * 1024 
    ? Math.min(maxChunkSize, 2 * 1024 * 1024) // Use 2MB chunks for files > 100MB
    : maxChunkSize;
  
  // Binary chunking - slice the blob into equal parts
  const chunks: Blob[] = [];
  let start = 0;
  
  while (start < audioBlob.size) {
    const end = Math.min(start + actualChunkSize, audioBlob.size);
    const chunk = audioBlob.slice(start, end, audioBlob.type);
    chunks.push(chunk);
    start = end;
    
    // Log progress for large files
    if (chunks.length % 5 === 0) {
      console.log(`Created ${chunks.length} chunks so far (${Math.round((start / audioBlob.size) * 100)}% complete)`);
    }
  }
  
  console.log(`Created ${chunks.length} chunks. Average chunk size: ${Math.round(audioBlob.size / chunks.length / 1024)} KB`);
  return chunks;
}

/**
 * Process an array of chunks with a given processing function and combine the results.
 * Adds better error handling and adaptive retries.
 * 
 * @param chunks Array of chunks to process
 * @param processFn Function to process each chunk
 * @param combineFn Function to combine the results
 * @param options Optional processing options
 * @returns The combined result
 */
export async function processChunks<T, R = T>(
  chunks: any[],
  processFn: (chunk: any, index: number) => Promise<T>,
  combineFn: (results: T[]) => R,
  options: {
    maxConcurrent?: number;
    retries?: number;
    delayBetweenChunks?: number;
    timeoutPerChunk?: number;
  } = {}
): Promise<R> {
  if (chunks.length === 0) {
    throw new Error('No chunks to process');
  }
  
  // Default options
  const maxConcurrent = options.maxConcurrent || 2; // Process up to 2 chunks at once by default
  const maxRetries = options.retries || 3; // Retry each chunk up to 3 times
  const delayBetweenChunks = options.delayBetweenChunks || 1000; // 1 second delay between chunks
  const timeoutPerChunk = options.timeoutPerChunk || CHUNK_TIMEOUT * 1000; // Default timeout
  
  if (chunks.length === 1) {
    // If there's only one chunk, process it directly
    const result = await processFn(chunks[0], 0);
    return combineFn([result]);
  }
  
  // Process chunks in batches with retries
  const results: T[] = [];
  const errors: Error[] = [];
  
  // Process in batches of maxConcurrent
  for (let batchStart = 0; batchStart < chunks.length; batchStart += maxConcurrent) {
    const batchEnd = Math.min(batchStart + maxConcurrent, chunks.length);
    const batch = chunks.slice(batchStart, batchEnd);
    
    console.log(`Processing batch ${batchStart / maxConcurrent + 1} (chunks ${batchStart + 1}-${batchEnd} of ${chunks.length})`);
    
    const batchPromises = batch.map(async (chunk, batchIndex) => {
      const chunkIndex = batchStart + batchIndex;
      let lastError: Error | null = null;
      
      // Try processing with retries
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          // Process with timeout
          const result = await Promise.race([
            processFn(chunk, chunkIndex),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error(`Chunk ${chunkIndex + 1} processing timed out after ${timeoutPerChunk / 1000} seconds`)), 
              timeoutPerChunk)
            )
          ]);
          
          console.log(`Successfully processed chunk ${chunkIndex + 1}/${chunks.length} (attempt ${attempt + 1})`);
          return { index: chunkIndex, result };
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.error(`Error processing chunk ${chunkIndex + 1} (attempt ${attempt + 1}):`, lastError);
          
          // If we have more retries, wait before trying again
          if (attempt < maxRetries - 1) {
            const delayMs = delayBetweenChunks * Math.pow(2, attempt); // Exponential backoff
            console.log(`Retrying chunk ${chunkIndex + 1} in ${delayMs / 1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }
      }
      
      // If we get here, all retries failed
      throw new Error(`Failed to process chunk ${chunkIndex + 1} after ${maxRetries} attempts: ${lastError?.message}`);
    });
    
    // Wait for all batch promises to settle
    const batchResults = await Promise.allSettled(batchPromises);
    
    // Process results and errors
    batchResults.forEach((result, batchIndex) => {
      const chunkIndex = batchStart + batchIndex;
      
      if (result.status === 'fulfilled') {
        // Add to results in the correct order
        results[result.value.index] = result.value.result;
      } else {
        // Add error to errors array
        errors.push(new Error(`Chunk ${chunkIndex + 1} failed: ${result.reason}`));
      }
    });
    
    // Add a delay between batches to avoid rate limiting
    if (batchEnd < chunks.length) {
      console.log(`Waiting ${delayBetweenChunks / 1000} seconds before processing next batch...`);
      await new Promise(resolve => setTimeout(resolve, delayBetweenChunks));
    }
  }
  
  // Check if we have any missing results
  const missingResults = results.findIndex(r => r === undefined);
  if (missingResults >= 0) {
    console.error(`Missing results for chunk ${missingResults + 1}`);
    throw new Error(`Failed to process all chunks. Errors: ${errors.map(e => e.message).join(', ')}`);
  }
  
  // Combine the results
  return combineFn(results);
}

/**
 * Joins multiple transcription text chunks with proper spacing.
 * Handles potential missing chunks with more graceful degradation.
 * 
 * @param transcriptions Array of text transcriptions to join
 * @returns Combined transcription text
 */
export function joinTranscriptions(transcriptions: (string | undefined | null)[]): string {
  // Filter out empty transcriptions
  const validTranscriptions = transcriptions
    .filter(t => t && typeof t === 'string' && t.trim() !== '')
    .map(t => t?.trim());
  
  if (validTranscriptions.length === 0) {
    return '';
  }
  
  if (validTranscriptions.length < transcriptions.length) {
    console.warn(`Warning: ${transcriptions.length - validTranscriptions.length} chunks were empty or invalid`);
  }
  
  // Join transcriptions with double newline for paragraph separation
  return validTranscriptions.join('\n\n');
}

/**
 * Returns a human-readable size string from bytes
 * @param bytes Size in bytes
 * @returns Formatted size string (e.g., "5.2 MB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}