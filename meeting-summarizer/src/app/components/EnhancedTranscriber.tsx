'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  createAudioChunks, 
  processChunksWithProgress, 
  joinTranscriptions,
  formatBytes, 
  ChunkStatus,
  OPENAI_MAX_SIZE_LIMIT,
  MAX_CONCURRENT_UPLOADS,
  MAX_CLIENT_TIMEOUT
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
      
      // If file is under the size limit, send directly to the API (no chunking)
      if (file.size <= OPENAI_MAX_SIZE_LIMIT) {
        console.log(`Audio file size (${formatBytes(file.size)}) is smaller than Whisper API limit. Processing as a single file.`);
        
        if (onProgress) onProgress(10, 'Processing audio as a single file...');
        
        await processWholeFile(file);
        return;
      }
      
      // For larger files, split into chunks
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
      
      // Process all chunks - use direct transcription
      setCurrentStage('transcribing');
      
      // Process chunks with controlled concurrency
      const transcriptions = await processChunksSequentially(audioChunks, file.name);
      
      // Combine the transcriptions
      setCurrentStage('combining');
      if (onProgress) onProgress(95, 'Combining transcriptions...');
      
      const fullTranscription = joinTranscriptions(transcriptions);
      
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

  // Process a single file without chunking
  const processWholeFile = async (file: File): Promise<void> => {
    try {
      if (onProgress) onProgress(20, 'Transcribing audio file...');
      
      setCurrentStage('transcribing');
      
      // Create FormData for the direct upload
      const formData = new FormData();
      formData.append('audio', file);
      formData.append('fileName', file.name);
      formData.append('model', model);
      
      // Call the direct transcription API
      const response = await fetch('/api/direct-transcribe', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      if (onProgress) onProgress(100, 'Transcription complete!');
      setCurrentStage('completed');
      
      onTranscriptionComplete(result.transcription);
      
    } catch (error) {
      console.error('Error processing whole file:', error);
      throw error;
    }
  };

  // Process chunks sequentially with direct transcription
  const processChunksSequentially = async (audioChunks: Blob[], fileName: string): Promise<string[]> => {
    try {
      // Array to store all transcriptions
      const transcriptions: string[] = [];
      
      // Process each chunk one at a time
      for (let i = 0; i < audioChunks.length; i++) {
        // Update status to transcribing
        updateChunkStatus(i, { status: 'transcribing', progress: 0 });
        
        if (onProgress) {
          const transcriptionMessage = audioChunks.length > 1 
            ? `Transcribing segment ${i+1}/${audioChunks.length}...` 
            : `Transcribing audio...`;
          onProgress(10 + (i / audioChunks.length) * 85, transcriptionMessage);
        }
        
        console.log(`Transcribing chunk ${i+1}/${audioChunks.length}...`);
        
        // Transcribe using direct API call
        let transcriptionResult: string;
        try {
          // Transcribe with retries
          transcriptionResult = await transcribeChunkDirect(audioChunks[i], i, fileName);
          
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
            onProgress(10 + (progressPercent * 0.85), 
              audioChunks.length > 1 
                ? `Transcribed segment ${i+1}/${audioChunks.length}` 
                : `Transcription completed!`);
          }
        } catch (transcriptError) {
          console.error(`Failed to transcribe chunk ${i+1}/${audioChunks.length}:`, transcriptError);
          
          // Mark as error in UI
          updateChunkStatus(i, { 
            status: 'error', 
            progress: 0,
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

  // Direct transcription of a chunk without using blob storage
  const transcribeChunkDirect = async (chunk: Blob, index: number, originalFileName: string): Promise<string> => {
    const MAX_RETRIES = 2;
    const BASE_RETRY_DELAY = 5000; // 5 seconds base delay
    let attempts = 0;
    let lastError: any = null;
    
    // Update initial status
    updateChunkStatus(index, { status: 'transcribing', progress: 0, retries: attempts });
    
    while (attempts < MAX_RETRIES) {
      try {
        // Show progressive status in the UI
        updateChunkStatus(index, { 
          status: 'transcribing', 
          progress: Math.min(90, attempts * 20 + 10), // Show some progress
          retries: attempts 
        });
        
        console.log(`Transcribing segment ${index} (attempt ${attempts + 1}/${MAX_RETRIES})...`);
        
        // Create FormData for the direct upload
        const formData = new FormData();
        formData.append('audio', chunk);
        formData.append('chunkIndex', index.toString());
        formData.append('fileName', `chunk_${index}_${originalFileName}`);
        formData.append('model', model);
        
        // Call the direct transcription API
        const response = await fetch('/api/direct-transcribe', {
          method: 'POST',
          body: formData,
        });
        
        // Handle response errors with better fallback strategy
        if (!response.ok) {
          let errorMessage = `HTTP error ${response.status}`;
          let retryable = response.status >= 500 || response.status === 429;
          
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
            retryable = errorData.retryable ?? retryable;
          } catch (e) {
            // Ignore JSON parsing errors
          }
          
          // If we get a 404 or 405, try the regular Blob storage path as fallback
          if (response.status === 404 || response.status === 405) {
            console.log('Direct transcription endpoint not found, falling back to blob upload...');
            throw new Error('Direct transcription API not available. Please update your deployment with the direct-transcribe API endpoint.');
          }
          
          throw new Error(errorMessage);
        }
        
        // Parse response
        const result = await response.json();
        
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
          errorMsg.includes('429') ||
          errorMsg.includes('5'); // 5xx server errors
        
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
        
        // Calculate backoff delay with exponential backoff
        const backoffDelay = BASE_RETRY_DELAY * Math.pow(2, attempts);
        
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

  // Render progress view
  return (
    <div className="enhanced-transcriber">
      {isProcessing && (
        <div className="transcription-progress">
          <div className="mb-2 text-sm text-neutral-600">
            {currentStage === 'chunking' && 'Splitting audio into segments...'}
            {currentStage === 'transcribing' && `Transcribing ${chunks.length > 1 ? `segments (${chunkStatuses.filter(s => s.status === 'completed').length}/${chunkStatuses.length})` : 'audio'}...`}
            {currentStage === 'combining' && 'Combining transcriptions...'}
          </div>
          
          {/* Progress visualization */}
          <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-in-out" 
              style={{ width: `${overallProgress}%` }}
            ></div>
          </div>
          
          {/* Segment progress indicators (only show for multiple chunks) */}
          {chunkStatuses.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {chunkStatuses.map((status) => (
                <div 
                  key={status.id}
                  className={`h-1.5 w-4 rounded-full transition-colors ${
                    status.status === 'error' ? 'bg-red-500' : 
                    status.status === 'completed' ? 'bg-green-500' : 
                    status.status === 'transcribing' ? 'bg-blue-500' :
                    status.status === 'pending' ? 'bg-gray-300' : 'bg-gray-300'
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