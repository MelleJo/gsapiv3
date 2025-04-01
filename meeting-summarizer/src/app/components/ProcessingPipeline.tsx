'use client';

import { useState, useEffect, useRef } from 'react';
import React from 'react';
import { AnimatePresence, motion } from 'framer-motion'; // Keep framer-motion for step animation
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { X as IconX, Check, Loader2, FileText, BrainCircuit, UploadCloud, Settings2, CheckCircle } from 'lucide-react'; // Import icons
import { cn } from "@/lib/utils"; // Import cn utility

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

  // Update time estimate more frequently
  useEffect(() => {
    if (isActive && status.stage !== 'completed' && status.stage !== 'error') {
      const updateInterval = setInterval(() => {
        if (status.estimatedTimeLeft && status.estimatedTimeLeft > 0) { // Check if > 0
          const newEstimate = Math.max(0, status.estimatedTimeLeft - 1); // Can go to 0
          // Directly mutate status prop - might be better to lift state or use callback
          status.estimatedTimeLeft = newEstimate;
        }
      }, 1000); // Update every second

      return () => clearInterval(updateInterval);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, status.stage, status.estimatedTimeLeft]); // Added dependencies

  // Format time for display
  const formatTime = (seconds: number): string => {
    const roundedSeconds = Math.round(seconds);
    if (roundedSeconds < 60) {
      return `${roundedSeconds} sec`;
    }
    const mins = Math.floor(roundedSeconds / 60);
    const secs = roundedSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')} min`;
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
    if (status.error && status.stage === 'error') return status.error; // Show error message if present
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
      case 'error': // Fallback error message
        return 'Er is een onbekende fout opgetreden tijdens de verwerking.';
      default:
        return 'Bezig met verwerken...';
    }
  };

  // Convert stage to numerical index for progress bar
  const getStageIndex = (): number => {
    const stages: PipelineStage[] = ['uploading', 'processing', 'chunking', 'transcribing', 'summarizing', 'completed'];
    const index = stages.indexOf(status.stage);
    // If stage is 'error' or not found, return a value indicating progress stopped before completion
    if (index === -1 || status.stage === 'error') {
        // Find the last non-error/non-completed stage if possible
        const lastKnownGoodIndex = stages.indexOf(status.stage === 'error' ? (stages[stages.length-2]) : status.stage); // A bit complex, might need refinement based on actual error flow
        return lastKnownGoodIndex !== -1 ? lastKnownGoodIndex : 0; // Default to 0 if error occurs very early
    }
    return index;
  };


  // Calculate overall progress across all stages
  const calculateOverallProgress = (): number => {
    const totalStages = 5; // Upload, process/chunk, transcribe, summarize
    const stageIndex = getStageIndex();
    const stageProgress = status.progress / 100;

    if (status.stage === 'completed') return 100;
    // If error, show progress up to the point of error
    if (status.stage === 'error') {
        return Math.min(100, Math.round(((stageIndex + stageProgress) / totalStages) * 100));
    }

    return Math.min(100, Math.round(((stageIndex + stageProgress) / totalStages) * 100));
  };


  return (
    <AnimatePresence>
      {isActive && (
        // Use standard div with fade transition (can add framer-motion later if needed)
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-300"
           style={{ opacity: isActive ? 1 : 0 }} // Simple fade
         >
           {/* Add conditional border when active */}
           <Card className={cn(
               "w-full max-w-2xl shadow-2xl",
               isActive && "border-blue-500 border-2" // Add blue border when active
            )}>
             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b"> {/* Adjust header layout */}
               <div className="space-y-1">
                 <CardTitle className="text-xl"> {/* Adjust title size */}
                  {getStageName()}
                </CardTitle>
                <CardDescription>
                  Verstreken tijd: {formatTime(elapsedTime)}
                </CardDescription>
              </div>
              {onCancel && status.stage !== 'completed' && status.stage !== 'error' && ( // Don't show cancel on completed/error
                <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Annuleren">
                  <IconX className="h-5 w-5" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="pt-6 space-y-6"> {/* Add spacing */}
              {/* Status message */}
              <p className={`text-center ${status.stage === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
                {getStageDescription()}
              </p>

              {/* File details if available */}
              {status.details?.fileName && (
                <div className="bg-muted/50 rounded-lg p-3 flex items-center text-sm">
                  <FileText className="h-5 w-5 text-primary mr-3 flex-shrink-0" />
                  <div className="flex-1 overflow-hidden">
                    <div className="font-medium truncate">{status.details.fileName}</div>
                    {status.details.fileSize && (
                      <div className="text-xs text-muted-foreground">
                        {(status.details.fileSize / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Single progress bar - Hide on error/completed */}
              {status.stage !== 'completed' && status.stage !== 'error' && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Voortgang</span>
                    <div className="flex items-center gap-2 font-medium">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" /> {/* Use Loader icon */}
                      <span>{calculateOverallProgress()}%</span>
                    </div>
                  </div>
                  <Progress value={calculateOverallProgress()} className="w-full h-2" /> {/* Use Progress component */}
                </div>
              )}

              {/* Time estimate if available - Hide on error/completed */}
              {status.estimatedTimeLeft !== undefined && status.estimatedTimeLeft > 0 && status.stage !== 'completed' && status.stage !== 'error' && (
                <div className="text-center text-sm text-muted-foreground">
                  <span>
                    Geschatte resterende tijd: {formatTime(status.estimatedTimeLeft)}
                  </span>
                </div>
              )}

              {/* Pipeline visualization */}
              <div className="pt-4">
                <div className="relative">
                  {/* Line behind steps */}
                  <div className="absolute left-0 right-0 top-5 h-0.5 bg-border"></div>
                  {/* Steps */}
                  <div className="flex justify-between relative">
                    <PipelineStepIndicator
                      label="Uploaden"
                      icon={<UploadCloud className="h-5 w-5" />}
                      completed={getStageIndex() > 0}
                      active={status.stage === 'uploading'}
                    />
                    <PipelineStepIndicator
                      label="Verwerken"
                      icon={<Settings2 className="h-5 w-5" />}
                      completed={getStageIndex() > 1}
                      active={status.stage === 'processing' || status.stage === 'chunking'}
                    />
                    <PipelineStepIndicator
                      label="Transcriberen"
                      icon={<FileText className="h-5 w-5" />}
                      completed={getStageIndex() > 3}
                      active={status.stage === 'transcribing'}
                    />
                    <PipelineStepIndicator
                      label="Samenvatten"
                      icon={<BrainCircuit className="h-5 w-5" />}
                      completed={getStageIndex() > 4}
                      active={status.stage === 'summarizing'}
                    />
                    <PipelineStepIndicator
                      label="Voltooid"
                      icon={<CheckCircle className="h-5 w-5" />}
                      completed={status.stage === 'completed'}
                      active={false} // Completed is never 'active' in this sense
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AnimatePresence>
  );
}

// Sub-component for pipeline step indicators
function PipelineStepIndicator({
  label,
  icon, // Added icon to destructuring
  completed,
  active
}: {
  label: string;
  icon: React.ReactNode; // Accept icon as prop
  completed: boolean;
  active: boolean;
}) {
  // Enhanced state classes for better visual feedback in dark theme
  const stateClasses = completed
    ? 'bg-green-600 border-green-500 text-white' // Completed: Green background
    : active
    ? 'bg-slate-700 border-blue-500 text-blue-300 ring-2 ring-blue-500/50 ring-offset-2 ring-offset-slate-800' // Active: Blue border/ring, slightly different bg
    : 'bg-slate-800 border-slate-600 text-slate-500'; // Default: Darker bg, muted text/border

  return (
    <div className="flex flex-col items-center z-10 text-center w-16"> {/* Added width */}
      {/* Use motion.div for animation */}
      <motion.div
        animate={active ? { scale: [1, 1.1, 1] } : {}} // Simplified animation
        transition={{ duration: active ? 1.5 : 0, repeat: active ? Infinity : 0 }} // Only repeat animation when active
      >
        <div className={`w-10 h-10 rounded-full flex items-center justify-center z-10 border-2 transition-colors duration-300 ${stateClasses}`}>
          {completed ? <Check className="h-5 w-5" /> : icon} {/* Correct icon reference */}
        </div>
      </motion.div>
      {/* Adjust text color based on state */}
      <span className={`mt-2 text-xs font-medium transition-colors duration-300 ${
        completed ? 'text-green-400' : active ? 'text-blue-400' : 'text-slate-500'
      }`}>
        {label}
      </span>
    </div>
  );
}
