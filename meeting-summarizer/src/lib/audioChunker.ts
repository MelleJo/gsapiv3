/**
 * Utility for handling large audio files by chunking
 */

import { NextResponse } from 'next/server';

// Maximum size for OpenAI transcription (25MB)
export const MAX_CHUNK_SIZE = 25 * 1024 * 1024; // 25MB in bytes

/**
 * Split an audio file into smaller chunks
 * @param blob The audio blob to split
 * @param maxChunkSize Maximum size of each chunk in bytes
 * @returns Array of chunks as Blob objects
 */
export async function splitAudioBlob(blob: Blob, maxChunkSize = MAX_CHUNK_SIZE): Promise<Blob[]> {
  // If file is already small enough, return as is
  if (blob.size <= maxChunkSize) {
    return [blob];
  }

  // Calculate how many chunks we'll need
  const numChunks = Math.ceil(blob.size / maxChunkSize);
  const chunks: Blob[] = [];

  // Use array buffer for binary manipulation
  const arrayBuffer = await blob.arrayBuffer();
  const view = new Uint8Array(arrayBuffer);
  
  for (let i = 0; i < numChunks; i++) {
    const start = i * maxChunkSize;
    const end = Math.min(start + maxChunkSize, blob.size);
    
    // Extract chunk from the array buffer
    const chunkData = view.slice(start, end);
    
    // Create a new blob with the same type as the original
    const chunkBlob = new Blob([chunkData], { type: blob.type });
    chunks.push(chunkBlob);
  }

  return chunks;
}

/**
 * Join multiple transcription texts into one
 * @param transcriptions Array of transcription strings
 * @returns Combined transcription
 */
export function joinTranscriptions(transcriptions: string[]): string {
  // Simple join with double newlines between chunks
  return transcriptions
    .map(t => t.trim())
    .filter(t => t)
    .join('\n\n');
}

/**
 * Process multiple audio chunks with a processing function
 * @param chunks Array of audio chunks
 * @param processFn Function to process each chunk
 * @returns Combined result
 */
export async function processChunks<T>(
  chunks: Blob[], 
  processFn: (chunk: Blob, index: number) => Promise<T>,
  combiner: (results: T[]) => T
): Promise<T> {
  if (chunks.length === 0) {
    throw new Error('No chunks to process');
  }
  
  if (chunks.length === 1) {
    return await processFn(chunks[0], 0);
  }
  
  // Process each chunk sequentially
  const results: T[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    try {
      const result = await processFn(chunks[i], i);
      results.push(result);
    } catch (error) {
      console.error(`Error processing chunk ${i}:`, error);
      throw error;
    }
  }
  
  // Combine results
  return combiner(results);
}
