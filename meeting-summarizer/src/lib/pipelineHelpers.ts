// src/lib/pipelineHelpers.ts
import { PipelineStage } from "@/app/components/ProcessingPipeline";

/**
 * Calculates estimated time for the pipeline based on file size, stage, and transcription model
 * 
 * @param fileSize File size in bytes
 * @param stage Current pipeline stage
 * @param transcriptionModel Model ID for transcription
 * @returns Estimated time in seconds
 */
export function calculateEstimatedTime(
  fileSize: number, 
  stage: PipelineStage,
  transcriptionModel: string = 'whisper-1'
): number {
  // Convert file size to MB for easier calculations
  const fileSizeMB = fileSize / (1024 * 1024);
  
  // Base processing times (in seconds)
  const baseUploadTime = 5 + (fileSizeMB * 0.2); // ~5MB/s upload speed
  const baseProcessingTime = 3 + (fileSizeMB * 0.1); // Processing time increases with file size
  const baseChunkingTime = fileSizeMB > 25 ? 5 + (fileSizeMB * 0.05) : 0; // Only if file > 25MB
  
  // Transcription time is heavily dependent on audio length
  // Estimate audio length: ~1 minute of audio per MB for compressed formats
  const estimatedAudioMinutes = fileSizeMB;
  
  // Whisper typically processes audio at ~0.5x real-time speed
  // This means 1 minute of audio takes about 30 seconds to process
  const baseTranscriptionTime = estimatedAudioMinutes * 30;
  
  // Summarization depends on the length of transcription, which correlates with audio length
  // We'll estimate ~500 words per minute of audio, and summarization takes ~1s per 100 words
  const baseWordsCount = estimatedAudioMinutes * 500;
  const baseSummarizationTime = 10 + (baseWordsCount / 100);

  // For a better user experience, let's cap the times to reasonable values
  // and adjust them to be slightly more optimistic
  const adjustedTimes = {
    uploading: Math.min(300, baseUploadTime * 0.8), // Cap at 5 minutes
    processing: Math.min(60, baseProcessingTime * 0.8), // Cap at 1 minute
    chunking: Math.min(60, baseChunkingTime * 0.8), // Cap at 1 minute
    transcribing: Math.min(600, baseTranscriptionTime * 0.8), // Cap at 10 minutes
    summarizing: Math.min(120, baseSummarizationTime * 0.8), // Cap at 2 minutes
  };

  // Return time based on current stage
  switch (stage) {
    case 'uploading':
      return Math.round(adjustedTimes.uploading);
    case 'processing':
      return Math.round(adjustedTimes.processing);
    case 'chunking':
      return Math.round(adjustedTimes.chunking);
    case 'transcribing':
      return Math.round(adjustedTimes.transcribing);
    case 'summarizing':
      return Math.round(adjustedTimes.summarizing);
    default:
      return 0;
  }
}

/**
 * Estimates the number of chunks a file will be split into based on size
 * 
 * @param fileSize File size in bytes
 * @returns Estimated number of chunks
 */
export function estimateChunks(fileSize: number): number {
  const MAX_CHUNK_SIZE = 25 * 1024 * 1024; // 25MB max chunk size
  return Math.ceil(fileSize / MAX_CHUNK_SIZE);
}

/**
 * Calculates progress percentage based on elapsed time and estimated total time
 * 
 * @param elapsedTime Time elapsed so far in seconds
 * @param estimatedTotalTime Total estimated time for the stage in seconds
 * @returns Progress percentage (0-100)
 */
export function calculateProgressFromTime(
  elapsedTime: number, 
  estimatedTotalTime: number
): number {
  if (estimatedTotalTime <= 0) return 100;
  const progress = (elapsedTime / estimatedTotalTime) * 100;
  return Math.min(99, Math.round(progress)); // Cap at 99% to avoid showing 100% before completion
}

/**
 * Determines the appropriate initial message for a pipeline stage
 * 
 * @param stage Pipeline stage
 * @param fileDetails Optional file details
 * @returns Status message
 */
export function getInitialStageMessage(
  stage: PipelineStage,
  fileDetails?: { fileName?: string; fileSize?: number; totalChunks?: number }
): string {
  switch (stage) {
    case 'uploading':
      return `Bestand ${fileDetails?.fileName || ''} wordt geüpload...`;
    case 'processing':
      return 'Audio wordt geoptimaliseerd voor transcriptie...';
    case 'chunking':
      if (fileDetails?.totalChunks && fileDetails.totalChunks > 1) {
        return `Bestand wordt opgesplitst in ${fileDetails.totalChunks} delen voor verwerking...`;
      }
      return 'Bestand wordt voorbereid voor transcriptie...';
    case 'transcribing':
      return 'Spraak wordt omgezet naar tekst...';
    case 'summarizing':
      return 'AI analyseert transcriptie en genereert een samenvatting...';
    case 'completed':
      return 'Alle stappen succesvol afgerond!';
    case 'error':
      return 'Er is een fout opgetreden tijdens de verwerking.';
    default:
      return 'Bezig met verwerking...';
  }
}