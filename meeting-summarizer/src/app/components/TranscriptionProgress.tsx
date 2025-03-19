'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

// Create a casted MotionDiv to bypass TS errors regarding className
const MotionDiv: any = motion.div;

interface TranscriptionProgressProps {
  isActive: boolean;
  currentPhase: 'uploading' | 'processing' | 'transcribing' | 'complete';
  progress?: number;
  fileSize?: number;
  fileName?: string;
}

export default function TranscriptionProgress({
  isActive,
  currentPhase,
  progress = 0,
  fileSize = 0,
  fileName = ''
}: TranscriptionProgressProps) {
  const [progressPercent, setProgressPercent] = useState(0);
  const [estimatedTimeLeft, setEstimatedTimeLeft] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  
  // Initialize start time when active
  useEffect(() => {
    if (isActive && !startTime) {
      setStartTime(Date.now());
    } else if (!isActive) {
      setStartTime(null);
      setEstimatedTimeLeft(null);
    }
  }, [isActive, startTime]);

  // Update progress and estimate time remaining
  useEffect(() => {
    if (isActive) {
      // Cap progress at 90% for transcribing phase since we don't have exact progress
      const cappedProgress = currentPhase === 'transcribing' && progress > 90 ? 90 : progress;
      
      // For smoother animation, use a slightly delayed approach
      const timer = setTimeout(() => {
        setProgressPercent((prev) => {
          // If the new progress is higher, move toward it
          if (cappedProgress > prev) {
            return prev + Math.min(5, cappedProgress - prev);
          }
          // If in transcribing phase and no exact progress, slowly increment
          if (currentPhase === 'transcribing' && progress === 0) {
            return Math.min(90, prev + 0.5);
          }
          return prev;
        });
      }, 100);
      
      // Calculate estimated time - only if we have startTime and current progress
      if (startTime && progressPercent > 5) {
        const elapsedMs = Date.now() - startTime;
        // Only estimate if we have some meaningful progress
        if (progressPercent > 0) {
          // Estimate total time based on elapsed time and progress
          const estimatedTotalMs = (elapsedMs / progressPercent) * 100;
          const remainingMs = Math.max(0, estimatedTotalMs - elapsedMs);
          setEstimatedTimeLeft(Math.round(remainingMs / 1000)); // to seconds
        }
      }
      
      return () => clearTimeout(timer);
    } else {
      // Reset when inactive
      setProgressPercent(0);
    }
  }, [isActive, currentPhase, progress, progressPercent, startTime]);

  // When phase changes to complete, set progress to 100%
  useEffect(() => {
    if (currentPhase === 'complete') {
      setProgressPercent(100);
    }
  }, [currentPhase]);

  // Format the estimated time remaining
  const formatTimeLeft = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds} sec`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')} min`;
  };

  // Get the status text based on the current phase
  const getStatusText = (): string => {
    switch (currentPhase) {
      case 'uploading':
        return 'Bestand uploaden...';
      case 'processing':
        return 'Audio verwerken...';
      case 'transcribing':
        return 'Transcriptie uitvoeren...';
      case 'complete':
        return 'Transcriptie voltooid!';
      default:
        return '';
    }
  };

  // If not active, don't render
  if (!isActive) return null;

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 overflow-hidden">
      <div className="mb-3 flex justify-between items-center">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-3">
            {currentPhase === 'complete' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5"></path>
              </svg>
            ) : (
              <MotionDiv
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                </svg>
              </MotionDiv>
            )}
          </div>
          <h3 className="text-lg font-medium text-neutral-800">
            {getStatusText()}
          </h3>
        </div>
        
        {fileName && (
          <div className="text-sm text-neutral-500 bg-neutral-50 px-3 py-1 rounded-full truncate max-w-xs">
            {fileName}
          </div>
        )}
      </div>
      
      {/* Main progress bar */}
      <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden mb-2">
        <MotionDiv
          className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ type: 'spring', stiffness: 50, damping: 10 }}
        />
      </div>
      
      {/* Progress information */}
      <div className="flex justify-between items-center text-sm text-neutral-500">
        <div className="flex items-center">
          {currentPhase !== 'complete' && (
            <MotionDiv
              className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-2"
              animate={{ scale: [1, 1.5, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
          <span>{Math.round(progressPercent)}%</span>
        </div>
        
        {estimatedTimeLeft !== null && currentPhase !== 'complete' && (
          <div>
            Nog ongeveer {formatTimeLeft(estimatedTimeLeft)}
          </div>
        )}
        
        {fileSize > 0 && (
          <div>
            {(fileSize / (1024 * 1024)).toFixed(1)} MB
          </div>
        )}
      </div>
      
      {/* Phase indicator dots */}
      <div className="mt-4 flex items-center justify-between max-w-md mx-auto">
        <PhaseIndicator 
          active={currentPhase === 'uploading' || currentPhase === 'processing' || currentPhase === 'transcribing' || currentPhase === 'complete'} 
          completed={currentPhase !== 'uploading'}
          label="Uploaden"
        />
        <div className="w-16 h-0.5 bg-gray-200">
          <MotionDiv
            className="h-full bg-blue-500" 
            initial={{ width: 0 }}
            animate={{ 
              width: currentPhase === 'uploading' ? '50%' : 
                     currentPhase === 'processing' || currentPhase === 'transcribing' || currentPhase === 'complete' ? '100%' : '0%' 
            }}
            transition={{ type: 'spring', stiffness: 50, damping: 10 }}
          />
        </div>
        <PhaseIndicator 
          active={currentPhase === 'processing' || currentPhase === 'transcribing' || currentPhase === 'complete'} 
          completed={currentPhase !== 'processing'}
          label="Verwerken"
        />
        <div className="w-16 h-0.5 bg-gray-200">
          <MotionDiv
            className="h-full bg-blue-500" 
            initial={{ width: 0 }}
            animate={{ 
              width: currentPhase === 'processing' ? '50%' : 
                     currentPhase === 'transcribing' || currentPhase === 'complete' ? '100%' : '0%' 
            }}
            transition={{ type: 'spring', stiffness: 50, damping: 10 }}
          />
        </div>
        <PhaseIndicator 
          active={currentPhase === 'transcribing' || currentPhase === 'complete'} 
          completed={currentPhase === 'complete'}
          label="Transcriberen"
        />
        <div className="w-16 h-0.5 bg-gray-200">
          <MotionDiv
            className="h-full bg-blue-500" 
            initial={{ width: 0 }}
            animate={{ 
              width: currentPhase === 'transcribing' ? '50%' : 
                     currentPhase === 'complete' ? '100%' : '0%' 
            }}
            transition={{ type: 'spring', stiffness: 50, damping: 10 }}
          />
        </div>
        <PhaseIndicator 
          active={currentPhase === 'complete'} 
          completed={false}
          label="Voltooid"
        />
      </div>
    </div>
  );
}

// Sub-component for phase indicator
function PhaseIndicator({ active, completed, label }: { active: boolean; completed: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <MotionDiv
        className={`w-5 h-5 rounded-full flex items-center justify-center ${active ? 'bg-blue-500' : 'bg-gray-200'}`}
        animate={{ 
          scale: active && !completed ? [1, 1.1, 1] : 1,
          backgroundColor: active ? (completed ? '#3b82f6' : '#3b82f6') : '#e5e7eb'
        }}
        transition={{ 
          scale: { duration: 1.5, repeat: active && !completed ? Infinity : 0 },
          backgroundColor: { duration: 0.3 }
        }}
      >
        {completed && (
          <MotionDiv
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 10 }}
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="12" 
              height="12" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="white" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M20 6L9 17l-5-5"></path>
            </svg>
          </MotionDiv>
        )}
      </MotionDiv>
      <span className={`text-xs mt-1 ${active ? 'text-blue-600 font-medium' : 'text-neutral-400'}`}>
        {label}
      </span>
    </div>
  );
}
