/**
 * Utility for handling large audio files by chunking
 */

 // New limits: 10MB per chunk and 300 seconds maximum duration per chunk
export const SIZE_LIMIT = 10 * 1024 * 1024; // 10MB in bytes
export const DURATION_LIMIT = 300; // 300 seconds

/**
 * Helper function to get the duration of an audio blob.
 * This uses an Audio element to load metadata and return the duration in seconds.
 * @param blob The audio blob
 * @returns Promise resolving to the duration in seconds
 */
async function getAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.addEventListener('loadedmetadata', () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    });
    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load audio metadata"));
    });
  });
}

/**
 * Split an audio file into smaller chunks based on size and duration constraints.
 * Uses both maximum file size (default 10MB) and maximum duration (default 300 seconds)
 * to determine an effective chunk size.
 * @param blob The audio blob to split
 * @param sizeLimit Maximum allowed size per chunk in bytes (default 10MB)
 * @param durationLimit Maximum allowed duration per chunk in seconds (default 300)
 * @returns Array of chunks as Blob objects
 */
export async function splitAudioBlob(blob: Blob, sizeLimit = SIZE_LIMIT, durationLimit = DURATION_LIMIT): Promise<Blob[]> {
  let totalDuration: number | null = null;
  try {
    totalDuration = await getAudioDuration(blob);
  } catch (e) {
    console.error('Could not determine audio duration, proceeding with size-based splitting.', e);
  }
  
  // Determine effective chunk size based on both size and duration constraints.
  // If the audio duration exceeds the allowed limit, compute the corresponding byte size.
  let effectiveChunkSize = sizeLimit;
  if (totalDuration && totalDuration > durationLimit) {
    const sizeBasedOnDuration = (blob.size / totalDuration) * durationLimit;
    effectiveChunkSize = Math.min(sizeLimit, sizeBasedOnDuration);
  }
  
  // If the blob is already within the effective chunk limit, return it as is.
  if (blob.size <= effectiveChunkSize) {
    return [blob];
  }
  
  const numChunks = Math.ceil(blob.size / effectiveChunkSize);
  const chunks: Blob[] = [];
  
  // Convert blob to array buffer for binary slicing.
  const arrayBuffer = await blob.arrayBuffer();
  const view = new Uint8Array(arrayBuffer);
  
  for (let i = 0; i < numChunks; i++) {
    const start = i * effectiveChunkSize;
    const end = Math.min(start + effectiveChunkSize, blob.size);
    const chunkData = view.slice(start, end);
    const chunkBlob = new Blob([chunkData], { type: blob.type });
    chunks.push(chunkBlob);
  }
  
  return chunks;
}

/**
 * Join multiple transcription texts into one.
 * Chunks are joined with double newlines.
 * @param transcriptions Array of transcription strings
 * @returns Combined transcription
 */
export function joinTranscriptions(transcriptions: string[]): string {
  return transcriptions
    .map(t => t.trim())
    .filter(t => t)
    .join('\n\n');
}

/**
 * Process multiple audio chunks sequentially with a provided processing function.
 * Combines the results using the provided combiner function.
 * @param chunks Array of audio chunks
 * @param processFn Function to process each chunk
 * @param combiner Function to combine the results of each chunk processing
 * @returns Combined result of type T
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
  
  return combiner(results);
}
