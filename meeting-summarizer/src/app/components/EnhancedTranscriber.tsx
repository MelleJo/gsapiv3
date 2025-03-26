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

  // Process chunks in stages (upload, then transcribe)
  const processChunksInStages = async (audioChunks: Blob[], fileName: string): Promise<string[]> => {
    // First upload all chunks
    setCurrentStage('uploading');
    
    try {
      // Upload chunks
      const uploadedChunks = await processChunksWithProgress(
        audioChunks,
        uploadChunk(fileName),
        (progress, current, total) => {
          if (onProgress) onProgress(10 + (progress * 0.3), `Uploading segments (${current}/${total})...`);
          updateChunkProgress('uploading', progress);
        },
        MAX_CONCURRENT_UPLOADS
      );
      
      // Then transcribe all chunks
      setCurrentStage('transcribing');
      
      // Custom implementation of processing for URL strings instead of Blobs
      const transcriptions: string[] = [];
      let completedTranscriptions = 0;
      
      // Process URLs in batches to control concurrency
      const maxConcurrentTranscriptions = 2; // Lower concurrency for transcription to avoid rate limits
      
      for (let i = 0; i < uploadedChunks.length; i += maxConcurrentTranscriptions) {
        const batch = uploadedChunks.slice(i, i + maxConcurrentTranscriptions);
        const batchPromises = batch.map(async (blobUrl, batchIndex) => {
          const chunkIndex = i + batchIndex;
          try {
            const result = await transcribeChunk(blobUrl, chunkIndex);
            completedTranscriptions++;
            
            // Update progress
            const progress = Math.round((completedTranscriptions / uploadedChunks.length) * 100);
            if (onProgress) onProgress(40 + (progress * 0.55), `Transcribing segments (${completedTranscriptions}/${uploadedChunks.length})...`);
            updateChunkProgress('transcribing', progress);
            
            return { index: chunkIndex, result };
          } catch (error) {
            console.error(`Error transcribing chunk ${chunkIndex}:`, error);
            throw { index: chunkIndex, error };
          }
        });
        
        // Wait for all promises in this batch to settle
        const batchResults = await Promise.allSettled(batchPromises);
        
        // Process results
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            transcriptions[result.value.index] = result.value.result;
          } else {
            throw new Error(`Failed to transcribe chunk ${result.reason.index}: ${result.reason.error}`);
          }
        }
        
        // Short delay between batches to avoid rate limiting
        if (i + maxConcurrentTranscriptions < uploadedChunks.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
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

  // Transcribe a single chunk
  const transcribeChunk = async (blobUrl: string, index: number): Promise<string> => {
    try {
      updateChunkStatus(index, { status: 'transcribing', progress: 0 });
      
      // Call the transcribe-segment API
      const response = await fetch('/api/transcribe-segment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          blobUrl,
          segmentId: index,
          model
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      updateChunkStatus(index, { 
        status: 'completed', 
        progress: 100,
        transcription: result.transcription
      });
      
      return result.transcription;
    } catch (error) {
      updateChunkStatus(index, { 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Transcription failed'
      });
      throw error;
    }
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
