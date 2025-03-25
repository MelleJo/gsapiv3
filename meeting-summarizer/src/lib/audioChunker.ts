// src/lib/audioChunker.ts

/**
 * This module provides utilities for processing large audio files
 * by splitting them into manageable chunks for transcription.
 */

// Maximum size limit for a single chunk in bytes (25MB for OpenAI's API)
export const SIZE_LIMIT = 25 * 1024 * 1024;

// Default chunk size for binary chunking (slightly under the limit)
export const DEFAULT_CHUNK_SIZE = 24 * 1024 * 1024;

// Maximum duration for processing a single chunk (in seconds)
export const CHUNK_TIMEOUT = 240; // 4 minutes, leaving 1 minute buffer for the 5-minute limit

/**
 * Splits an audio blob into smaller chunks based on size constraints.
 * Currently uses simple binary chunking strategy.
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
    return [audioBlob];
  }

  console.log(`Splitting audio blob of size ${audioBlob.size} bytes into chunks of max ${maxChunkSize} bytes`);
  
  // Simple binary chunking - slice the blob into roughly equal parts
  const chunks: Blob[] = [];
  for (let start = 0; start < audioBlob.size; start += maxChunkSize) {
    const end = Math.min(start + maxChunkSize, audioBlob.size);
    const chunk = audioBlob.slice(start, end, audioBlob.type);
    chunks.push(chunk);
  }
  
  console.log(`Created ${chunks.length} chunks`);
  return chunks;
}

/**
 * Process an array of chunks with a given processing function and combine the results.
 * 
 * @param chunks Array of chunks to process
 * @param processFn Function to process each chunk
 * @param combineFn Function to combine the results
 * @returns The combined result
 */
export async function processChunks<T, R = T>(
  chunks: any[],
  processFn: (chunk: any, index: number) => Promise<T>,
  combineFn: (results: T[]) => R
): Promise<R> {
  if (chunks.length === 0) {
    throw new Error('No chunks to process');
  }
  
  if (chunks.length === 1) {
    // If there's only one chunk, process it directly
    const result = await processFn(chunks[0], 0);
    return combineFn([result]);
  }
  
  // Process chunks with timeout and retries
  const results: T[] = [];
  for (let i = 0; i < chunks.length; i++) {
    try {
      const result = await Promise.race([
        processFn(chunks[i], i),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error(`Chunk ${i + 1} processing timed out after ${CHUNK_TIMEOUT} seconds`)), 
          CHUNK_TIMEOUT * 1000)
        )
      ]);
      results.push(result);
      // Add a small delay between chunks to avoid rate limiting
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`Error processing chunk ${i + 1}:`, error);
      throw error;
    }
  }
  
  // Combine the results
  return combineFn(results);
}

/**
 * Joins multiple transcription text chunks with proper spacing.
 * 
 * @param transcriptions Array of text transcriptions to join
 * @returns Combined transcription text
 */
export function joinTranscriptions(transcriptions: string[]): string {
  // Filter out empty transcriptions
  const validTranscriptions = transcriptions.filter(t => t && t.trim());
  
  if (validTranscriptions.length === 0) {
    return '';
  }
  
  // Join transcriptions with double newline for paragraph separation
  return validTranscriptions.join('\n\n');
}
