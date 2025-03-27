// @ts-nocheck
'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, MotionProps } from 'framer-motion';
import React, { HTMLAttributes, forwardRef } from 'react';
import FileUploader, { BlobFile as BlobFileInfo } from '@/app/components/FileUploader'; // Import BlobFile if exported
import CustomAudioRecorder from '@/app/components/CustomAudioRecorder';
import SummaryDisplay from '@/app/components/SummaryDisplay';
import SummaryActions from '@/app/components/SummaryActions';
import EmailModal from '@/app/components/EmailModal';
import Notification, { NotificationType } from '@/app/components/Notification';
import ProcessingPipeline, { PipelineStatus, PipelineStage } from './components/ProcessingPipeline'; // Import types
import PromptSelector from '@/app/components/PromptSelector';
import { chatModels, whisperModels, defaultConfig } from '@/lib/config';
import { calculateEstimatedTime, estimateChunks, calculateProgressFromTime, getInitialStageMessage } from '../lib/pipelineHelpers';
import { type PutBlobResult } from '@vercel/blob'; // Use Vercel Blob's result type
import FinalScreen from '@/app/components/FinalScreen';
import { marked } from 'marked'; // Import marked for client-side conversion

// Create properly typed motion components (same as before)
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


// Define the prompt type interface
interface PromptType {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

export default function Home() {
  // State for audio blob info from Vercel Blob
  const [uploadedBlobInfo, setUploadedBlobInfo] = useState<PutBlobResult | null>(null);
  const [audioFileName, setAudioFileName] = useState<string>('');

  // State for transcription and samenvatting
  const [transcription, setTranscription] = useState<string>('');
  const [summary, setSummary] = useState<string>(''); // Keep raw Markdown state
  const [summaryHtml, setSummaryHtml] = useState<string>(''); // Add HTML state

  // State for gekozen prompt
  const [selectedPrompt, setSelectedPrompt] = useState<PromptType>({
    id: 'default',
    name: 'Algemene Samenvatting',
    description: 'Standaard samenvatting van het gesprek of de vergadering',
    prompt: ''
  });

  // Loading states (simplified, pipeline state manages details)
  const [isProcessing, setIsProcessing] = useState<boolean>(false); // General processing flag

  // Cost tracking
  const [transcriptionCost, setTranscriptionCost] = useState<number>(0);
  const [summaryCost, setSummaryCost] = useState<number>(0);
  const [transcriptionInfo, setTranscriptionInfo] = useState<{
    chunked: boolean;
    chunks: number;
  }>({
    chunked: false, // Assume single file unless backend says otherwise
    chunks: 1
  });

  // Pipeline state
  const [pipelineActive, setPipelineActive] = useState<boolean>(false);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>({ // Use imported type
    stage: 'uploading', // Default initial stage
    progress: 0,
    message: 'Wachten op bestand...'
  });

  // Pipeline time tracking
  const [pipelineStartTime, setPipelineStartTime] = useState<number | null>(null);
  const [stageStartTime, setStageStartTime] = useState<number | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null); // Ref for interval

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

  // Clear existing progress interval
  const clearProgressInterval = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  // Update pipeline state safely
  const updatePipeline = (update: Partial<PipelineStatus>) => {
    setPipelineStatus(prev => ({ ...prev, ...update }));
    if (update.stage && update.stage !== pipelineStatus.stage) {
      setStageStartTime(Date.now()); // Reset stage timer on stage change
      clearProgressInterval(); // Clear old interval on stage change
    }
     // Stop interval if completed or error
     if (update.stage === 'completed' || update.stage === 'error') {
         clearProgressInterval();
     }
  };

  // Start the automated pipeline after Blob upload is complete
  const startPipelineProcessing = (blobInfo: PutBlobResult) => {
    console.log('Pipeline starting with Blob info:', blobInfo);
    // Reset previous results
    setTranscription('');
    setSummary(''); // Reset raw summary
    setSummaryHtml(''); // Reset summaryHtml
    setTranscriptionCost(0);
    setSummaryCost(0);
    setUploadedBlobInfo(blobInfo); // Store the blob info
    setAudioFileName(blobInfo.pathname.split('/').pop() || 'audio_file'); // Use pathname for filename display

    // Activate pipeline UI
    setIsProcessing(true); // Use general flag
    setPipelineActive(true);
    const now = Date.now();
    setPipelineStartTime(now);
    setStageStartTime(now); // Start timer for the next stage (transcription)

    // Set pipeline status to 'Transcribing'
    updatePipeline({
      stage: 'transcribing',
      progress: 0,
      message: getInitialStageMessage('transcribing'),
      estimatedTimeLeft: calculateEstimatedTime(15 * 1024 * 1024, 'transcribing', settings.transcriptionModel), // Use a placeholder size or get from blob if available
      details: {
        fileName: blobInfo.pathname.split('/').pop() || 'audio_file',
      }
    });

    // Update UI step
    setCurrentStep(2);

    // Scroll to transcribe section
    setTimeout(() => {
      document.getElementById('transcribe-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 300);

    // Start transcription process
    transcribeAudioWithProgress(blobInfo);
  };


  // Function called by FileUploader when upload to Blob is done
  const handleFileUploadComplete = (blobInfo: PutBlobResult) => {
     console.log('File upload complete, received blob info:', blobInfo);
     if (!blobInfo || !blobInfo.url || !blobInfo.downloadUrl) {
         console.error("Invalid blobInfo received from upload", blobInfo);
         updatePipeline({
             stage: 'error',
             error: 'Upload voltooid, maar ongeldige bestandsinformatie ontvangen.',
             message: 'Upload voltooid, maar ongeldige bestandsinformatie ontvangen.'
         });
         showNotification('error', 'Upload voltooid, maar ongeldige bestandsinformatie ontvangen.');
         setIsProcessing(false);
         return;
     }
     // Start the main processing pipeline now
     startPipelineProcessing(blobInfo);
  };


  // Transcribe audio using the Blob download URL
  const transcribeAudioWithProgress = async (blobInfo: PutBlobResult) => {
    console.log(`Starting transcription for: ${blobInfo.downloadUrl}`);

    // Ensure we have a start time for this stage
    if (!stageStartTime) setStageStartTime(Date.now());

    try {
      // Start progress simulation interval
      clearProgressInterval(); // Clear any previous interval
      progressIntervalRef.current = setInterval(() => {
        if (stageStartTime) {
          const elapsedSeconds = Math.floor((Date.now() - stageStartTime) / 1000);
          const estimatedSize = 15 * 1024 * 1024;
          const estimatedTotal = calculateEstimatedTime(estimatedSize, 'transcribing', settings.transcriptionModel);
          const progress = calculateProgressFromTime(elapsedSeconds, estimatedTotal);
          const timeLeft = Math.max(1, estimatedTotal - elapsedSeconds);
          updatePipeline({ progress, estimatedTimeLeft: timeLeft, message: `Transcriptie bezig... (${progress}%)` });
        }
      }, 1000);

      // Call the MODIFIED backend API with the download URL
      const response = await fetch('/api/direct-transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioUrl: blobInfo.downloadUrl,
          model: settings.transcriptionModel,
          language: 'nl',
        })
      });

      clearProgressInterval(); // Stop interval on response

      if (!response.ok) {
        let errorMessage = 'Transcriptie mislukt';
        try { const errorData = await response.json(); errorMessage = errorData.error || `Serverfout ${response.status}`; }
        catch (e) { errorMessage = `Serverfout ${response.status}`; }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      console.log('Transcription successful.');
      setTranscription(data.transcription);

      // Proceed to summarization
      proceedToSummarization(data.transcription);

    } catch (error) {
      console.error('❌ Transcriptie fout:', error);
      clearProgressInterval();
      updatePipeline({
        stage: 'error',
        message: 'Fout tijdens transcriptie',
        error: error instanceof Error ? error.message : 'Onbekende fout'
      });
      showNotification('error', `Fout tijdens transcriptie: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
      setIsProcessing(false);
    }
  };

  // Move to summarization stage
  const proceedToSummarization = (transcriptText: string) => {
    const now = Date.now();
    setStageStartTime(now);
    setCurrentStep(3);
    setTimeout(() => { document.getElementById('summary-section')?.scrollIntoView({ behavior: 'smooth' }); }, 300);
    updatePipeline({
      stage: 'summarizing',
      progress: 0,
      message: getInitialStageMessage('summarizing'),
      estimatedTimeLeft: calculateEstimatedTime(transcriptText.length * 2, 'summarizing'),
       details: { fileName: audioFileName }
    });
    summarizeWithProgress(transcriptText);
  };

  // Summarize with progress tracking
  const summarizeWithProgress = async (text: string) => {
    if (!text || text.trim() === '') {
      updatePipeline({ stage: 'error', message: 'Transcriptie is leeg', error: 'Transcriptie is leeg of ontbreekt' });
      showNotification('error', 'Transcriptie is leeg of ontbreekt');
       setIsProcessing(false);
      return;
    }

    if (!stageStartTime) setStageStartTime(Date.now());

    try {
      clearProgressInterval();
      progressIntervalRef.current = setInterval(() => {
        if (stageStartTime) {
          const elapsedSeconds = Math.floor((Date.now() - stageStartTime) / 1000);
          const estimatedTotal = calculateEstimatedTime(text.length * 2, 'summarizing');
          const progress = calculateProgressFromTime(elapsedSeconds, estimatedTotal);
          const timeLeft = Math.max(1, estimatedTotal - elapsedSeconds);
          updatePipeline({ progress, estimatedTimeLeft: timeLeft, message: `Samenvatting genereren... (${progress}%)` });
        }
      }, 1000);

      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          model: settings.summarizationModel,
          temperature: settings.temperature,
          prompt: selectedPrompt.prompt
        })
      });

      clearProgressInterval();

      if (!response.ok) {
        let errorMessage = 'Samenvatting mislukt';
        try { const errorData = await response.json(); errorMessage = errorData.error || `Serverfout ${response.status}`; }
        catch (e) { errorMessage = `Serverfout ${response.status}`; }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      console.log('Summarization successful.');
      setSummary(data.summary || ''); // Store raw Markdown
      setSummaryHtml(data.summaryHtml || ''); // Store HTML
      // setSummaryCost(data.usage?.cost || 0);

      updatePipeline({ stage: 'completed', progress: 100, message: 'Verwerking voltooid!', estimatedTimeLeft: 0 });

      setTimeout(() => {
        setPipelineActive(false);
        setIsProcessing(false);
      }, 2000);

    } catch (error) {
      console.error('❌ Samenvatting fout:', error);
      clearProgressInterval();
      updatePipeline({ stage: 'error', message: 'Fout tijdens samenvatting', error: error instanceof Error ? error.message : 'Onbekende fout' });
      showNotification('error', `Fout tijdens samenvatting: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
       setIsProcessing(false);
    }
  };

 // Handle audio capture
 const handleAudioCapture = async (file: File) => {
    console.log("Handling captured audio:", file.name, file.size);
    setIsProcessing(true);
    setPipelineActive(true);
    const now = Date.now();
    setPipelineStartTime(now);
    setStageStartTime(now);
    updatePipeline({
        stage: 'uploading', progress: 0,
        message: `Audio opname "${file.name}" uploaden...`,
        estimatedTimeLeft: calculateEstimatedTime(file.size, 'uploading'),
        details: { fileName: file.name, fileSize: file.size }
    });

    try {
        clearProgressInterval();
        let uploadProgress = 0;
        progressIntervalRef.current = setInterval(() => {
            if (uploadProgress < 95) {
                uploadProgress += Math.random() * 10;
                updatePipeline({
                    progress: Math.min(95, Math.round(uploadProgress)),
                    estimatedTimeLeft: Math.max(1, calculateEstimatedTime(file.size, 'uploading') * (1 - uploadProgress / 100))
                });
            } else { clearProgressInterval(); }
        }, 200);

        const presignedResponse = await fetch('/api/upload-blob', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ filename: file.name }),
        });
        if (!presignedResponse.ok) { const errorData = await presignedResponse.json(); throw new Error(`Kon upload URL niet krijgen: ${errorData.error || presignedResponse.statusText}`); }
        const blobInfo = (await presignedResponse.json()) as PutBlobResult;

        const uploadResponse = await fetch(blobInfo.url, {
            method: 'PUT', headers: { 'Content-Type': file.type || 'audio/webm' }, body: file,
        });
        clearProgressInterval();
        if (!uploadResponse.ok) { throw new Error(`Upload naar Blob mislukt: ${uploadResponse.statusText}`); }

        updatePipeline({ progress: 100, message: 'Upload voltooid!' });
        console.log('✅ Audio capture uploaded successfully:', blobInfo);

        // setAudioBlob(blobInfo); // State doesn't exist
        setAudioFileName(file.name);
        setCurrentStep(2);
        setTimeout(() => { startPipelineProcessing(blobInfo); }, 500);

    } catch (error) {
        clearProgressInterval();
        console.error("❌ Fout bij uploaden van opname:", error);
        showNotification('error', error instanceof Error ? error.message : 'Upload van opname mislukt');
        updatePipeline({ stage: 'error', message: 'Fout bij uploaden van opname', error: error instanceof Error ? error.message : 'Upload van opname mislukt' });
        setIsProcessing(false);
        setPipelineActive(false);
    }
};


  // Handle pipeline cancellation
  const handleCancelPipeline = () => {
    clearProgressInterval();
    setPipelineActive(false);
    setIsProcessing(false);
    setPipelineStartTime(null);
    setStageStartTime(null);
    showNotification('info', 'Verwerking geannuleerd');
  };

  // Handle manual summarization
  const handleSummarize = async () => {
    if (!transcription || transcription.trim() === '') { showNotification('error', 'Transcriptie is leeg of ontbreekt'); return; }
    setIsProcessing(true);
    proceedToSummarization(transcription);
  };

  // Regenerate summary
  const handleRegenerateSummary = () => {
      if (!transcription || transcription.trim() === '') { showNotification('error', 'Transcriptie is leeg of ontbreekt om opnieuw te genereren.'); return; }
      setIsProcessing(true);
      proceedToSummarization(transcription);
  };

  // Regenerate transcript
  const handleRegenerateTranscript = async () => {
      if (!uploadedBlobInfo) { showNotification('error', 'Originele audio-informatie niet beschikbaar om opnieuw te transcriberen.'); return; }
      setIsProcessing(true);
      const now = Date.now();
      setPipelineStartTime(now);
      setStageStartTime(now);
      setSummary(''); // Clear raw summary
      setSummaryHtml(''); // Clear HTML summary
      setSummaryCost(0);
      updatePipeline({
          stage: 'transcribing', progress: 0, message: getInitialStageMessage('transcribing'),
          estimatedTimeLeft: calculateEstimatedTime(15 * 1024 * 1024, 'transcribing', settings.transcriptionModel),
          details: { fileName: audioFileName }, error: undefined,
      });
      setPipelineActive(true);
      setCurrentStep(2);
      transcribeAudioWithProgress(uploadedBlobInfo);
  };


  // Reset all data
  const handleReset = () => {
    setUploadedBlobInfo(null);
    setAudioFileName('');
    setTranscription('');
    setSummary(''); // Reset raw summary
    setSummaryHtml(''); // Reset HTML summary
    setTranscriptionCost(0);
    setSummaryCost(0);
    setCurrentStep(1);
    setPipelineActive(false);
    setIsProcessing(false);
    setPipelineStartTime(null);
    setStageStartTime(null);
    clearProgressInterval();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Settings toggle
  const toggleSettings = () => setIsSettingsOpen(!isSettingsOpen);
  // Update settings
  const updateSettings = (newSettings: Partial<typeof settings>) => setSettings(prev => ({ ...prev, ...newSettings }));
  // Handle email modal
  const handleOpenEmailModal = () => setIsEmailModalOpen(true);
  const handleCloseEmailModal = () => setIsEmailModalOpen(false);

  // Handle refined summary - Convert Markdown to HTML client-side
  const handleRefinedSummary = async (refinedMarkdownSummary: string) => {
      setSummary(refinedMarkdownSummary); // Update raw summary state
      showNotification('info', 'Samenvatting bijgewerkt, HTML versie genereren...');
      try {
        // Configure marked (ensure GFM and breaks are enabled)
        marked.setOptions({
          gfm: true,
          breaks: true,
        });
        // Convert refined Markdown to HTML
        const convertedHtml = await marked.parse(refinedMarkdownSummary || '');
        setSummaryHtml(convertedHtml); // Update HTML state
        showNotification('success', 'Samenvatting succesvol bijgewerkt');
      } catch (error) {
          console.error("Error converting refined summary to HTML:", error);
          setSummaryHtml("<p><i>Fout bij converteren van bijgewerkte samenvatting naar HTML.</i></p>"); // Show error in display
          showNotification('error', 'Kon bijgewerkte samenvatting niet naar HTML converteren.');
      }
  };

  // Handle email notifications
  const handleEmailNotification = (success: boolean, message: string) => showNotification(success ? 'success' : 'error', message);
  // Show notification
  const showNotification = (type: NotificationType, message: string) => setNotification({ type, message, isVisible: true });
  // Close notification
  const closeNotification = () => setNotification(prev => ({ ...prev, isVisible: false }));


  // Card variants for animations (no changes needed)
  const cardVariants = { /* ... */ };

  // --- RENDER LOGIC ---
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
        summary={summary} // Pass raw Markdown
        summaryHtml={summaryHtml} // Pass HTML as well
        transcription={transcription}
        onSendEmail={handleEmailNotification}
      />

      {/* Processing Pipeline UI */}
      <ProcessingPipeline
        isActive={pipelineActive}
        status={pipelineStatus}
        onCancel={handleCancelPipeline}
      />

      {/* Conditional Rendering based on summaryHtml */}
      {summaryHtml ? ( // Check summaryHtml state
        // Final Screen when summary is ready
         <FinalScreen
           summary={summary} // Pass raw Markdown for actions
           summaryHtml={summaryHtml} // Pass HTML for display
           transcription={transcription}
           audioFileName={audioFileName}
           isSummarizing={pipelineStatus.stage === 'summarizing'}
           isTranscribing={pipelineStatus.stage === 'transcribing'}
           transcriptionInfo={transcriptionInfo}
           onRefinedSummary={handleRefinedSummary}
           onOpenEmailModal={handleOpenEmailModal}
           onReset={handleReset}
           onToggleSettings={toggleSettings}
           onRegenerateSummary={handleRegenerateSummary}
           onRegenerateTranscript={handleRegenerateTranscript}
         />
      ) : (
        // Main flow when no summary yet
        <>
          {/* Header */}
          <div className="relative overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 backdrop-blur-xl z-0" />
             <MotionDiv /* Header content */ >
               {/* ... Header H1 and P ... */}
             </MotionDiv>
           </div>

          {/* Step indicator */}
          <div className="mb-12">
             {/* ... Step indicator JSX ... */}
           </div>

           {/* Main content area */}
           <div className="max-w-6xl mx-auto px-4 pt-8">
             {/* Settings button */}
             <div className="flex justify-end mb-4">
                <button onClick={toggleSettings} /* Settings Button JSX */ >...</button>
             </div>

            {/* Settings panel */}
            <AnimatePresence>
                {isSettingsOpen && (
                  <MotionDiv /* Settings Panel JSX */ >
                    {/* ... Settings content ... */}
                  </MotionDiv>
                )}
            </AnimatePresence>

            {/* Step 1: Audio Input Section */}
            <AnimatePresence mode="wait">
              {currentStep === 1 && (
                <MotionDiv key="step1" variants={cardVariants} initial="hidden" animate="visible" exit="exit" className="mb-12">
                    {/* Prompt Selector */}
                     <div className="mb-8">
                       {/* ... Prompt Selector JSX ... */}
                       <PromptSelector
                         onSelectPrompt={(prompt) => setSelectedPrompt(prompt)}
                         selectedPromptId={selectedPrompt.id}
                       />
                     </div>

                    {/* Audio Input Options */}
                    <div className="grid md:grid-cols-2 gap-6">
                       <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-300">
                           {/* Audio Recorder Section */}
                           <CustomAudioRecorder onAudioRecorded={handleAudioCapture} />
                       </div>
                       <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-300">
                           {/* File Uploader Section */}
                           <FileUploader onFileUploadComplete={handleFileUploadComplete} /> {/* Use updated prop */}
                       </div>
                    </div>
                    {/* Tip section */}
                    <div className="mt-8 flex justify-center">...</div>
                </MotionDiv>
              )}
            </AnimatePresence>

             {/* Step 2 Placeholder (Content managed by pipeline UI) */}
             <div id="transcribe-section" className="scroll-mt-24">
               <AnimatePresence>
                 {currentStep >= 2 && !summaryHtml && ( // Check summaryHtml state
                   <MotionDiv key="step2-placeholder" variants={cardVariants} initial="hidden" animate="visible" exit="exit" className="mb-12">
                     {/* Optionally show transcription display if needed, but pipeline shows progress */}
                     {/* <TranscriptionDisplay text={transcription} isLoading={isProcessing && pipelineStatus.stage === 'transcribing'} /> */}
                   </MotionDiv>
                 )}
               </AnimatePresence>
             </div>

             {/* Step 3 Placeholder (Content managed by pipeline UI or FinalScreen) */}
              <div id="summary-section" className="scroll-mt-24">
                <AnimatePresence>
                   {currentStep >= 3 && !summaryHtml && ( // Check summaryHtml state
                     <MotionDiv key="step3-placeholder" variants={cardVariants} initial="hidden" animate="visible" exit="exit">
                       {/* Optionally show loading state for summary */}
                     </MotionDiv>
                   )}
                 </AnimatePresence>
              </div>

              {/* Reset button */}
             {(currentStep > 1 || uploadedBlobInfo) && !summaryHtml && !pipelineActive && ( // Check summaryHtml state
               <div className="flex justify-center mt-10">
                 <button onClick={handleReset} /* Reset Button JSX */ >...</button>
               </div>
             )}
           </div>
        </>
      )}
    </main>
  );
}
