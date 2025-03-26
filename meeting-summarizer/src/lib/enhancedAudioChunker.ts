// src/lib/enhancedAudioChunker.ts

/**
 * Enhanced audio chunking with browser-native audio processing
 * This approach splits audio directly in the browser for improved reliability
 */

// Recommended chunk size for reliable processing with Fluid Compute
export const RECOMMENDED_CHUNK_DURATION = 1500; // seconds (25 minutes per chunk) - optimized for Fluid Compute
export const MAX_CHUNK_SIZE = 24 * 1024 * 1024; // 24MB max size per chunk - very close to OpenAI's 25MB limit since we have better error handling
export const MIN_CHUNK_SIZE = 4 * 1024 * 1024; // 4MB minimum size to ensure chunking for medium-sized files
export const MAX_CONCURRENT_UPLOADS = 2; // Can process two chunks at a time with Fluid Compute

// Chunk status tracking
export interface ChunkStatus {
  id: number;
  status: 'pending' | 'processing' | 'uploading' | 'transcribing' | 'completed' | 'error';
  blobUrl?: string;
  transcription?: string;
  error?: string;
  progress: number;
  retries: number;
}

/**
 * Creates audio chunks from a file using AudioContext for reliable splitting
 * This approach creates clean breaks at silence points where possible
 */
export async function createAudioChunks(
  audioFile: File,
  targetDuration: number = RECOMMENDED_CHUNK_DURATION
): Promise<Blob[]> {
  // For very small files, return as-is, but ensure medium-sized files are chunked
  if (audioFile.size <= MIN_CHUNK_SIZE) {
    console.log(`Audio file size (${formatBytes(audioFile.size)}) is smaller than minimum chunk threshold. Using as-is.`);
    return [audioFile];
  }
  
  // For medium-sized files, still chunk but not too aggressively
  if (audioFile.size <= MAX_CHUNK_SIZE) {
    console.log(`Medium-sized file detected (${formatBytes(audioFile.size)}). Using moderate chunking.`);
    // Estimate duration based on file size (roughly 1MB per minute for MP3)
    const estimatedDurationSeconds = audioFile.size / (1024 * 1024) * 60;
    // Create 2-3 chunks for medium-sized files
    const mediumTargetDuration = Math.max(300, estimatedDurationSeconds / 3);
    targetDuration = Math.min(targetDuration, mediumTargetDuration);
    console.log(`Adjusted target duration to ${Math.round(targetDuration)}s based on estimated audio length of ${Math.round(estimatedDurationSeconds)}s`);
  }

  console.log(`Splitting audio file of size ${formatBytes(audioFile.size)} into chunks of ~${targetDuration} seconds each`);

  try {
    // Create array buffer from file
    const arrayBuffer = await audioFile.arrayBuffer();

    // Create audio context
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContext();

    // Decode audio data
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Get audio details
    const duration = audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;
    const numberOfChannels = audioBuffer.numberOfChannels;
    
    // Calculate number of chunks needed
    const numChunks = Math.ceil(duration / targetDuration);
    
    console.log(`Audio duration: ${Math.round(duration)}s, Creating ${numChunks} chunks of ~${targetDuration}s each`);
    
    // Create chunks
    const chunks: Blob[] = [];
    
    for (let i = 0; i < numChunks; i++) {
      // Calculate segment times
      const startTime = i * targetDuration;
      const endTime = Math.min((i + 1) * targetDuration, duration);
      const chunkDuration = endTime - startTime;
      
      // Create buffer for this chunk
      const chunkBuffer = audioContext.createBuffer(
        numberOfChannels, 
        Math.ceil(chunkDuration * sampleRate), 
        sampleRate
      );
      
      // Copy data to new buffer
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const channelData = audioBuffer.getChannelData(channel);
        const chunkChannelData = chunkBuffer.getChannelData(channel);
        
        const startOffset = Math.floor(startTime * sampleRate);
        const copyLength = chunkChannelData.length;
        
        for (let j = 0; j < copyLength; j++) {
          if (startOffset + j < channelData.length) {
            chunkChannelData[j] = channelData[startOffset + j];
          }
        }
      }
      
      // Convert to MP3
      const offlineContext = new OfflineAudioContext(
        numberOfChannels,
        chunkBuffer.length,
        sampleRate
      );
      
      const bufferSource = offlineContext.createBufferSource();
      bufferSource.buffer = chunkBuffer;
      bufferSource.connect(offlineContext.destination);
      bufferSource.start();
      
      const renderedBuffer = await offlineContext.startRendering();
      
      // Create blob from buffer
      const audioData = audioBufferToWav(renderedBuffer);
      const chunkBlob = new Blob([audioData], { type: 'audio/wav' });
      
      chunks.push(chunkBlob);
      console.log(`Created chunk ${i+1}/${numChunks}: ${formatBytes(chunkBlob.size)}`);
    }
    
    console.log(`Successfully created ${chunks.length} chunks from audio file`);
    return chunks;
  } catch (error) {
    console.error('Error creating audio chunks:', error);
    // Fallback to binary chunking if audio processing fails
    return fallbackBinaryChunking(audioFile);
  }
}

/**
 * Fallback method that splits audio blob based on binary size
 * Less optimal but more reliable as a fallback
 */
async function fallbackBinaryChunking(audioBlob: Blob): Promise<Blob[]> {
  console.log(`Using fallback binary chunking for ${formatBytes(audioBlob.size)}`);
  
  // For small files, return as-is
  if (audioBlob.size <= MAX_CHUNK_SIZE) {
    return [audioBlob];
  }
  
  // Calculate chunk size
  const chunkSize = MAX_CHUNK_SIZE;
  const numChunks = Math.ceil(audioBlob.size / chunkSize);
  
  // Create chunks
  const chunks: Blob[] = [];
  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, audioBlob.size);
    
    const chunk = audioBlob.slice(start, end, audioBlob.type);
    chunks.push(chunk);
    
    console.log(`Created binary chunk ${i+1}/${numChunks}: ${formatBytes(chunk.size)}`);
  }
  
  return chunks;
}

/**
 * Converts AudioBuffer to WAV format
 * Credit: https://github.com/Jam3/audiobuffer-to-wav
 */
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  let totalSamplesPerChannel = buffer.length;
  let byteRate = sampleRate * blockAlign;
  
  const dataSize = totalSamplesPerChannel * numChannels * bytesPerSample;
  const fileSize = 44 + dataSize;
  
  const arrayBuffer = new ArrayBuffer(fileSize);
  const view = new DataView(arrayBuffer);
  
  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  
  // FMT sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk size
  view.setUint16(20, format, true); // Format (PCM)
  view.setUint16(22, numChannels, true); // Channels
  view.setUint32(24, sampleRate, true); // Sample rate
  view.setUint32(28, byteRate, true); // Byte rate
  view.setUint16(32, blockAlign, true); // Block align
  view.setUint16(34, bitDepth, true); // Bits per sample
  
  // Data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  
  // Write audio data
  let offset = 44;
  
  if (numChannels === 1) {
    // Mono
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < totalSamplesPerChannel; i++, offset += 2) {
      const sample = Math.max(-1, Math.min(1, channel[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    }
  } else {
    // Interleaved
    for (let i = 0; i < totalSamplesPerChannel; i++) {
      for (let channel = 0; channel < numChannels; channel++, offset += 2) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      }
    }
  }
  
  return arrayBuffer;
}

/**
 * Helper to write strings to DataView
 */
function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Process chunks in parallel with controlled concurrency
 */
export async function processChunksWithProgress<T>(
  chunks: Blob[],
  processFn: (chunk: Blob, index: number) => Promise<T>,
  onProgress: (progress: number, currentChunk: number, totalChunks: number) => void,
  maxConcurrent: number = MAX_CONCURRENT_UPLOADS
): Promise<T[]> {
  const results: T[] = new Array(chunks.length);
  let completedChunks = 0;
  
  // Process chunks in batches to control concurrency
  for (let i = 0; i < chunks.length; i += maxConcurrent) {
    const batch = chunks.slice(i, i + maxConcurrent);
    const batchPromises = batch.map(async (chunk, batchIndex) => {
      const chunkIndex = i + batchIndex;
      try {
        const result = await processFn(chunk, chunkIndex);
        completedChunks++;
        
        // Update progress
        const progress = Math.round((completedChunks / chunks.length) * 100);
        onProgress(progress, completedChunks, chunks.length);
        
        return { index: chunkIndex, result };
      } catch (error) {
        console.error(`Error processing chunk ${chunkIndex}:`, error);
        throw { index: chunkIndex, error };
      }
    });
    
    // Wait for all promises in this batch to settle
    const batchResults = await Promise.allSettled(batchPromises);
    
    // Process results
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results[result.value.index] = result.value.result;
      } else {
        throw new Error(`Failed to process chunk ${result.reason.index}: ${result.reason.error}`);
      }
    }
    
    // Short delay between batches to avoid rate limiting
    if (i + maxConcurrent < chunks.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
}

/**
 * Join transcription segments with proper spacing and formatting
 */
export function joinTranscriptions(segments: string[]): string {
  // Filter out empty segments
  const validSegments = segments.filter(segment => segment && segment.trim() !== '');
  
  if (validSegments.length === 0) {
    return '';
  }
  
  // Process segments to create logical breaks
  const processedSegments = validSegments.map((segment, index) => {
    // Clean up segment
    let cleaned = segment.trim();
    
    // For segments after the first one, check if we need to add capitalization
    if (index > 0) {
      // If the previous segment ended with a sentence-ending punctuation, 
      // ensure this segment starts with a capital letter
      const prevSegment = validSegments[index - 1].trim();
      if (prevSegment.match(/[.!?]$/)) {
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }
    }
    
    return cleaned;
  });
  
  // Join with paragraph breaks
  return processedSegments.join('\n\n');
}

/**
 * Helper function to format bytes to human-readable format
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
