'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, MotionProps } from 'framer-motion';
import React, { HTMLAttributes, forwardRef } from 'react';
import FileUploader from '@/app/components/FileUploader';
import CustomAudioRecorder from '@/app/components/CustomAudioRecorder';
import TranscriptionDisplay from '@/app/components/TranscriptionDisplay';
import TranscriptionProgress from '@/app/components/TranscriptionProgress';
import SummaryDisplay from '@/app/components/SummaryDisplay';
import SummaryActions from '@/app/components/SummaryActions';
import EmailModal from '@/app/components/EmailModal';
import Notification, { NotificationType } from '@/app/components/Notification';
import ProcessingPipeline from './components/ProcessingPipeline';
import { chatModels, whisperModels, defaultConfig } from '@/lib/config';
import { calculateEstimatedTime, estimateChunks, calculateProgressFromTime, getInitialStageMessage } from '../lib/pipelineHelpers';
import { BlobFile } from '@vercel/blob';
import FinalScreen from '@/app/components/FinalScreen';


// Create properly typed motion components
type MotionDivProps = HTMLAttributes<HTMLDivElement> & MotionProps;
const MotionDiv = forwardRef<HTMLDivElement, MotionDivProps>((props, ref) => (
  <motion.div ref={ref} {...props} />
));
MotionDiv.displayName = 'MotionDiv';

type MotionH1Props = HTMLAttributes<HTMLHeadingElement> & MotionProps;
const MotionH1 = forwardRef<HTMLHeadingElement, MotionH1Props>((props, ref) => (
  <motion.h1 ref={ref} {...props} />
));
MotionH1.displayName = 'MotionH1';

type MotionPProps = HTMLAttributes<HTMLParagraphElement> & MotionProps;
const MotionP = forwardRef<HTMLParagraphElement, MotionPProps>((props, ref) => (
  <motion.p ref={ref} {...props} />
));
MotionP.displayName = 'MotionP';

type MotionButtonProps = HTMLAttributes<HTMLButtonElement> & MotionProps & {
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
};
const MotionButton = forwardRef<HTMLButtonElement, MotionButtonProps>((props, ref) => (
  <motion.button ref={ref} {...props} />
));
MotionButton.displayName = 'MotionButton';

export default function Home() {
  // State voor audio bestand
  const [audioBlob, setAudioBlob] = useState<BlobFile | null>(null);
  const [audioFileName, setAudioFileName] = useState<string>('');
  
  // State voor transcriptie en samenvatting
  const [transcription, setTranscription] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  
  // Loading states
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [transcriptionPhase, setTranscriptionPhase] = useState<'uploading' | 'processing' | 'transcribing' | 'complete'>('uploading');
  
  // Cost tracking
  const [transcriptionCost, setTranscriptionCost] = useState<number>(0);
  const [summaryCost, setSummaryCost] = useState<number>(0);
  const [transcriptionInfo, setTranscriptionInfo] = useState<{
    chunked: boolean;
    chunks: number;
  }>({
    chunked: false,
    chunks: 1
  });
  
  // Pipeline state
  const [pipelineActive, setPipelineActive] = useState<boolean>(false);
  const [pipelineStatus, setPipelineStatus] = useState<{
    stage: 'uploading' | 'processing' | 'chunking' | 'transcribing' | 'summarizing' | 'completed' | 'error';
    progress: number;
    message: string;
    estimatedTimeLeft?: number;
    error?: string;
    details?: {
      currentChunk?: number;
      totalChunks?: number;
      fileName?: string;
      fileSize?: number;
    };
  }>({
    stage: 'uploading',
    progress: 0,
    message: 'Bestand wordt geüpload...'
  });
  
  // Pipeline time tracking
  const [pipelineStartTime, setPipelineStartTime] = useState<number | null>(null);
  const [stageStartTime, setStageStartTime] = useState<number | null>(null);
  
  // Settings
  const [settings, setSettings] = useState({
    transcriptionModel: defaultConfig.transcriptionModel,
    summarizationModel: defaultConfig.summarizationModel,
    temperature: defaultConfig.temperature,
    showCosts: defaultConfig.showCosts
  });
  
  // UI state
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState<boolean>(false);
  const [notification, setNotification] = useState<{
    type: NotificationType;
    message: string;
    isVisible: boolean;
  }>({
    type: 'info',
    message: '',
    isVisible: false
  });
  const mainContainerRef = useRef<HTMLDivElement>(null);

  // Start the automated pipeline
  const startPipeline = (blob: BlobFile) => {
    // Reset any previous processing
    setTranscription('');
    setSummary('');
    setTranscriptionCost(0);
    setSummaryCost(0);
    
    // Initialize pipeline
    const now = Date.now();
    setPipelineStartTime(now);
    setStageStartTime(now);
    
    // Estimated chunks based on file size
    const totalChunks = estimateChunks(blob.size);
    
    // Set initial pipeline status
    setPipelineStatus({
      stage: 'uploading',
      progress: 100, // Upload is already complete at this point
      message: getInitialStageMessage('uploading', { 
        fileName: blob.originalName,
        fileSize: blob.size
      }),
      details: {
        fileName: blob.originalName,
        fileSize: blob.size,
        totalChunks: totalChunks > 1 ? totalChunks : undefined
      }
    });
    
    // Activate pipeline UI
    setPipelineActive(true);
    
    // Move to processing stage since upload is already complete
    setTimeout(() => {
      proceedToTranscription(blob);
    }, 1000);
  };
  
  // Move to transcription stage
  const proceedToTranscription = (blob: BlobFile) => {
    // Update pipeline status
    const now = Date.now();
    setStageStartTime(now);
    
    // Update status to transcribing
    setPipelineStatus(prev => ({
      ...prev,
      stage: 'transcribing',
      progress: 0,
      message: getInitialStageMessage('transcribing'),
      estimatedTimeLeft: calculateEstimatedTime(blob.size, 'transcribing', settings.transcriptionModel)
    }));
    
    // Start actual transcription
    transcribeAudioWithProgress(blob);
  };
  
  // Transcribe audio with progress tracking
  const transcribeAudioWithProgress = async (blob: BlobFile) => {
    setIsTranscribing(true);
    
    try {
      // Start progress tracking
      let progressInterval = setInterval(() => {
        if (stageStartTime) {
          const elapsedSeconds = Math.floor((Date.now() - stageStartTime) / 1000);
          const estimatedTotal = calculateEstimatedTime(blob.size, 'transcribing', settings.transcriptionModel);
          const progress = calculateProgressFromTime(elapsedSeconds, estimatedTotal);
          const timeLeft = Math.max(1, estimatedTotal - elapsedSeconds);
          
          setPipelineStatus(prev => ({
            ...prev,
            progress,
            estimatedTimeLeft: timeLeft
          }));
        }
      }, 1000);
      
      // Call the API
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          blobUrl: blob.url,
          originalFileName: blob.originalName,
          fileType: blob.contentType,
          fileSize: blob.size,
          model: settings.transcriptionModel
        })
      });
      
      // Clear the progress interval
      clearInterval(progressInterval);
      
      // Process response
      if (!response.ok) {
        let errorMessage = 'Transcriptie mislukt';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          // Use default error message if JSON parsing fails
        }
        throw new Error(errorMessage);
      }
      
      // Parse the response
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      // Update state with transcription
      setTranscription(data.transcription);
      
      // Update cost info
      if (data.usage?.estimatedCost) {
        setTranscriptionCost(data.usage.estimatedCost);
      }
      
      // Update chunking information
      if (data.usage?.chunked !== undefined) {
        setTranscriptionInfo({
          chunked: data.usage.chunked,
          chunks: data.usage.chunks || 1
        });
      }
      
      // Auto-advance to summarization
      proceedToSummarization(data.transcription);
      
    } catch (error) {
      console.error('Transcriptie fout:', error);
      setPipelineStatus(prev => ({
        ...prev,
        stage: 'error',
        message: 'Fout tijdens transcriptie',
        error: error instanceof Error ? error.message : 'Onbekende fout'
      }));
      
      // Show notification to user
      showNotification('error', `Fout tijdens transcriptie: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
    } finally {
      setIsTranscribing(false);
    }
  };
  
  // Move to summarization stage
  const proceedToSummarization = (transcriptText: string) => {
    // Update pipeline status
    const now = Date.now();
    setStageStartTime(now);
    
    // Update UI step
    setCurrentStep(3);
    
    // Scroll to summary section
    setTimeout(() => {
      const summarySection = document.getElementById('summary-section');
      summarySection?.scrollIntoView({ behavior: 'smooth' });
    }, 300);
    
    // Update pipeline status
    setPipelineStatus(prev => ({
      ...prev,
      stage: 'summarizing',
      progress: 0,
      message: getInitialStageMessage('summarizing'),
      estimatedTimeLeft: calculateEstimatedTime(
        transcriptText.length * 2, // Rough byte size estimate from character count
        'summarizing'
      )
    }));
    
    // Start summarization
    summarizeWithProgress(transcriptText);
  };
  
  // Summarize with progress tracking
  const summarizeWithProgress = async (text: string) => {
    if (!text || text.trim() === '') {
      setPipelineStatus(prev => ({
        ...prev,
        stage: 'error',
        message: 'Transcriptie is leeg of ontbreekt',
        error: 'Transcriptie is leeg of ontbreekt'
      }));
      showNotification('error', 'Transcriptie is leeg of ontbreekt');
      return;
    }
    
    setIsSummarizing(true);
    
    try {
      // Start progress tracking
      let progressInterval = setInterval(() => {
        if (stageStartTime) {
          const elapsedSeconds = Math.floor((Date.now() - stageStartTime) / 1000);
          const estimatedTotal = calculateEstimatedTime(text.length * 2, 'summarizing');
          const progress = calculateProgressFromTime(elapsedSeconds, estimatedTotal);
          const timeLeft = Math.max(1, estimatedTotal - elapsedSeconds);
          
          setPipelineStatus(prev => ({
            ...prev,
            progress,
            estimatedTimeLeft: timeLeft
          }));
        }
      }, 1000);
      
      // Call the API
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text,
          model: settings.summarizationModel,
          temperature: settings.temperature
        })
      });
      
      // Clear the progress interval
      clearInterval(progressInterval);
      
      // Process response
      if (!response.ok) {
        let errorMessage = 'Samenvatting mislukt';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          // Use default error message if JSON parsing fails
        }
        throw new Error(errorMessage);
      }
      
      // Parse the response
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      // Update state with summary
      setSummary(data.summary);
      
      // Update cost info
      if (data.usage?.cost) {
        setSummaryCost(data.usage.cost);
      }
      
      // Complete the pipeline
      setPipelineStatus(prev => ({
        ...prev,
        stage: 'completed',
        progress: 100,
        message: 'Samenvatting succesvol gegenereerd!',
        estimatedTimeLeft: undefined
      }));
      
      // Auto-close pipeline after a short delay
      setTimeout(() => {
        setPipelineActive(false);
      }, 2000);
      
    } catch (error) {
      console.error('Samenvatting fout:', error);
      setPipelineStatus(prev => ({
        ...prev,
        stage: 'error',
        message: 'Fout tijdens samenvatting',
        error: error instanceof Error ? error.message : 'Onbekende fout'
      }));
      
      // Show notification to user
      showNotification('error', `Fout tijdens samenvatting: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
    } finally {
      setIsSummarizing(false);
    }
  };
  
  // Handle pipeline cancellation
  const handleCancelPipeline = () => {
    // Reset pipeline state
    setPipelineActive(false);
    setPipelineStartTime(null);
    setStageStartTime(null);
    
    // Reset processing states
    setIsTranscribing(false);
    setIsSummarizing(false);
    
    // Show notification
    showNotification('info', 'Verwerking geannuleerd');
  };

// Update these functions in page.tsx to ensure the pipeline starts immediately

// Update FileUploader's handleStartProcess function to activate pipeline immediately
const handleBlobUpload = (blob: BlobFile) => {
  setAudioBlob(blob);
  setAudioFileName(blob.originalName);
  
  // Activate pipeline FIRST, before any other operations
  setPipelineActive(true);
  setPipelineStartTime(Date.now());
  setStageStartTime(Date.now());
  
  // Set initial pipeline status immediately when the file is selected
  setPipelineStatus({
    stage: 'uploading',
    progress: 100, // Upload already complete at this point
    message: `Bestand "${blob.originalName}" wordt verwerkt...`,
    details: {
      fileName: blob.originalName,
      fileSize: blob.size,
      totalChunks: estimateChunks(blob.size) > 1 ? estimateChunks(blob.size) : undefined
    }
  });
  
  // Update UI step
  setCurrentStep(2);
  
  // Then start the pipeline processing with a very short delay
  setTimeout(() => {
    proceedToTranscription(blob);
  }, 100); // Reduced from 1000ms to 100ms for faster response
  
  // Scroll to transcribe section
  setTimeout(() => {
    const transcribeSection = document.getElementById('transcribe-section');
    transcribeSection?.scrollIntoView({ behavior: 'smooth' });
  }, 300);
};
  
  // Voor audio-opnames
  const handleAudioCapture = async (file: File) => {
    try {
      // Start pipeline immediately with uploading status
      setPipelineActive(true);
      setPipelineStartTime(Date.now());
      setStageStartTime(Date.now());
      
      setPipelineStatus({
        stage: 'uploading',
        progress: 0,
        message: `Audio opname "${file.name}" wordt geüpload...`,
        estimatedTimeLeft: calculateEstimatedTime(file.size, 'uploading'),
        details: {
          fileName: file.name,
          fileSize: file.size
        }
      });
      
      // Start progress tracking for upload
      let uploadProgress = 0;
      let progressInterval = setInterval(() => {
        if (uploadProgress < 95) {
          uploadProgress += Math.random() * 5;
          setPipelineStatus(prev => ({
            ...prev,
            progress: Math.min(95, Math.round(uploadProgress)),
            estimatedTimeLeft: Math.max(1, calculateEstimatedTime(file.size, 'uploading') * (1 - uploadProgress/100))
          }));
        }
      }, 300);
      
      // Opgenomen audio uploaden naar Vercel Blob
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/upload-blob', {
        method: 'POST',
        body: formData,
      });
      
      // Clear progress interval
      clearInterval(progressInterval);
      
      // First check if the response is OK before attempting to parse JSON
      if (!response.ok) {
        try {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Upload van opname mislukt');
        } catch (jsonError) {
          // If JSON parsing fails, use the status text or a generic message
          throw new Error(`Upload van opname mislukt: ${response.status} ${response.statusText || 'Onbekende fout'}`);
        }
      }
      
      // Now parse the response as JSON, with error handling
      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('JSON parsing error:', jsonError);
        throw new Error('Kon serverrespons niet verwerken. Probeer het opnieuw.');
      }
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      // Update the pipeline status to 100% for upload
      setPipelineStatus(prev => ({
        ...prev,
        progress: 100,
        message: 'Upload voltooid!'
      }));
      
      // Proceed to next steps
      setAudioBlob(data.blob);
      setAudioFileName(data.blob.originalName);
      
      // Update UI step
      setCurrentStep(2);
      
      // Proceed with the pipeline after a short delay
      setTimeout(() => {
        proceedToTranscription(data.blob);
      }, 1000);
      
    } catch (error) {
      console.error("Fout bij uploaden van opname:", error);
      showNotification('error', error instanceof Error ? error.message : 'Upload van opname mislukt');
      
      // Update pipeline status to error
      setPipelineStatus(prev => ({
        ...prev,
        stage: 'error',
        message: 'Fout bij uploaden van opname',
        error: error instanceof Error ? error.message : 'Upload van opname mislukt'
      }));
    }
  };

  // Separate function to transcribe audio (legacy method, kept for compatibility)
  const transcribeAudio = async (blob: BlobFile) => {
    // Use the new pipeline instead
    startPipeline(blob);
  };

  // Handle transcription with Blob URL from button click (legacy method, kept for compatibility)
  const handleTranscribe = async () => {
    if (!audioBlob) return;
    
    // Use the new pipeline instead
    startPipeline(audioBlob);
  };

  // Handle manual summarization (legacy method, kept for compatibility)
  const handleSummarize = async () => {
    if (!transcription || transcription.trim() === '') {
      showNotification('error', 'Transcriptie is leeg of ontbreekt');
      return;
    }
    
    // Use the automated pipeline for summarization
    const now = Date.now();
    setPipelineStartTime(now);
    setStageStartTime(now);
    
    setPipelineStatus({
      stage: 'summarizing',
      progress: 0,
      message: getInitialStageMessage('summarizing'),
      estimatedTimeLeft: calculateEstimatedTime(transcription.length * 2, 'summarizing'),
      details: {
        fileName: audioFileName
      }
    });
    
    setPipelineActive(true);
    
    // Start summarization process
    summarizeWithProgress(transcription);
  };

  // Reset all data
  const handleReset = () => {
    setAudioBlob(null);
    setAudioFileName('');
    setTranscription('');
    setSummary('');
    setTranscriptionCost(0);
    setSummaryCost(0);
    setCurrentStep(1);
    setPipelineActive(false);
    setPipelineStartTime(null);
    setStageStartTime(null);
    
    // Scroll back to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Settings toggle
  const toggleSettings = () => {
    setIsSettingsOpen(!isSettingsOpen);
  };

  // Update settings
  const updateSettings = (newSettings: Partial<typeof settings>) => {
    setSettings({
      ...settings,
      ...newSettings
    });
  };
  
  // Handle email modal
  const handleOpenEmailModal = () => {
    setIsEmailModalOpen(true);
  };
  
  const handleCloseEmailModal = () => {
    setIsEmailModalOpen(false);
  };
  
  // Handle refined summary
  const handleRefinedSummary = (refinedSummary: string) => {
    setSummary(refinedSummary);
    showNotification('success', 'Samenvatting succesvol bijgewerkt');
  };
  
  // Handle email notifications
  const handleEmailNotification = (success: boolean, message: string) => {
    showNotification(success ? 'success' : 'error', message);
  };
  
  // Show notification
  const showNotification = (type: NotificationType, message: string) => {
    setNotification({
      type,
      message,
      isVisible: true
    });
  };
  
  // Close notification
  const closeNotification = () => {
    setNotification(prev => ({
      ...prev,
      isVisible: false
    }));
  };

  const handleRegenerateSummary = () => {
    if (!transcription || transcription.trim() === '') {
      showNotification('error', 'Transcriptie is leeg of ontbreekt');
      return;
    }
    
    // Use the pipeline for summarization
    const now = Date.now();
    setPipelineStartTime(now);
    setStageStartTime(now);
    
    setPipelineStatus({
      stage: 'summarizing',
      progress: 0,
      message: getInitialStageMessage('summarizing'),
      estimatedTimeLeft: calculateEstimatedTime(transcription.length * 2, 'summarizing'),
      details: {
        fileName: audioFileName
      }
    });
    
    setPipelineActive(true);
    
    // Start summarization process
    summarizeWithProgress(transcription);
  };

  const handleRegenerateTranscript = async () => {
    if (!audioBlob) {
      showNotification('error', 'Audio bestand is niet beschikbaar');
      return;
    }
    
    // Start the pipeline for transcription
    const now = Date.now();
    setPipelineStartTime(now);
    setStageStartTime(now);
    
    setPipelineStatus({
      stage: 'transcribing',
      progress: 0,
      message: getInitialStageMessage('transcribing'),
      estimatedTimeLeft: calculateEstimatedTime(audioBlob.size, 'transcribing', settings.transcriptionModel),
      details: {
        fileName: audioFileName,
        fileSize: audioBlob.size
      }
    });
    
    setPipelineActive(true);
    
    // Start transcription process
    transcribeAudioWithProgress(audioBlob);
  };

  // Card variants for animations
  const cardVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
    exit: { opacity: 0, y: -50, transition: { duration: 0.3 } }
  };

  // In page.tsx, find the main return statement and update it to conditionally hide elements

return (
  <main ref={mainContainerRef} className="min-h-screen bg-neutral-50 pb-20">
    {/* Notification component */}
    <Notification
      type={notification.type}
      message={notification.message}
      isVisible={notification.isVisible}
      onClose={closeNotification}
    />

    {/* Email modal */}
    <EmailModal
      isOpen={isEmailModalOpen}
      onClose={handleCloseEmailModal}
      summary={summary}
      transcription={transcription}
      onSendEmail={handleEmailNotification}
    />
    
    {/* Processing Pipeline */}
    <ProcessingPipeline
      isActive={pipelineActive}
      status={pipelineStatus}
      onCancel={handleCancelPipeline}
    />
    
    {/* Only show header when not showing summary */}
    {!summary && (
      <>
        {/* Modern gradient header */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 backdrop-blur-xl z-0" />
          <MotionDiv
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
            className="w-full py-12 relative z-10"
          >
            <div className="max-w-6xl mx-auto px-4 text-center">
              <MotionH1
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.8 }}
                className="text-5xl font-bold mb-3 text-neutral-800 tracking-tight"
              >
                Super Kees Online
              </MotionH1>
              <MotionP
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.8 }}
                className="text-lg text-neutral-600 max-w-2xl mx-auto"
              >
                Transformeer uw audio-opnames naar uitgebreide vergadernotities en bruikbare samenvattingen met AI
              </MotionP>
            </div>
          </MotionDiv>
        </div>
        
        {/* Step indicator - Only show when not viewing summary */}
        <div className="mb-12">
          <div className="flex justify-between items-center max-w-lg mx-auto relative">
            <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-neutral-200 -translate-y-1/2 z-0" />
            
            {[1, 2, 3].map((step) => (
              <MotionDiv
                key={step}
                className={`w-10 h-10 rounded-full flex items-center justify-center z-10 ${
                  currentStep >= step
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                    : 'bg-white border border-neutral-200 text-neutral-400'
                }`}
                animate={{
                  scale: currentStep === step ? [1, 1.1, 1] : 1,
                  transition: { duration: 0.5, repeat: currentStep === step ? Infinity : 0, repeatDelay: 2 }
                }}
              >
                {currentStep > step ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                ) : (
                  step
                )}
              </MotionDiv>
            ))}
          </div>
          
          <div className="flex justify-between items-center max-w-lg mx-auto mt-2 text-sm">
            <div className={`w-20 text-center ${currentStep >= 1 ? 'text-neutral-800' : 'text-neutral-400'}`}>
              Audio Toevoegen
            </div>
            <div className={`w-20 text-center ${currentStep >= 2 ? 'text-neutral-800' : 'text-neutral-400'}`}>
              Transcriberen
            </div>
            <div className={`w-20 text-center ${currentStep >= 3 ? 'text-neutral-800' : 'text-neutral-400'}`}>
              Samenvatten
            </div>
          </div>
        </div>
      </>
    )}
    
    {/* Main content */}
    <div className="max-w-6xl mx-auto px-4 pt-8">
      {/* Settings button - Only show when not viewing summary */}
      {!summary && (
        <div className="flex justify-end mb-4">
          <button
            onClick={toggleSettings}
            className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Instellingen
          </button>
        </div>
      )}
        
      {/* Rest of the components, conditionally render based on presence of summary */}
      {summary ? (
        // When summary exists, only show the FinalScreen component
        <FinalScreen 
          summary={summary}
          transcription={transcription}
          audioFileName={audioFileName}
          isSummarizing={isSummarizing}
          isTranscribing={isTranscribing}
          transcriptionInfo={transcriptionInfo}
          onRefinedSummary={handleRefinedSummary}
          onOpenEmailModal={handleOpenEmailModal}
          onReset={handleReset}
          onToggleSettings={toggleSettings}
          onRegenerateSummary={handleRegenerateSummary}
          onRegenerateTranscript={handleRegenerateTranscript}
        />
      ) : (
        // When no summary exists, show the regular flow
        <>
          {/* Settings panel */}
          <AnimatePresence>
            {isSettingsOpen && (
              <MotionDiv
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-8 overflow-hidden"
              >
                {/* Settings content here */}
                {/* ... */}
              </MotionDiv>
            )}
          </AnimatePresence>
          
          {/* Step 1: Audio Input Section */}
          <AnimatePresence mode="wait">
            {currentStep === 1 && (
              <MotionDiv
                key="step1"
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="mb-12"
              >
                {/* Audio input components here */}
                {/* ... */}
              </MotionDiv>
            )}
          </AnimatePresence>
          
          {/* Step 2: Transcription Section */}
          <div id="transcribe-section" className="scroll-mt-24">
            <AnimatePresence>
              {currentStep >= 2 && (
                <MotionDiv
                  key="step2"
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="mb-12"
                >
                  {/* Transcription components here */}
                  {/* ... */}
                </MotionDiv>
              )}
            </AnimatePresence>
          </div>
          
          {/* Step 3: Summarization Section */}
          <div id="summary-section" className="scroll-mt-24">
            <AnimatePresence>
              {currentStep >= 3 && transcription && !summary && (
                <MotionDiv
                  key="step3"
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  {/* Summarization components here */}
                  {/* ... */}
                </MotionDiv>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
      
      {/* Reset button - Only show when not viewing summary */}
      {currentStep > 1 && !summary && (
        <div className="flex justify-center mt-10">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 border border-neutral-300 rounded-lg text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 2v6h6M2.66 15.57a10 10 0 1 0 .57-8.38" />
            </svg>
            Opnieuw Beginnen
          </button>
        </div>
      )}
    </div>
  </main>
);}