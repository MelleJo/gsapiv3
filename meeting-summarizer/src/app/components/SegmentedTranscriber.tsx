'use client';

import { useState, useEffect, useCallback } from 'react';
import { splitAudioBlob, joinTranscriptions, formatBytes } from '@/lib/audioChunker';
import { upload } from '@vercel/blob/client';
import { withTimeout } from '@/lib/utils';

interface SegmentedTranscriberProps {
  audioFile: File | null;
  onTranscriptionComplete: (transcription: string) => void;
  onError: (error: string) => void;
  onProgress?: (progress: number) => void;
  model?: string;
}

interface SegmentStatus {
  id: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  blobUrl?: string;
  transcription?: string;
  error?: string;
  progress: number;
  retries: number;
}

const MAX_RETRIES = 3;
const SEGMENT_SIZE = 2 * 1024 * 1024; // 2MB segments for greater reliability
const CONCURRENT_LIMIT = 2; // Process 2 segments at a time
const TIMEOUT_PER_SEGMENT = 120 * 1000; // 2 minutes per segment
const DELAY_BETWEEN_SEGMENTS = 1500; // 1.5 seconds between segments

export default function SegmentedTranscriber({
  audioFile,
  onTranscriptionComplete,
  onError,
  onProgress,
  model = 'whisper-1'
}: SegmentedTranscriberProps) {
  const [segments, setSegments] = useState<SegmentStatus[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [overallProgress, setOverallProgress] = useState<number>(0);
  const [activeSegments, setActiveSegments] = useState<number>(0);

  // Use useCallback to avoid recreating these functions on every render
  const updateSegmentStatus = useCallback((segmentId: number, update: Partial<SegmentStatus>) => {
    setSegments(prevSegments => 
      prevSegments.map(segment => 
        segment.id === segmentId ? { ...segment, ...update } : segment
      )
    );
  }, []);

  const processSegment = useCallback(async (blob: Blob, segmentId: number, originalFileName: string): Promise<void> => {
    try {
      // Update segment status to uploading
      updateSegmentStatus(segmentId, { status: 'uploading', progress: 10 });
      
      // Create a unique segment name
      const segmentName = `segment_${segmentId}_${Date.now()}_${originalFileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      
      // Upload the segment
      const segmentBlob = await upload(segmentName, blob, {
        access: 'public',
        handleUploadUrl: '/api/client-upload',
        onUploadProgress: (progress) => {
          updateSegmentStatus(segmentId, { 
            progress: 10 + Math.round(progress.percentage * 0.4) 
          });
        }
      });
      
      // Update segment status to processing
      updateSegmentStatus(segmentId, { 
        status: 'processing', 
        blobUrl: segmentBlob.url,
        progress: 50
      });
      
      // Process the segment with API
      const segmentResponse = await withTimeout(
        fetch('/api/transcribe-segment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            blobUrl: segmentBlob.url,
            fileName: segmentName,
            segmentId,
            model
          })
        }),
        TIMEOUT_PER_SEGMENT,
        `Segment ${segmentId} processing timed out`
      );
      
      // Handle API response
      if (!segmentResponse.ok) {
        throw new Error(`Segment ${segmentId} processing failed: ${segmentResponse.status} ${segmentResponse.statusText}`);
      }
      
      const result = await segmentResponse.json();
      
      if (result.error) {
        throw new Error(`Segment ${segmentId} processing error: ${result.error}`);
      }
      
      // Update segment status to completed
      updateSegmentStatus(segmentId, { 
        status: 'completed', 
        transcription: result.transcription,
        progress: 100
      });
      
    } catch (error) {
      console.error(`Segment ${segmentId} error:`, error);
      
      // Check if we should retry
      const segment = segments.find(s => s.id === segmentId);
      if (segment && segment.retries < MAX_RETRIES) {
        console.log(`Retrying segment ${segmentId}, attempt ${segment.retries + 1} of ${MAX_RETRIES}`);
        updateSegmentStatus(segmentId, { 
          status: 'pending',
          retries: segment.retries + 1,
          progress: 0,
          error: `Retry ${segment.retries + 1}/${MAX_RETRIES}: ${error instanceof Error ? error.message : String(error)}`
        });
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_SEGMENTS * (segment.retries + 1)));
        
        // Retry processing this segment
        await processSegment(blob, segmentId, originalFileName);
      } else {
        // Mark as error if we've exhausted all retries
        updateSegmentStatus(segmentId, { 
          status: 'error', 
          error: error instanceof Error ? error.message : String(error),
          progress: 0
        });
      }
    } finally {
      setActiveSegments(prev => Math.max(0, prev - 1));
    }
  }, [segments, updateSegmentStatus]);

  // Function to sequentially process segments
  const processSegmentsSequentially = useCallback(async (
    blobs: Blob[], 
    fileName: string
  ) => {
    const maxConcurrent = blobs.length > 20 ? 1 : CONCURRENT_LIMIT; // Use single concurrency for very large files
    let completedSegments = 0;
    let failedSegments = 0;
    
    try {
      // Process segments in groups to maintain concurrency limit
      for (let i = 0; i < blobs.length; i += maxConcurrent) {
        // Take a group of segments up to the concurrency limit
        const groupSize = Math.min(maxConcurrent, blobs.length - i);
        const groupIndices = Array.from({ length: groupSize }, (_, idx) => i + idx);
        
        console.log(`Processing segment group ${i / maxConcurrent + 1}: segments ${groupIndices.map(idx => idx + 1).join(', ')}`);
        
        // Start processing all segments in this group
        setActiveSegments(prev => prev + groupSize);
        
        // Create all the processing promises
        const groupPromises = groupIndices.map(idx => {
          const segment = segments[idx];
          // Only process pending segments
          if (segment.status === 'pending') {
            return processSegment(blobs[idx], idx, fileName);
          }
          return Promise.resolve(); // Skip segments that are not pending
        });
        
        // Wait for all segments in this group to complete
        await Promise.all(groupPromises);
        
        // Count completed and failed segments
        const currentSegments = segments.slice(0, i + groupSize);
        completedSegments = currentSegments.filter(s => s.status === 'completed').length;
        failedSegments = currentSegments.filter(s => s.status === 'error').length;
        
        // Check if we should continue
        if (failedSegments > Math.ceil(blobs.length * 0.3)) { // More than 30% failed
          throw new Error(`Too many segment failures: ${failedSegments} out of ${currentSegments.length} segments failed`);
        }
        
        // Wait a bit before starting the next group
        if (i + groupSize < blobs.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_SEGMENTS));
        }
      }
      
      // Final check after all segments are processed
      const allCompleted = segments.filter(s => s.status === 'completed').length;
      const allFailed = segments.filter(s => s.status === 'error').length;
      
      if (allFailed > Math.ceil(blobs.length * 0.3)) { // More than 30% failed
        throw new Error(`Too many segment failures: ${allFailed} out of ${blobs.length} segments failed`);
      }
      
      // Generate final transcription
      const transcriptions = segments
        .filter(s => s.status === 'completed')
        .sort((a, b) => a.id - b.id)
        .map(s => s.transcription || '');
      
      if (transcriptions.length === 0) {
        throw new Error('No segments were successfully transcribed');
      }
      
      // Join the transcriptions
      const fullTranscription = joinTranscriptions(transcriptions);
      
      // Report success
      console.log(`Transcription complete: ${allCompleted} of ${blobs.length} segments successful (${allFailed} failed)`);
      
      // If some segments failed, add a note to the transcription
      let finalTranscription = fullTranscription;
      if (allFailed > 0) {
        finalTranscription = `[Let op: ${allFailed} van de ${blobs.length} segmenten konden niet worden verwerkt. De transcriptie is mogelijk incompleet.]\n\n${fullTranscription}`;
      }
      
      onTranscriptionComplete(finalTranscription);
      
    } catch (error) {
      console.error('Error processing segments:', error);
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsProcessing(false);
    }
  }, [segments, processSegment, onTranscriptionComplete, onError]);

  // Start processing when audio file is provided
  useEffect(() => {
    if (audioFile && !isProcessing) {
      processAudioFile(audioFile);
    }
  }, [audioFile, isProcessing]);

  // Track overall progress across all segments
  useEffect(() => {
    if (segments.length === 0) return;
    
    const totalProgress = segments.reduce((sum, segment) => sum + segment.progress, 0);
    const newProgress = Math.round(totalProgress / segments.length);
    
    setOverallProgress(newProgress);
    if (onProgress) onProgress(newProgress);
    
  }, [segments, onProgress]);

  // Main function to process audio file
  async function processAudioFile(file: File) {
    try {
      setIsProcessing(true);
      console.log(`Processing audio file: ${file.name}, size: ${formatBytes(file.size)}`);
      
      // Split the file into segments
      const audioBlobs = await splitAudioBlob(file, SEGMENT_SIZE);
      console.log(`Split into ${audioBlobs.length} segments`);
      
      // Initialize segment statuses
      const initialSegments: SegmentStatus[] = audioBlobs.map((_, index) => ({
        id: index,
        status: 'pending',
        progress: 0,
        retries: 0
      }));
      setSegments(initialSegments);
      
      // Start processing segments
      await processSegmentsSequentially(audioBlobs, file.name);
      
    } catch (error) {
      console.error('Audio processing error:', error);
      onError(`Failed to process audio file: ${error instanceof Error ? error.message : String(error)}`);
      setIsProcessing(false);
    }
  }

  return (
    <div className="segmented-transcriber">
      {isProcessing && (
        <div className="transcription-progress">
          <div className="mb-2 text-sm text-neutral-600">
            {activeSegments > 0 ? 
              `Verwerken van ${segments.length} segmenten (${activeSegments} actief, ${overallProgress}% totaal voltooid)` : 
              `Verwerking audio in segmenten (${overallProgress}%)`
            }
          </div>
          
          <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-in-out" 
              style={{ width: `${overallProgress}%` }}
            ></div>
          </div>
          
          {/* Segment progress bars */}
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {segments.map((segment) => (
              <div key={segment.id} className="flex items-center">
                <div className="w-8 flex-shrink-0 text-xs text-neutral-500">
                  {segment.id + 1}
                </div>
                <div className="flex-grow">
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div 
                      className={`h-1.5 rounded-full transition-all duration-300 ease-in-out ${
                        segment.status === 'error' ? 'bg-red-500' : 
                        segment.status === 'completed' ? 'bg-green-500' : 
                        segment.status === 'processing' ? 'bg-blue-400' :
                        segment.status === 'uploading' ? 'bg-yellow-400' : 'bg-gray-300'
                      }`}
                      style={{ width: `${segment.progress}%` }}
                    ></div>
                  </div>
                </div>
                <div className="w-28 flex-shrink-0 text-xs ml-2 text-neutral-500">
                  {segment.status === 'pending' && 'Wachtend...'}
                  {segment.status === 'uploading' && 'Uploaden...'}
                  {segment.status === 'processing' && 'Verwerken...'}
                  {segment.status === 'completed' && 'Voltooid'}
                  {segment.status === 'error' && (
                    <span className="text-red-500">Fout</span>
                  )}
                  {segment.retries > 0 && ` (${segment.retries}/${MAX_RETRIES})`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}