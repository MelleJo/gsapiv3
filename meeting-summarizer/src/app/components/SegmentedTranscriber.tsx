'use client';

import { useState, useEffect } from 'react';
import { splitAudioBlob, joinTranscriptions, SEGMENT_SIZE } from '@/lib/audioChunker';
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
}

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

  // Start processing when audio file is provided
  useEffect(() => {
    if (audioFile && !isProcessing) {
      processAudioFile(audioFile);
    }
  }, [audioFile]);

  // Track overall progress across all segments
  useEffect(() => {
    if (segments.length === 0) return;
    
    const totalProgress = segments.reduce((sum, segment) => sum + segment.progress, 0);
    const newProgress = Math.round(totalProgress / segments.length);
    
    setOverallProgress(newProgress);
    if (onProgress) onProgress(newProgress);
    
    // Check if all segments are complete
    const allCompleted = segments.every(s => s.status === 'completed');
    if (allCompleted && segments.length > 0) {
      // Combine all transcriptions
      const transcriptions = segments
        .sort((a, b) => a.id - b.id)
        .map(s => s.transcription || '');
      
      const fullTranscription = joinTranscriptions(transcriptions);
      onTranscriptionComplete(fullTranscription);
    }
    
    // Check if any segment has an error
    const errorSegment = segments.find(s => s.status === 'error');
    if (errorSegment) {
      onError(errorSegment.error || 'Error processing audio segment');
    }
  }, [segments]);

  const processAudioFile = async (file: File) => {
    try {
      setIsProcessing(true);
      console.log(`Processing audio file: ${file.name}, size: ${(file.size / (1024 * 1024)).toFixed(2)}MB`);
      
      // Split the file into segments
      const audioBlobs = await splitAudioBlob(file, SEGMENT_SIZE);
      console.log(`Split into ${audioBlobs.length} segments`);
      
      // Initialize segment statuses
      const initialSegments: SegmentStatus[] = audioBlobs.map((_, index) => ({
        id: index,
        status: 'pending',
        progress: 0
      }));
      setSegments(initialSegments);
      
      // Process each segment (limit to 2 concurrent segments)
      const CONCURRENT_LIMIT = 2;
      for (let i = 0; i < audioBlobs.length; i += CONCURRENT_LIMIT) {
        const segmentGroup = audioBlobs.slice(i, i + CONCURRENT_LIMIT);
        const segmentIds = Array.from({ length: segmentGroup.length }, (_, idx) => i + idx);
        
        // Process group in parallel
        await Promise.all(
          segmentGroup.map((blob, groupIndex) => 
            processSegment(blob, segmentIds[groupIndex], file.name)
          )
        );
        
        // Add a small delay between groups
        if (i + CONCURRENT_LIMIT < audioBlobs.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      console.error('Audio processing error:', error);
      onError(`Failed to process audio file: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const processSegment = async (blob: Blob, segmentId: number, originalFileName: string) => {
    try {
      // Update segment status to uploading
      updateSegmentStatus(segmentId, { status: 'uploading', progress: 10 });
      
      // Create a unique segment name
      const segmentName = `segment_${segmentId}_${Date.now()}_${originalFileName}`;
      
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
        90000, // 90 second timeout
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
      updateSegmentStatus(segmentId, { 
        status: 'error', 
        error: error instanceof Error ? error.message : String(error),
        progress: 0
      });
    }
  };

  const updateSegmentStatus = (segmentId: number, update: Partial<SegmentStatus>) => {
    setSegments(prevSegments => 
      prevSegments.map(segment => 
        segment.id === segmentId ? { ...segment, ...update } : segment
      )
    );
  };

  return (
    <div className="segmented-transcriber">
      {isProcessing && (
        <div className="transcription-progress">
          <div className="mb-2 text-sm text-neutral-600">
            Processing audio in segments ({overallProgress}%)
          </div>
          
          <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-in-out" 
              style={{ width: `${overallProgress}%` }}
            ></div>
          </div>
          
          {/* Segment progress bars */}
          <div className="space-y-2">
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
                        segment.status === 'completed' ? 'bg-green-500' : 'bg-blue-400'
                      }`}
                      style={{ width: `${segment.progress}%` }}
                    ></div>
                  </div>
                </div>
                <div className="w-24 flex-shrink-0 text-xs ml-2 text-neutral-500">
                  {segment.status === 'pending' && 'Pending'}
                  {segment.status === 'uploading' && 'Uploading...'}
                  {segment.status === 'processing' && 'Processing...'}
                  {segment.status === 'completed' && 'Completed'}
                  {segment.status === 'error' && (
                    <span className="text-red-500">Error</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
