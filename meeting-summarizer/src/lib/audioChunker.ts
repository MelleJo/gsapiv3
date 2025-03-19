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
  console.log(`Starting to split audio blob of size ${blob.size} bytes with limit ${sizeLimit} bytes`);
  
  // If already below size limit, return as is
  if (blob.size <= sizeLimit) {
    console.log(`Blob size ${blob.size} is already below limit ${sizeLimit}, returning as single chunk`);
    return [blob];
  }

  // Check if the blob is a WAV file by inspecting its MIME type or name pattern
  const isWav = blob.type.toLowerCase().includes('wav') || 
                blob.type.toLowerCase().includes('wave') ||
                (blob as any).name?.toLowerCase().endsWith('.wav');
  
  console.log(`Detected audio format: ${isWav ? 'WAV' : 'non-WAV'} (${blob.type})`);
  
  if (isWav) {
    console.log('Using WAV-specific chunking method with header preservation');
    try {
      const headerSize = 44; // Standard WAV header size
      
      // Extract the header
      const headerBlob = blob.slice(0, headerSize);
      const headerArrayBuffer = await headerBlob.arrayBuffer();
      const originalHeader = new Uint8Array(headerArrayBuffer);

      // Extract the audio data (without header)
      const dataBlob = blob.slice(headerSize);
      const dataArrayBuffer = await dataBlob.arrayBuffer();
      const dataUint8 = new Uint8Array(dataArrayBuffer);

      // Calculate the maximum size for the audio data in each chunk
      const chunkDataSize = sizeLimit - headerSize;
      const numChunks = Math.ceil(dataUint8.length / chunkDataSize);
      console.log(`Creating ${numChunks} WAV chunks with data size ${chunkDataSize} bytes each`);
      
      const chunks: Blob[] = [];

      for (let i = 0; i < numChunks; i++) {
        const start = i * chunkDataSize;
        const end = Math.min(start + chunkDataSize, dataUint8.length);
        const chunkData = dataUint8.slice(start, end);

        // Update the header for this chunk
        const updatedHeader = updateWavHeader(originalHeader, chunkData.length);

        // Combine the updated header with the current data chunk
        const combined = new Uint8Array(updatedHeader.length + chunkData.length);
        combined.set(updatedHeader, 0);
        combined.set(chunkData, updatedHeader.length);

        const chunkBlob = new Blob([combined], { type: blob.type || 'audio/wav' });
        chunks.push(chunkBlob);
        
        console.log(`Created WAV chunk ${i+1}/${numChunks}: ${chunkBlob.size} bytes`);
      }
      
      return chunks;
    } catch (error) {
      console.error('Error during WAV chunking:', error);
      console.log('Falling back to binary chunking method');
      // Fall back to binary chunking if WAV processing fails
    }
  }
  
  // For non-WAV formats or if WAV processing failed, use binary chunking
  console.log('Using binary chunking method');
  
  try {
    const numChunks = Math.ceil(blob.size / sizeLimit);
    console.log(`Creating ${numChunks} binary chunks of max ${sizeLimit} bytes each`);
    
    const chunks: Blob[] = [];
    const arrayBuffer = await blob.arrayBuffer();
    const uint8View = new Uint8Array(arrayBuffer);
    
    for (let i = 0; i < numChunks; i++) {
      const start = i * sizeLimit;
      const end = Math.min(start + sizeLimit, blob.size);
      const chunkData = uint8View.slice(start, end);
      
      // Keep the original MIME type
      const chunkBlob = new Blob([chunkData], { type: blob.type || 'audio/mpeg' });
      chunks.push(chunkBlob);
      
      console.log(`Created binary chunk ${i+1}/${numChunks}: ${chunkBlob.size} bytes`);
    }
    
    return chunks;
  } catch (error) {
    console.error('Error during binary chunking:', error);
    throw new Error(`Failed to split audio: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Join multiple transcription texts into one.
 * Each transcription is trimmed and joined with double newlines.
 * @param transcriptions Array of transcription strings
 * @returns Combined transcription string
 */
export function joinTranscriptions(transcriptions: string[]): string {
  console.log(`Joining ${transcriptions.length} transcription segments`);
  
  // Filter out empty transcriptions and join with double newlines
  const result = transcriptions
    .map(t => t?.trim() || '')
    .filter(t => t)
    .join('\n\n');
  
  console.log(`Joined transcription length: ${result.length} characters`);
  return result;
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
    console.log('Processing single chunk');
    return await processFn(chunks[0], 0);
  }
  
  console.log(`Processing ${chunks.length} chunks sequentially`);
  const results: T[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    try {
      console.log(`Starting processing of chunk ${i+1}/${chunks.length}`);
      const result = await processFn(chunks[i], i);
      results.push(result);
      console.log(`Successfully processed chunk ${i+1}/${chunks.length}`);
    } catch (error) {
      console.error(`Error processing chunk ${i+1}/${chunks.length}:`, error);
      throw error;
    }
  }
  
  console.log(`All ${chunks.length} chunks processed, combining results`);
  return combiner(results);
}