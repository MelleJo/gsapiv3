/**
 * Utility for handling large audio files by chunking
 */

export const SIZE_LIMIT = 10 * 1024 * 1024; // 10MB in bytes

/**
 * Helper function to update the WAV header with a new data length.
 * This function updates the ChunkSize (offset 4) and Subchunk2Size (offset 40)
 * fields in the WAV header.
 * @param header A Uint8Array containing the original 44-byte WAV header.
 * @param dataLength The length of the audio data (in bytes) for the current chunk.
 * @returns A new Uint8Array with updated header fields.
 */
function updateWavHeader(header: Uint8Array, dataLength: number): Uint8Array {
  const headerCopy = header.slice(); // make a copy
  const view = new DataView(headerCopy.buffer);
  // ChunkSize at offset 4 = dataLength (current audio data) + header size (44) - 8.
  view.setUint32(4, dataLength + 44 - 8, true);
  // Subchunk2Size at offset 40 = dataLength
  view.setUint32(40, dataLength, true);
  return headerCopy;
}

/**
 * Split an audio file into smaller chunks based on size constraints.
 * For WAV files, the header (first 44 bytes) is updated for each chunk to reflect 
 * the correct data length.
 * For other formats, simple binary slicing is used (which may not produce valid audio 
 * files if headers are required).
 * @param blob The audio blob to split
 * @param sizeLimit Maximum allowed size per chunk in bytes (default 10MB)
 * @returns Array of chunks as Blob objects
 */
export async function splitAudioBlob(blob: Blob, sizeLimit = SIZE_LIMIT): Promise<Blob[]> {
  if (blob.size <= sizeLimit) {
    return [blob];
  }

  // Check if the blob is a WAV file by inspecting its MIME type.
  if (blob.type.includes('wav')) {
    const headerSize = 44;
    // Extract the header.
    const headerBlob = blob.slice(0, headerSize);
    const headerArrayBuffer = await headerBlob.arrayBuffer();
    const originalHeader = new Uint8Array(headerArrayBuffer);

    // Extract the audio data (without header).
    const dataBlob = blob.slice(headerSize);
    const dataArrayBuffer = await dataBlob.arrayBuffer();
    const dataUint8 = new Uint8Array(dataArrayBuffer);

    // Calculate the maximum size for the audio data in each chunk.
    const chunkDataSize = sizeLimit - headerSize;
    const numChunks = Math.ceil(dataUint8.length / chunkDataSize);
    const chunks: Blob[] = [];

    for (let i = 0; i < numChunks; i++) {
      const start = i * chunkDataSize;
      const end = Math.min(start + chunkDataSize, dataUint8.length);
      const chunkData = dataUint8.slice(start, end);

      // Update the header for this chunk.
      const updatedHeader = updateWavHeader(originalHeader, chunkData.length);

      // Combine the updated header with the current data chunk.
      const combined = new Uint8Array(updatedHeader.length + chunkData.length);
      combined.set(updatedHeader, 0);
      combined.set(chunkData, updatedHeader.length);

      const chunkBlob = new Blob([combined], { type: blob.type });
      chunks.push(chunkBlob);
    }
    return chunks;
  } else {
    // Fallback for non-WAV formats.
    const numChunks = Math.ceil(blob.size / sizeLimit);
    const chunks: Blob[] = [];
    const arrayBuffer = await blob.arrayBuffer();
    const uint8View = new Uint8Array(arrayBuffer);
    for (let i = 0; i < numChunks; i++) {
      const start = i * sizeLimit;
      const end = Math.min(start + sizeLimit, blob.size);
      const chunkData = uint8View.slice(start, end);
      const chunkBlob = new Blob([chunkData], { type: blob.type });
      chunks.push(chunkBlob);
    }
    return chunks;
  }
}

/**
 * Join multiple transcription texts into one.
 * Each transcription is trimmed and joined with double newlines.
 * @param transcriptions Array of transcription strings
 * @returns Combined transcription string
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
