'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { upload } from '@vercel/blob/client';
import { 
  createAudioChunks, 
  processChunksWithProgress, 
  joinTranscriptions,
  formatBytes, 
  ChunkStatus,
  MAX_CONCURRENT_UPLOADS
} from '@/lib/enhancedAudioChunker';

interface EnhancedTranscriberProps {
  audioFile: File | null;
  onTranscriptionComplete: (transcription: string) => void;
  onError: (error: string) => void;
  onProgress?: (progress: number, status: string) => void;
  onStatusUpdate?: (status: {
    stage: string;
    currentChunk?: number;
    totalChunks?: number;
    message?: string;
  }) => void;
  model?: string;
}

export default function EnhancedTranscriber({
  audioFile,
  onTranscriptionComplete,
  onError,
  onProgress,
  onStatusUpdate,
  model = 'whisper-1'
}: EnhancedTranscriberProps) {
  const [chunks, setChunks] = useState<Blob[]>([]);
  const [chunkStatuses, setChunkStatuses] = useState<ChunkStatus[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState<'initializing' | 'chunking' | 'uploading' | 'transcribing' | 'combining' | 'completed' | 'error'>('initializing');

  // Update status message for parent component
  useEffect(() => {
    if (onStatusUpdate) {
      const completedChunks = chunkStatuses.filter(s => s.status === 'completed').length;
      const totalChunks = chunkStatuses.length;
      
      let message = '';
      switch (currentStage) {
        case 'initializing':
          message = 'Preparing audio for processing...';
          break;
        case 'chunking':
          message = 'Splitting audio into manageable segments...';
          break;
        case 'uploading':
          message = `Uploading audio segments (${completedChunks}/${totalChunks})...`;
          break;
        case 'transcribing':
          message = `Transcribing audio segments (${completedChunks}/${totalChunks})...`;
          break;
        case 'combining':
          message = 'Combining transcription results...';
          break;
        case 'completed':
          message = 'Transcription completed successfully!';
          break;
        case 'error':
          message = 'Error occurred during transcription.';
          break;
      }
      
      onStatusUpdate({
        stage: currentStage,
        currentChunk: completedChunks,
        totalChunks,
        message
      });
    }
  }, [currentStage, chunkStatuses, onStatusUpdate]);

  // Process audio file when it's provided
  useEffect(() => {
    if (audioFile && !isProcessing) {
      processAudioFile(audioFile);
    }
  }, [audioFile, isProcessing]);

  // Main function to process the audio file
  const processAudioFile = async (file: File) => {
    try {
      setIsProcessing(true);
      setCurrentStage('initializing');
      setOverallProgress(0);
      
      if (onProgress) onProgress(0, 'Preparing audio...');
      
      console.log(`Processing audio file: ${file.name}, size: ${formatBytes(file.size)}`);
      
      // Split the file into chunks
      setCurrentStage('chunking');
      if (onProgress) onProgress(5, 'Splitting audio into segments...');
      
      const audioChunks = await createAudioChunks(file);
      setChunks(audioChunks);
      
      // Initialize chunk statuses
      const initialStatuses: ChunkStatus[] = audioChunks.map((_, index) => ({
        id: index,
        status: 'pending',
        progress: 0,
        retries: 0
      }));
      setChunkStatuses(initialStatuses);
      
      if (onProgress) onProgress(10, `Split into ${audioChunks.length} segments`);
      
      // Process all chunks
      setCurrentStage('uploading');
      
      // Upload all chunks to blob storage
      const uploadResults = await processChunksInStages(audioChunks, file.name);
      
      // Combine the transcriptions
      setCurrentStage('combining');
      if (onProgress) onProgress(95, 'Combining transcriptions...');
      
      const fullTranscription = joinTranscriptions(uploadResults);
      
      setCurrentStage('completed');
      if (onProgress) onProgress(100, 'Transcription complete!');
      
      onTranscriptionComplete(fullTranscription);
      
    } catch (error) {
      setCurrentStage('error');
      console.error('Audio processing error:', error);
      onError(error instanceof Error ? error.message : 'Unknown error during transcription');
    } finally {
      setIsProcessing(false);
    }
  };

  // Process chunks in stages (upload, then transcribe) - sequential approach
  const processChunksInStages = async (audioChunks: Blob[], fileName: string): Promise<string[]> => {
    try {
      // Array to store all transcriptions - likely just 1-3 large chunks
      const transcriptions: string[] = [];
      
      // Process each chunk one at a time (no parallel processing)
      for (let i = 0; i < audioChunks.length; i++) {
        // First, upload the current chunk
        setCurrentStage('uploading');
        updateChunkStatus(i, { status: 'uploading', progress: 0 });
        
        if (onProgress) {
          const uploadMessage = audioChunks.length > 1 
            ? `Uploading segment ${i+1}/${audioChunks.length}...` 
            : `Uploading audio file...`;
          onProgress(10, uploadMessage);
        }
        
        // Upload the chunk
        console.log(`Uploading chunk ${i+1}/${audioChunks.length} (${formatBytes(audioChunks[i].size)})...`);
        let blobUrl: string;
        
        try {
          blobUrl = await uploadChunk(fileName)(audioChunks[i], i);
          
          // Short delay after upload
          await new Promise(resolve => setTimeout(resolve, 500));
          
          if (onProgress) {
            onProgress(40, audioChunks.length > 1 
              ? `Segment ${i+1}/${audioChunks.length} uploaded, preparing transcription...` 
              : `Audio uploaded, preparing transcription...`);
          }
        } catch (uploadError) {
          console.error(`Failed to upload chunk ${i+1}/${audioChunks.length}:`, uploadError);
          
          // Try direct transcription without blob storage if upload fails
          if (audioChunks[i].size < 10 * 1024 * 1024) { // Under 10MB for direct transmission
            console.warn(`Attempting direct transcription without blob storage for chunk ${i+1}...`);
            
            try {
              // Base64 encode the blob for direct API transmission
              const arrayBuffer = await audioChunks[i].arrayBuffer();
              const base64data = btoa(
                new Uint8Array(arrayBuffer)
                  .reduce((data, byte) => data + String.fromCharCode(byte), '')
              );
              
              // Use a placeholder URL to identify this is a direct blob transmission
              blobUrl = `direct-blob://${i}`;
              
              // Send the blob directly to the API endpoint with the request
              const directResponse = await fetch('/api/transcribe-segment', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  directBlob: base64data,
                  segmentId: i,
                  model,
                  attempt: 1
                })
              });
              
              if (!directResponse.ok) {
                throw new Error(`Direct transcription API returned status ${directResponse.status}`);
              }
              
              const directResult = await directResponse.json();
              
              // If successful, we can skip the regular transcription step
              if (directResult.success && directResult.transcription) {
                // Add to results
                transcriptions.push(directResult.transcription);
                
                // Mark as completed in UI
                updateChunkStatus(i, { 
                  status: 'completed', 
                  progress: 100,
                  transcription: directResult.transcription
                });
                
                if (onProgress) {
                  const progressPercent = Math.round(((i + 1) / audioChunks.length) * 100);
                  onProgress(40 + (progressPercent * 0.55), 
                    audioChunks.length > 1 
                      ? `Transcribed segment ${i+1}/${audioChunks.length} (direct)` 
                      : `Transcription completed!`);
                }
                
                // Continue to next chunk
                continue;
              }
              
              // If we get here, the direct API call succeeded but didn't return a transcription
              // Fall back to creating a temporary URL
              console.warn(`Direct transcription API call succeeded but didn't return a transcription. Creating temp URL.`);
              blobUrl = URL.createObjectURL(audioChunks[i]);
              setTimeout(() => URL.revokeObjectURL(blobUrl), 60000); // Revoke after 1 minute
            } catch (directError) {
              console.error(`Direct transcription failed for chunk ${i+1}:`, directError);
              
              // Fall back to creating a temporary URL
              console.warn(`Falling back to temporary URL for chunk ${i+1}...`);
              blobUrl = URL.createObjectURL(audioChunks[i]);
              setTimeout(() => URL.revokeObjectURL(blobUrl), 60000); // Revoke after 1 minute
            }
          } else {
            throw new Error(`Failed to upload segment ${i+1} and it's too large (${formatBytes(audioChunks[i].size)}) for direct transcription`);
          }
        }
        
        // Now transcribe the uploaded chunk
        setCurrentStage('transcribing');
        updateChunkStatus(i, { status: 'transcribing', progress: 0 });
        
        if (onProgress) {
          const transcriptionMessage = audioChunks.length > 1 
            ? `Transcribing segment ${i+1}/${audioChunks.length}...` 
            : `Transcribing audio...`;
          onProgress(60, transcriptionMessage);
        }
        
        console.log(`Transcribing chunk ${i+1}/${audioChunks.length}...`);
        
        let transcriptionResult: string;
        try {
          // Transcribe the chunk with retries
          transcriptionResult = await transcribeChunk(blobUrl, i);
          
          // Mark as completed in UI
          updateChunkStatus(i, { 
            status: 'completed', 
            progress: 100,
            transcription: transcriptionResult
          });
          
          // Add to results
          transcriptions.push(transcriptionResult);
          
          if (onProgress) {
            const progressPercent = Math.round(((i + 1) / audioChunks.length) * 100);
            onProgress(40 + (progressPercent * 0.55), 
              audioChunks.length > 1 
                ? `Transcribed segment ${i+1}/${audioChunks.length}` 
                : `Transcription completed!`);
          }
        } catch (transcriptError) {
          console.error(`Failed to transcribe chunk ${i+1}/${audioChunks.length}:`, transcriptError);
          
          // Mark as error in UI
          updateChunkStatus(i, { 
            status: 'error', 
            progress: 100,
            error: transcriptError instanceof Error ? transcriptError.message : String(transcriptError)
          });
          
          // Add a placeholder for this chunk
          transcriptions.push(`[Transcription failed for part ${i+1} of ${audioChunks.length}]`);
          
          // Continue with next chunk - don't completely fail if one chunk fails
          continue;
        }
        
        // Short delay between chunks
        if (i < audioChunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Return the array of transcriptions (one per chunk)
      return transcriptions;
    } catch (error) {
      console.error('Error processing chunks:', error);
      throw error;
    }
  };

  // Upload a single chunk
  const uploadChunk = (originalFileName: string) => async (chunk: Blob, index: number): Promise<string> => {
    try {
      updateChunkStatus(index, { status: 'uploading', progress: 0 });
      
      // Create a unique name for this chunk
      const uniquePrefix = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const chunkName = `segment_${index}_${uniquePrefix}_${originalFileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      
      // Upload to blob storage
      const blob = await upload(chunkName, chunk, {
        access: 'public',
        handleUploadUrl: '/api/client-upload',
        onUploadProgress: (progress) => {
          updateChunkStatus(index, { progress: progress.percentage });
        }
      });
      
      updateChunkStatus(index, { 
        status: 'completed', 
        progress: 100,
        blobUrl: blob.url
      });
      
      return blob.url;
    } catch (error) {
      updateChunkStatus(index, { 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Upload failed'
      });
      throw error;
    }
  };

  // Transcribe a single chunk with advanced retry logic and exponential backoff
  const transcribeChunk = async (blobUrl: string, index: number): Promise<string> => {
    const MAX_RETRIES = 5; // Increased from 3 to 5
    const BASE_RETRY_DELAY = 2000; // 2 seconds base delay
    const MAX_RETRY_DELAY = 15000; // Maximum delay cap (15 seconds)
    let attempts = 0;
    let lastError: any = null;
    
    // Update initial status
    updateChunkStatus(index, { status: 'transcribing', progress: 0, retries: attempts });
    
    // Function to add timeout to fetch with more robust error handling
    const fetchWithTimeout = async (url: string, options: RequestInit, timeout: number = 25000) => {
      const controller = new AbortController();
      const id = setTimeout(() => {
        controller.abort();
        console.warn(`Request timeout for segment ${index} after ${timeout}ms`);
      }, timeout);
      
      try {
        // For blob URLs, first check if they're accessible
        if (url.includes('/api/transcribe-segment')) {
          const blobUrlCheck = JSON.parse(options.body as string).blobUrl;
          
          // Verify blob URL is accessible with a HEAD request before proceeding
          try {
            const blobCheck = await fetch(blobUrlCheck, { 
              method: 'HEAD',
              signal: AbortSignal.timeout(10000) // 10 second timeout just for the head check
            });
            
            if (!blobCheck.ok) {
              throw new Error(`Blob URL check failed with status ${blobCheck.status}`);
            }
          } catch (blobError) {
            console.error(`Blob URL validation failed for segment ${index}:`, blobError);
            throw new Error(`Blob unavailable or inaccessible: ${blobError instanceof Error ? blobError.message : String(blobError)}`);
          }
        }
        
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });
        
        clearTimeout(id);
        return response;
      } catch (error) {
        clearTimeout(id);
        throw error;
      }
    };
    
    // Helper to calculate exponential backoff with jitter
    const getBackoffDelay = (attempt: number): number => {
      // Exponential backoff with full jitter
      const expBackoff = Math.min(
        MAX_RETRY_DELAY,
        BASE_RETRY_DELAY * Math.pow(2, attempt)
      );
      // Add jitter to prevent thundering herd problem
      return Math.floor(Math.random() * expBackoff);
    };
    
    // Retry loop
    while (attempts < MAX_RETRIES) {
      try {
        // Show progressive status in the UI
        updateChunkStatus(index, { 
          status: 'transcribing', 
          progress: Math.min(90, attempts * 20), // Show some progress
          retries: attempts 
        });
        
        console.log(`Transcribing segment ${index} (attempt ${attempts + 1}/${MAX_RETRIES})...`);
        
        // Call the transcribe-segment API with timeout
        // Increase timeout for each retry attempt
        const timeoutDuration = 20000 + (attempts * 5000); // 20s base + 5s per attempt
        const response = await fetchWithTimeout(
          '/api/transcribe-segment',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              blobUrl,
              segmentId: index,
              model,
              attempt: attempts + 1,
              // Include timestamp to prevent caching
              timestamp: Date.now()
            })
          },
          timeoutDuration
        );
        
        // Handle response errors
        if (!response.ok) {
          let errorMessage = `HTTP error ${response.status}`;
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch (e) {
            // Ignore JSON parsing errors
          }
          throw new Error(errorMessage);
        }
        
        // Parse result with timeout
        let result;
        try {
          const responseText = await response.text();
          result = JSON.parse(responseText);
        } catch (parseError) {
          throw new Error(`Failed to parse API response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        }
        
        if (result.error) {
          throw new Error(result.error);
        }
        
        // Success - update status and return
        updateChunkStatus(index, { 
          status: 'completed', 
          progress: 100,
          transcription: result.transcription,
          retries: attempts
        });
        
        return result.transcription;
        
      } catch (error) {
        lastError = error;
        attempts++;
        
        // Expanded list of retryable errors
        const errorMsg = error instanceof Error ? error.message : String(error);
        const isRetryable = 
          errorMsg.includes('timeout') || 
          errorMsg.includes('network') ||
          errorMsg.includes('aborted') ||
          errorMsg.includes('failed to fetch') ||
          errorMsg.includes('rate limit') ||
          errorMsg.includes('ECONNRESET') ||
          errorMsg.includes('ETIMEDOUT') ||
          errorMsg.includes('Blob unavailable') ||
          errorMsg.includes('parse') ||
          (error instanceof TypeError) ||
          (error instanceof DOMException) ||
          (error instanceof SyntaxError) || // JSON parse errors
          // HTTP status codes that are worth retrying
          errorMsg.includes('429') || // Too Many Requests
          errorMsg.includes('503') || // Service Unavailable
          errorMsg.includes('504'); // Gateway Timeout
        
        // Update status
        updateChunkStatus(index, { 
          status: attempts < MAX_RETRIES && isRetryable ? 'transcribing' : 'error',
          error: errorMsg,
          retries: attempts
        });
        
        // If we've hit max retries or this is a non-retryable error, give up
        if (attempts >= MAX_RETRIES || !isRetryable) {
          console.error(`Max retries reached or non-retryable error for segment ${index}:`, errorMsg);
          throw new Error(`Failed to transcribe segment ${index} after ${attempts} attempts: ${errorMsg}`);
        }
        
        // Calculate backoff delay with exponential backoff and jitter
        const backoffDelay = getBackoffDelay(attempts);
        
        // Wait before retrying
        console.log(`Retry attempt ${attempts}/${MAX_RETRIES} for segment ${index}. Waiting ${backoffDelay/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
    
    // This should never happen if the loop is set up correctly
    throw lastError || new Error(`Failed to transcribe segment ${index} for unknown reasons`);
  };

  // Helper to update status of a specific chunk
  const updateChunkStatus = (chunkId: number, update: Partial<ChunkStatus>) => {
    setChunkStatuses(prevStatuses => 
      prevStatuses.map(status => 
        status.id === chunkId ? { ...status, ...update } : status
      )
    );
  };

  // Helper to update progress of all chunks in a specific stage
  const updateChunkProgress = (stage: 'uploading' | 'transcribing', progress: number) => {
    setChunkStatuses(prevStatuses => 
      prevStatuses.map(status => 
        status.status === stage ? { ...status, progress } : status
      )
    );
  };

  // Render progress view
  return (
    <div className="enhanced-transcriber">
      {isProcessing && (
        <div className="transcription-progress">
          <div className="mb-2 text-sm text-neutral-600">
            {currentStage === 'chunking' && 'Splitting audio into segments...'}
            {currentStage === 'uploading' && `Uploading segments (${chunkStatuses.filter(s => s.status === 'completed').length}/${chunkStatuses.length})...`}
            {currentStage === 'transcribing' && `Transcribing segments (${chunkStatuses.filter(s => s.status === 'completed').length}/${chunkStatuses.length})...`}
            {currentStage === 'combining' && 'Combining transcriptions...'}
          </div>
          
          {/* Progress visualization - can be customized */}
          <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-in-out" 
              style={{ width: `${overallProgress}%` }}
            ></div>
          </div>
          
          {/* Segment progress indicators (optional) */}
          {chunkStatuses.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {chunkStatuses.map((status) => (
                <div 
                  key={status.id}
                  className={`h-1.5 w-4 rounded-full transition-colors ${
                    status.status === 'error' ? 'bg-red-500' : 
                    status.status === 'completed' ? 'bg-green-500' : 
                    status.status === 'transcribing' ? 'bg-blue-500' :
                    status.status === 'uploading' ? 'bg-yellow-500' : 'bg-gray-300'
                  }`}
                  title={`Segment ${status.id + 1}: ${status.status}`}
                ></div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
