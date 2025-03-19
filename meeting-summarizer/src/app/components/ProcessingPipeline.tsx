'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import React, { HTMLAttributes, forwardRef } from 'react';

// Define proper types for motion components
type MotionProps = any;
type MotionDivProps = HTMLAttributes<HTMLDivElement> & MotionProps;
const MotionDiv = forwardRef<HTMLDivElement, MotionDivProps>((props, ref) => (
  <motion.div ref={ref} {...props} />
));
MotionDiv.displayName = 'MotionDiv';

// Pipeline stages
export type PipelineStage = 
  | 'uploading'     // File is being uploaded to Vercel Blob
  | 'processing'    // Audio file is being processed (converted if needed)
  | 'chunking'      // File is being split into chunks if needed
  | 'transcribing'  // Audio is being transcribed
  | 'summarizing'   // Transcription is being summarized
  | 'completed'     // All done
  | 'error';        // Error occurred

// Pipeline status information
export interface PipelineStatus {
  stage: PipelineStage;
  progress: number;               // 0-100 progress percentage
  message: string;                // Current status message
  estimatedTimeLeft?: number;     // Seconds remaining (if available)
  error?: string;                 // Error message if stage is 'error'
  details?: {                     // Additional details about the current stage
    currentChunk?: number;
    totalChunks?: number;
    fileName?: string;
    fileSize?: number;
  };
}

interface ProcessingPipelineProps {
  isActive: boolean;
  status: PipelineStatus;
  onCancel?: () => void;
}

export default function ProcessingPipeline({
  isActive,
  status,
  onCancel
}: ProcessingPipelineProps) {
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Start timer when active
  useEffect(() => {
    if (isActive) {
      intervalRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setElapsedTime(0);
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive]);

  // Format time for display
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  // Get stage title
  const getStageName = (): string => {
    switch (status.stage) {
      case 'uploading': return 'Bestand uploaden';
      case 'processing': return 'Audio verwerken';
      case 'chunking': return 'Bestand voorbereiden';
      case 'transcribing': return 'Audio transcriberen';
      case 'summarizing': return 'Samenvatting genereren';
      case 'completed': return 'Verwerking voltooid';
      case 'error': return 'Fout opgetreden';
      default: return 'Verwerken...';
    }
  };

  // Get stage description
  const getStageDescription = (): string => {
    if (status.message) return status.message;
    
    switch (status.stage) {
      case 'uploading': 
        return 'Uw bestand wordt geüpload naar onze beveiligde servers...';
      case 'processing': 
        return 'Audiobestand wordt geoptimaliseerd voor transcriptie...';
      case 'chunking': 
        return status.details?.totalChunks && status.details.totalChunks > 1
          ? `Bestand wordt opgesplitst in ${status.details.totalChunks} delen voor verwerking...`
          : 'Bestand wordt voorbereid voor transcriptie...';
      case 'transcribing': 
        return status.details?.currentChunk && status.details?.totalChunks
          ? `Transcriberen deel ${status.details.currentChunk}/${status.details.totalChunks}...`
          : 'Spraak wordt omgezet naar tekst...';
      case 'summarizing': 
        return 'AI analyseert transcriptie en genereert een samenvatting...';
      case 'completed': 
        return 'Alle verwerkingsstappen zijn voltooid!';
      case 'error': 
        return status.error || 'Er is een fout opgetreden tijdens de verwerking.';
      default: 
        return 'Bezig met verwerken...';
    }
  };

  // Convert stage to numerical index for progress bar
  const getStageIndex = (): number => {
    const stages: PipelineStage[] = ['uploading', 'processing', 'chunking', 'transcribing', 'summarizing', 'completed'];
    return stages.indexOf(status.stage);
  };

  // Calculate overall progress across all stages
  const calculateOverallProgress = (): number => {
    const totalStages = 5; // Upload, process, chunk, transcribe, summarize
    const stageIndex = getStageIndex();
    const stageProgress = status.progress / 100;
    
    if (status.stage === 'completed') return 100;
    if (status.stage === 'error') return 0;
    
    // Each stage contributes 1/totalStages to the overall progress
    return Math.min(100, Math.round(((stageIndex + stageProgress) / totalStages) * 100));
  };

  if (!isActive) return null;

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-white bg-opacity-90 backdrop-blur-sm z-50 flex items-center justify-center"
        >
          <div className="w-full max-w-3xl px-6">
            <div className="bg-white rounded-2xl shadow-xl p-8 relative">
              {/* Header with pipeline stage name */}
              <div className="mb-6 flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">
                  {getStageName()}
                </h2>
                
                <div className="flex items-center gap-3">
                  <div className="text-sm text-gray-500">
                    Verstreken tijd: {formatTime(elapsedTime)}
                  </div>
                  
                  {onCancel && status.stage !== 'completed' && (
                    <button 
                      onClick={onCancel}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                      aria-label="Annuleren"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              
              {/* Status message */}
              <p className="text-gray-600 mb-6">
                {getStageDescription()}
              </p>
              
              {/* File details if available */}
              {status.details?.fileName && (
                <div className="bg-blue-50 rounded-lg p-3 mb-6 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                  </svg>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-blue-700 truncate">{status.details.fileName}</div>
                    {status.details.fileSize && (
                      <div className="text-xs text-blue-500">
                        {(status.details.fileSize / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Overall progress bar */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-500">Totale voortgang</span>
                  <span className="text-sm font-medium text-gray-700">{calculateOverallProgress()}%</span>
                </div>
                <div className="h-2.5 w-full bg-gray-200 rounded-full overflow-hidden">
                  <MotionDiv 
                    className="h-full bg-gradient-to-r from-blue-600 to-purple-600"
                    initial={{ width: 0 }}
                    animate={{ width: `${calculateOverallProgress()}%` }}
                    transition={{ type: 'spring', stiffness: 50, damping: 15 }}
                  />
                </div>
              </div>
              
              {/* Current stage progress bar */}
              {status.stage !== 'completed' && status.stage !== 'error' && (
                <div className="mb-8">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-500">Huidige stap</span>
                    <div className="flex items-center gap-2">
                      <MotionDiv
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 1.5 }}
                        className="w-1.5 h-1.5 rounded-full bg-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">{status.progress}%</span>
                    </div>
                  </div>
                  <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                    <MotionDiv 
                      className="h-full bg-blue-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${status.progress}%` }}
                      transition={{ type: 'spring', stiffness: 60, damping: 15 }}
                    />
                  </div>
                </div>
              )}
              
              {/* Time estimate if available */}
              {status.estimatedTimeLeft !== undefined && status.stage !== 'completed' && status.stage !== 'error' && (
                <div className="text-center text-sm text-gray-500 mb-6">
                  <span>
                    Geschatte resterende tijd: {formatTime(status.estimatedTimeLeft)}
                  </span>
                </div>
              )}
              
              {/* Pipeline visualization */}
              <div className="mt-8">
                <div className="relative">
                  <div className="absolute left-0 right-0 top-6 h-0.5 bg-gray-200"></div>
                  <div className="flex justify-between relative">
                    <PipelineStepIndicator 
                      label="Uploaden"
                      completed={getStageIndex() > 0}
                      active={status.stage === 'uploading'}
                    />
                    <PipelineStepIndicator 
                      label="Verwerken"
                      completed={getStageIndex() > 1}
                      active={status.stage === 'processing' || status.stage === 'chunking'}
                    />
                    <PipelineStepIndicator 
                      label="Transcriberen"
                      completed={getStageIndex() > 3}
                      active={status.stage === 'transcribing'}
                    />
                    <PipelineStepIndicator 
                      label="Samenvatten"
                      completed={getStageIndex() > 4}
                      active={status.stage === 'summarizing'}
                    />
                    <PipelineStepIndicator 
                      label="Voltooid"
                      completed={status.stage === 'completed'}
                      active={false}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Sub-component for pipeline step indicators
function PipelineStepIndicator({
  label,
  completed,
  active
}: {
  label: string;
  completed: boolean;
  active: boolean;
}) {
  return (
    <div className="flex flex-col items-center z-10">
      <MotionDiv
        className={`w-12 h-12 rounded-full flex items-center justify-center z-10 border-2 ${
          completed
            ? 'bg-blue-600 border-blue-600 text-white'
            : active
            ? 'bg-white border-blue-500 text-blue-500'
            : 'bg-white border-gray-300 text-gray-400'
        }`}
        animate={active ? { 
          scale: [1, 1.05, 1],
          boxShadow: ['0 0 0 0 rgba(59, 130, 246, 0)', '0 0 0 4px rgba(59, 130, 246, 0.3)', '0 0 0 0 rgba(59, 130, 246, 0)']
        } : {}}
        transition={{ duration: 2, repeat: active ? Infinity : 0 }}
      >
        {completed ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        ) : (
          <span className="text-sm">{label.charAt(0)}</span>
        )}
      </MotionDiv>
      <span className={`mt-2 text-xs ${completed ? 'text-blue-600 font-medium' : active ? 'text-blue-500 font-medium' : 'text-gray-500'}`}>
        {label}
      </span>
    </div>
  );
}