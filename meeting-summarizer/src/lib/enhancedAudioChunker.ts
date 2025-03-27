// src/lib/enhancedAudioChunker.ts

/**
 * Enhanced audio chunking with browser-native audio processing
 * This approach splits audio directly in the browser for improved reliability
 */

// Constants optimized for maximum Fluid Compute timeouts
export const OPENAI_MAX_SIZE_LIMIT = 4 * 1024 * 1024; // 4MB to satisfy Vercel's payload limit
export const RECOMMENDED_CHUNK_DURATION = 480; // seconds (8 minutes) to safely fit within the 720s function limit
export const MAX_CHUNK_SIZE = OPENAI_MAX_SIZE_LIMIT; // Never exceed OpenAI's limit
export const TARGET_WAV_SIZE = 3 * 1024 * 1024; // Target 3MB WAV files to ensure payload is under Vercel's limit
export const MIN_CHUNK_SIZE = 4 * 1024 * 1024; // 4MB minimum size to ensure chunking for medium-sized files
export const MAX_CONCURRENT_UPLOADS = 1; // Process one chunk at a time to maximize resources for each chunk
export const DEFAULT_SAMPLE_RATE = 16000; // 16kHz is sufficient for speech recognition and reduces file size
export const MAX_CLIENT_TIMEOUT = 700 * 1000; // 11.67 minutes in milliseconds, near maximum Fluid Compute limit (720 seconds)

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
    // Adjust target duration based on estimated WAV size to ensure output is under the payload limit.
    const estimatedWavSizePerSecond = sampleRate * numberOfChannels * 2; // 16-bit PCM = 2 bytes per sample
    const computedTargetDuration = TARGET_WAV_SIZE / estimatedWavSizePerSecond;
    targetDuration = Math.min(targetDuration, computedTargetDuration);
    
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
      
      // First try with original quality
      let outputBuffer = chunkBuffer;
      let currentSampleRate = sampleRate;
      let currentChannels = numberOfChannels;
      
      // Iteratively downsample until we reach acceptable size
      // Start with highest quality, then reduce if needed
      let audioData: ArrayBuffer;
      let chunkBlob: Blob;
      let attemptCount = 0;
      
      // Iteratively downsample if needed
      do {
        if (attemptCount > 0) {
          // Downsample on each attempt
          console.log(`Chunk ${i+1} too large, downsampling (attempt ${attemptCount})...`);
          
          // Reduce sample rate on each iteration, but not below 16kHz
          // Speech recognition works well down to 16kHz
          if (currentSampleRate > DEFAULT_SAMPLE_RATE) {
            // Reduce sample rate by half but not below 16kHz
            const targetSampleRate = Math.max(DEFAULT_SAMPLE_RATE, currentSampleRate / 2);
            
            // Create buffer with new sample rate
            const downsampledBuffer = audioContext.createBuffer(
              currentChannels === 2 ? 1 : currentChannels, // Convert to mono if needed
              Math.ceil(chunkDuration * targetSampleRate),
              targetSampleRate
            );
            
            // Copy and downsample data
            if (currentChannels === 2 && downsampledBuffer.numberOfChannels === 1) {
              // Mix stereo to mono
              const outputData = downsampledBuffer.getChannelData(0);
              const inputData1 = outputBuffer.getChannelData(0);
              const inputData2 = outputBuffer.getChannelData(1);
              
              // Calculate ratio for sample rate conversion
              const ratio = currentSampleRate / targetSampleRate;
              
              for (let j = 0; j < outputData.length; j++) {
                // Simple linear interpolation for downsampling
                const sourceIndex = Math.min(Math.floor(j * ratio), inputData1.length - 1);
                // Mix stereo channels to mono
                outputData[j] = (inputData1[sourceIndex] + inputData2[sourceIndex]) / 2;
              }
            } else {
              // Just downsample, keep same number of channels
              for (let channel = 0; channel < downsampledBuffer.numberOfChannels; channel++) {
                const outputData = downsampledBuffer.getChannelData(channel);
                const inputData = outputBuffer.getChannelData(channel);
                
                // Calculate ratio for sample rate conversion
                const ratio = currentSampleRate / targetSampleRate;
                
                for (let j = 0; j < outputData.length; j++) {
                  // Simple linear interpolation for downsampling
                  const sourceIndex = Math.min(Math.floor(j * ratio), inputData.length - 1);
                  outputData[j] = inputData[sourceIndex];
                }
              }
            }
            
            // Update state for next iteration
            outputBuffer = downsampledBuffer;
            currentSampleRate = targetSampleRate;
            currentChannels = downsampledBuffer.numberOfChannels;
          } else if (currentChannels > 1) {
            // Convert stereo to mono (if we haven't already)
            const monoBuffer = audioContext.createBuffer(
              1,
              outputBuffer.length,
              currentSampleRate
            );
            
            // Mix all channels to mono
            const monoData = monoBuffer.getChannelData(0);
            for (let j = 0; j < monoData.length; j++) {
              let sum = 0;
              for (let channel = 0; channel < currentChannels; channel++) {
                sum += outputBuffer.getChannelData(channel)[j];
              }
              monoData[j] = sum / currentChannels;
            }
            
            outputBuffer = monoBuffer;
            currentChannels = 1;
          }
        }
        
        // Render to WAV
        audioData = audioBufferToWav(outputBuffer);
        chunkBlob = new Blob([audioData], { type: 'audio/wav' });
        
        attemptCount++;
        // Limit downsampling attempts to 3
      } while (chunkBlob.size > OPENAI_MAX_SIZE_LIMIT && attemptCount < 3);
      
      // Log the final settings used
      if (attemptCount > 1) {
        console.log(`Final chunk ${i+1} settings: ${currentChannels} channels, ${currentSampleRate}Hz sample rate, size: ${formatBytes(chunkBlob.size)}`);
      }
      
      // If still too large after downsampling attempts, recursively split the chunk.
      if (chunkBlob.size > OPENAI_MAX_SIZE_LIMIT) {
        console.warn(`Chunk ${i+1} still too large (${formatBytes(chunkBlob.size)}) after downsampling. Recursively splitting chunk.`);
        // Create a File from the oversized blob.
        const chunkFile = new File([chunkBlob], `chunk_${i+1}.wav`, { type: 'audio/wav' });
        // Recursively call createAudioChunks with a reduced target duration.
        const subChunks = await createAudioChunks(chunkFile, targetDuration / 2);
        // Append all sub-chunks to our chunks array.
        chunks.push(...subChunks);
        continue; // Skip normal processing of this chunk.
      }
      
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
  if (audioBlob.size <= MIN_CHUNK_SIZE) {
    console.log(`Small audio file (${formatBytes(audioBlob.size)}), using as-is.`);
    return [audioBlob];
  }
  
  try {
    // Try to use the browser's audio processing API as a first fallback
    const arrayBuffer = await audioBlob.arrayBuffer();
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContext();
    
    // Try to decode the entire audio file
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Success! Get basic audio properties
    const duration = audioBuffer.duration;
    console.log(`Fallback: Successfully decoded ${Math.round(duration)}s of audio.`);
    
    // Create smaller chunks using basic properties
    // Calculate target chunk duration based on file size and duration ratio
    // Aim for < 15MB chunks to be safe
    const sizePerSecond = audioBlob.size / duration;
    const targetDuration = Math.floor(TARGET_WAV_SIZE / sizePerSecond); 
    
    // Use at least 60 second chunks, but never more than 5 minutes
    const chunkDuration = Math.min(Math.max(60, targetDuration), 300);
    const numChunks = Math.ceil(duration / chunkDuration);
    
    console.log(`Fallback: Creating ${numChunks} chunks of ~${chunkDuration}s each (${formatBytes(chunkDuration * sizePerSecond)} each)`);
    
    // Create chunks by binary splitting based on the calculated duration
    const chunks: Blob[] = [];
    for (let i = 0; i < numChunks; i++) {
      const startTime = i * chunkDuration;
      const endTime = Math.min(startTime + chunkDuration, duration);
      
      // Convert time to byte position (approximate)
      const start = Math.floor(startTime * sizePerSecond);
      const end = Math.min(Math.floor(endTime * sizePerSecond), audioBlob.size);
      
      const chunk = audioBlob.slice(start, end, audioBlob.type);
      chunks.push(chunk);
      
      console.log(`Created binary chunk ${i+1}/${numChunks}: ${formatBytes(chunk.size)}`);
    }
    
    return chunks;
  } catch (error) {
    console.error("Fallback audio decode failed, using pure binary chunking:", error);
    
    // Ultimate fallback - just split by bytes without any audio knowledge
    // Use a smaller chunk size to be safe
    const safeChunkSize = OPENAI_MAX_SIZE_LIMIT * 0.75; // 75% of the max limit (14.25MB)
    const numChunks = Math.ceil(audioBlob.size / safeChunkSize);
    
    // Create chunks
    const chunks: Blob[] = [];
    for (let i = 0; i < numChunks; i++) {
      const start = i * safeChunkSize;
      const end = Math.min(start + safeChunkSize, audioBlob.size);
      
      const chunk = audioBlob.slice(start, end, audioBlob.type);
      chunks.push(chunk);
      
      console.log(`Created safe binary chunk ${i+1}/${numChunks}: ${formatBytes(chunk.size)}`);
    }
    
    return chunks;
  }
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
