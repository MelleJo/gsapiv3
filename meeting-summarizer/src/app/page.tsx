// @ts-nocheck
'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, MotionProps } from 'framer-motion';
import React, { HTMLAttributes, forwardRef } from 'react';
import { Button } from "@/components/ui/button"; // Import Shadcn Button
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"; // Import Shadcn Card components
import FileUploader, { BlobFile as BlobFileInfo } from '@/app/components/FileUploader';
import CustomAudioRecorder from '@/app/components/CustomAudioRecorder';
import SummaryDisplay from '@/app/components/SummaryDisplay';
import SummaryActions from '@/app/components/SummaryActions';
import EmailModal from '@/app/components/EmailModal';
// Removed Notification import
import { toast } from "sonner"; // Import sonner toast
import ProcessingPipeline, { PipelineStatus, PipelineStage } from './components/ProcessingPipeline';
import PromptSelector from '@/app/components/PromptSelector';
import { chatModels, whisperModels, defaultConfig } from '@/lib/config';
import { calculateEstimatedTime, estimateChunks, calculateProgressFromTime, getInitialStageMessage } from '../lib/pipelineHelpers';
import { type PutBlobResult } from '@vercel/blob';
import FinalScreen from '@/app/components/FinalScreen';
// Removed marked import

// Motion components...
type MotionDivProps = HTMLAttributes<HTMLDivElement> & MotionProps;
const MotionDiv = forwardRef<HTMLDivElement, MotionDivProps>((props, ref) => ( <motion.div ref={ref} {...props} /> ));
MotionDiv.displayName = 'MotionDiv';
type MotionH1Props = HTMLAttributes<HTMLHeadingElement> & MotionProps;
const MotionH1 = forwardRef<HTMLHeadingElement, MotionH1Props>((props, ref) => ( <motion.h1 ref={ref} {...props} /> ));
MotionH1.displayName = 'MotionH1';
type MotionPProps = HTMLAttributes<HTMLParagraphElement> & MotionProps;
const MotionP = forwardRef<HTMLParagraphElement, MotionPProps>((props, ref) => ( <motion.p ref={ref} {...props} /> ));
MotionP.displayName = 'MotionP';
// Removed MotionButton definition

interface PromptType { id: string; name: string; description: string; prompt: string; }

export default function Home() {
  const [uploadedBlobInfo, setUploadedBlobInfo] = useState<PutBlobResult | null>(null);
  const [audioFileName, setAudioFileName] = useState<string>('');
  const [transcription, setTranscription] = useState<string>('');
  const [summary, setSummary] = useState<string>(''); // Only raw Markdown state needed now
  // Removed summaryHtml state
  const [selectedPrompt, setSelectedPrompt] = useState<PromptType>({ id: 'default', name: 'Algemene Samenvatting', description: 'Standaard samenvatting...', prompt: '' });
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [transcriptionCost, setTranscriptionCost] = useState<number>(0);
  const [summaryCost, setSummaryCost] = useState<number>(0);
  const [transcriptionInfo, setTranscriptionInfo] = useState<{ chunked: boolean; chunks: number; }>({ chunked: false, chunks: 1 });
  const [pipelineActive, setPipelineActive] = useState<boolean>(false);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>({ stage: 'uploading', progress: 0, message: 'Wachten op bestand...' });
  const [pipelineStartTime, setPipelineStartTime] = useState<number | null>(null);
  const [stageStartTime, setStageStartTime] = useState<number | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [settings, setSettings] = useState({ transcriptionModel: defaultConfig.transcriptionModel, summarizationModel: defaultConfig.summarizationModel, temperature: defaultConfig.temperature, showCosts: defaultConfig.showCosts });
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState<boolean>(false);
  // Removed notification state
  const mainContainerRef = useRef<HTMLDivElement>(null);

  const clearProgressInterval = () => { if (progressIntervalRef.current) { clearInterval(progressIntervalRef.current); progressIntervalRef.current = null; } };
  const updatePipeline = (update: Partial<PipelineStatus>) => { setPipelineStatus(prev => ({ ...prev, ...update })); if (update.stage && update.stage !== pipelineStatus.stage) { setStageStartTime(Date.now()); clearProgressInterval(); } if (update.stage === 'completed' || update.stage === 'error') { clearProgressInterval(); } };

  const startPipelineProcessing = (blobInfo: PutBlobResult) => {
    console.log('Pipeline starting with Blob info:', blobInfo);
    setTranscription(''); setSummary(''); setTranscriptionCost(0); setSummaryCost(0); // Reset summary
    setUploadedBlobInfo(blobInfo); setAudioFileName(blobInfo.pathname.split('/').pop() || 'audio_file');
    setIsProcessing(true); setPipelineActive(true); const now = Date.now(); setPipelineStartTime(now); setStageStartTime(now);
    updatePipeline({ stage: 'transcribing', progress: 0, message: getInitialStageMessage('transcribing'), estimatedTimeLeft: calculateEstimatedTime(15 * 1024 * 1024, 'transcribing', settings.transcriptionModel), details: { fileName: blobInfo.pathname.split('/').pop() || 'audio_file', } });
    setCurrentStep(2); setTimeout(() => { document.getElementById('transcribe-section')?.scrollIntoView({ behavior: 'smooth' }); }, 300);
    transcribeAudioWithProgress(blobInfo);
  };

  const handleFileUploadComplete = (blobInfo: PutBlobResult) => {
     console.log('File upload complete, received blob info:', blobInfo);
     if (!blobInfo || !blobInfo.url || !blobInfo.downloadUrl) { console.error("Invalid blobInfo received from upload", blobInfo); updatePipeline({ stage: 'error', error: '...', message: '...' }); showNotification('error', '...'); setIsProcessing(false); return; }
     startPipelineProcessing(blobInfo);
  };

  const transcribeAudioWithProgress = async (blobInfo: PutBlobResult) => {
    console.log(`Starting transcription for: ${blobInfo.downloadUrl}`);
    if (!stageStartTime) setStageStartTime(Date.now());
    try {
      clearProgressInterval();
      progressIntervalRef.current = setInterval(() => { if (stageStartTime) { const elapsedSeconds = Math.floor((Date.now() - stageStartTime) / 1000); const estimatedSize = 15 * 1024 * 1024; const estimatedTotal = calculateEstimatedTime(estimatedSize, 'transcribing', settings.transcriptionModel); const progress = calculateProgressFromTime(elapsedSeconds, estimatedTotal); const timeLeft = Math.max(1, estimatedTotal - elapsedSeconds); updatePipeline({ progress, estimatedTimeLeft: timeLeft, message: `Transcriptie bezig... (${progress}%)` }); } }, 1000);
      const response = await fetch('/api/direct-transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audioUrl: blobInfo.downloadUrl, model: settings.transcriptionModel, language: 'nl', }) });
      clearProgressInterval();
      if (!response.ok) { let errorMessage = 'Transcriptie mislukt'; try { const errorData = await response.json(); errorMessage = errorData.error || `Serverfout ${response.status}`; } catch (e) { errorMessage = `Serverfout ${response.status}`; } throw new Error(errorMessage); }
      const data = await response.json(); if (data.error) throw new Error(data.error);
      console.log('Transcription successful.'); setTranscription(data.transcription);
      proceedToSummarization(data.transcription);
    } catch (error) { console.error('❌ Transcriptie fout:', error); clearProgressInterval(); updatePipeline({ stage: 'error', message: 'Fout tijdens transcriptie', error: error instanceof Error ? error.message : 'Onbekende fout' }); showNotification('error', `Fout tijdens transcriptie: ${error instanceof Error ? error.message : 'Onbekende fout'}`); setIsProcessing(false); }
  };

  const proceedToSummarization = (transcriptText: string) => {
    const now = Date.now(); setStageStartTime(now); setCurrentStep(3); setTimeout(() => { document.getElementById('summary-section')?.scrollIntoView({ behavior: 'smooth' }); }, 300);
    updatePipeline({ stage: 'summarizing', progress: 0, message: getInitialStageMessage('summarizing'), estimatedTimeLeft: calculateEstimatedTime(transcriptText.length * 2, 'summarizing'), details: { fileName: audioFileName } });
    summarizeWithProgress(transcriptText);
  };

  const summarizeWithProgress = async (text: string) => {
    if (!text || text.trim() === '') { updatePipeline({ stage: 'error', message: 'Transcriptie is leeg', error: '...' }); showNotification('error', '...'); setIsProcessing(false); return; }
    if (!stageStartTime) setStageStartTime(Date.now());
    try {
      clearProgressInterval();
      progressIntervalRef.current = setInterval(() => { if (stageStartTime) { const elapsedSeconds = Math.floor((Date.now() - stageStartTime) / 1000); const estimatedTotal = calculateEstimatedTime(text.length * 2, 'summarizing'); const progress = calculateProgressFromTime(elapsedSeconds, estimatedTotal); const timeLeft = Math.max(1, estimatedTotal - elapsedSeconds); updatePipeline({ progress, estimatedTimeLeft: timeLeft, message: `Samenvatting genereren... (${progress}%)` }); } }, 1000);
      const response = await fetch('/api/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text, model: settings.summarizationModel, temperature: settings.temperature, prompt: selectedPrompt.prompt }) });
      clearProgressInterval();
      if (!response.ok) { let errorMessage = 'Samenvatting mislukt'; try { const errorData = await response.json(); errorMessage = errorData.error || `Serverfout ${response.status}`; } catch (e) { errorMessage = `Serverfout ${response.status}`; } throw new Error(errorMessage); }
      const data = await response.json(); if (data.error) throw new Error(data.error);
      console.log('Summarization successful.');
      setSummary(data.summary || ''); // Store raw Markdown ONLY
      // Removed setSummaryHtml
      updatePipeline({ stage: 'completed', progress: 100, message: 'Verwerking voltooid!', estimatedTimeLeft: 0 });
      setTimeout(() => { setPipelineActive(false); setIsProcessing(false); }, 2000);
    } catch (error) { console.error('❌ Samenvatting fout:', error); clearProgressInterval(); updatePipeline({ stage: 'error', message: 'Fout tijdens samenvatting', error: error instanceof Error ? error.message : 'Onbekende fout' }); showNotification('error', `Fout tijdens samenvatting: ${error instanceof Error ? error.message : 'Onbekende fout'}`); setIsProcessing(false); }
  };

 const handleAudioCapture = async (file: File) => {
    console.log("Handling captured audio:", file.name, file.size); setIsProcessing(true); setPipelineActive(true); const now = Date.now(); setPipelineStartTime(now); setStageStartTime(now);
    updatePipeline({ stage: 'uploading', progress: 0, message: `Audio opname "${file.name}" uploaden...`, estimatedTimeLeft: calculateEstimatedTime(file.size, 'uploading'), details: { fileName: file.name, fileSize: file.size } });
    try {
        clearProgressInterval(); let uploadProgress = 0;
        progressIntervalRef.current = setInterval(() => { if (uploadProgress < 95) { uploadProgress += Math.random() * 10; updatePipeline({ progress: Math.min(95, Math.round(uploadProgress)), estimatedTimeLeft: Math.max(1, calculateEstimatedTime(file.size, 'uploading') * (1 - uploadProgress / 100)) }); } else { clearProgressInterval(); } }, 200);
        const presignedResponse = await fetch('/api/upload-blob', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: file.name }), });
        if (!presignedResponse.ok) { const errorData = await presignedResponse.json(); throw new Error(`Kon upload URL niet krijgen: ${errorData.error || presignedResponse.statusText}`); }
        const blobInfo = (await presignedResponse.json()) as PutBlobResult;
        const uploadResponse = await fetch(blobInfo.url, { method: 'PUT', headers: { 'Content-Type': file.type || 'audio/webm' }, body: file, });
        clearProgressInterval(); if (!uploadResponse.ok) { throw new Error(`Upload naar Blob mislukt: ${uploadResponse.statusText}`); }
        updatePipeline({ progress: 100, message: 'Upload voltooid!' }); console.log('✅ Audio capture uploaded successfully:', blobInfo);
        setAudioFileName(file.name); setCurrentStep(2);
        setTimeout(() => { startPipelineProcessing(blobInfo); }, 500);
    } catch (error) { clearProgressInterval(); console.error("❌ Fout bij uploaden van opname:", error); showNotification('error', error instanceof Error ? error.message : 'Upload van opname mislukt'); updatePipeline({ stage: 'error', message: 'Fout bij uploaden van opname', error: error instanceof Error ? error.message : 'Upload van opname mislukt' }); setIsProcessing(false); setPipelineActive(false); }
};

  const handleCancelPipeline = () => { clearProgressInterval(); setPipelineActive(false); setIsProcessing(false); setPipelineStartTime(null); setStageStartTime(null); showNotification('info', 'Verwerking geannuleerd'); };
  const handleSummarize = async () => { if (!transcription || transcription.trim() === '') { showNotification('error', 'Transcriptie is leeg of ontbreekt'); return; } setIsProcessing(true); proceedToSummarization(transcription); };
  const handleRegenerateSummary = () => { if (!transcription || transcription.trim() === '') { showNotification('error', 'Transcriptie is leeg of ontbreekt om opnieuw te genereren.'); return; } setIsProcessing(true); proceedToSummarization(transcription); };
  const handleRegenerateTranscript = async () => {
      if (!uploadedBlobInfo) { showNotification('error', 'Originele audio-informatie niet beschikbaar om opnieuw te transcriberen.'); return; }
      setIsProcessing(true); const now = Date.now(); setPipelineStartTime(now); setStageStartTime(now);
      setSummary(''); // Clear raw summary
      // Removed setSummaryHtml
      setSummaryCost(0);
      updatePipeline({ stage: 'transcribing', progress: 0, message: getInitialStageMessage('transcribing'), estimatedTimeLeft: calculateEstimatedTime(15 * 1024 * 1024, 'transcribing', settings.transcriptionModel), details: { fileName: audioFileName }, error: undefined, });
      setPipelineActive(true); setCurrentStep(2); transcribeAudioWithProgress(uploadedBlobInfo);
  };

  const handleReset = () => {
    setUploadedBlobInfo(null); setAudioFileName(''); setTranscription(''); setSummary(''); // Reset summary
    // Removed setSummaryHtml
    setTranscriptionCost(0); setSummaryCost(0); setCurrentStep(1); setPipelineActive(false); setIsProcessing(false); setPipelineStartTime(null); setStageStartTime(null); clearProgressInterval(); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleSettings = () => setIsSettingsOpen(!isSettingsOpen);
  const updateSettings = (newSettings: Partial<typeof settings>) => setSettings(prev => ({ ...prev, ...newSettings }));
  const handleOpenEmailModal = () => setIsEmailModalOpen(true);
  const handleCloseEmailModal = () => setIsEmailModalOpen(false);
  // Handle refined summary - Just update the raw summary state
  const handleRefinedSummary = async (refinedMarkdownSummary: string) => {
      setSummary(refinedMarkdownSummary); // Update raw summary state ONLY
      showNotification('success', 'Samenvatting succesvol bijgewerkt');
      // Removed client-side HTML conversion
  };
  const handleEmailNotification = (success: boolean, message: string) => showNotification(success ? 'success' : 'error', message);
  // Updated showNotification to use sonner toast
  const showNotification = (type: 'success' | 'error' | 'info' | 'warning', message: string) => {
    switch (type) {
      case 'success':
        toast.success(message);
        break;
      case 'error':
        toast.error(message);
        break;
      case 'warning':
        toast.warning(message);
        break;
      case 'info':
      default:
        toast.info(message);
        break;
    }
  };
  // Removed closeNotification

  // Removed cardVariants

  return (
    // Consider updating bg color in globals.css or layout.tsx later for better theme consistency
    <main ref={mainContainerRef} className="min-h-screen bg-background text-foreground pb-20">
      {/* Removed Notification component usage */}
      {/* Use Shadcn Dialog for EmailModal later */}
      <EmailModal isOpen={isEmailModalOpen} onClose={handleCloseEmailModal} summary={summary} /* Pass only raw summary */ transcription={transcription} onSendEmail={handleEmailNotification} />
      <ProcessingPipeline isActive={pipelineActive} status={pipelineStatus} onCancel={handleCancelPipeline} />

      {/* Conditional Rendering based on summary */}
      {summary ? ( // Check summary state
        <FinalScreen
           summary={summary} // Pass raw summary
           // Removed summaryHtml prop
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
          {/* Header */} <div className="relative overflow-hidden">...</div>
          {/* Step indicator */} <div className="mb-12">...</div>
          {/* Main content area */}
           <div className="max-w-6xl mx-auto px-4 pt-8">
             {/* Settings button */} <div className="flex justify-end mb-4">...</div>
             {/* Settings panel */} <AnimatePresence>{isSettingsOpen && ( <MotionDiv>...</MotionDiv> )}</AnimatePresence>
             {/* Step 1: Audio Input Section */}
            <AnimatePresence mode="wait">
              {currentStep === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
                  <Card className="mb-12">
                    <CardHeader>
                      <CardTitle>Stap 1: Audio Invoeren</CardTitle>
                      <CardDescription>Kies een prompt, neem audio op of upload een bestand.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <PromptSelector onSelectPrompt={(prompt) => setSelectedPrompt(prompt)} selectedPromptId={selectedPrompt.id} />
                      <div className="grid md:grid-cols-2 gap-6">
                        {/* Wrap existing components in divs or directly style if needed */}
                        <div><CustomAudioRecorder onAudioRecorded={handleAudioCapture} /></div>
                        <div><FileUploader onFileUploadComplete={handleFileUploadComplete} /></div>
                      </div>
                    </CardContent>
                    {/* Optional CardFooter if needed */}
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
             {/* Step 2 Placeholder - Use Card for consistency */}
             <div id="transcribe-section" className="scroll-mt-24">
               <AnimatePresence>
                 {currentStep >= 2 && !summary && (
                   <motion.div key="step2-placeholder" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
                     <Card className="mb-12 min-h-[200px] flex items-center justify-center">
                       <CardContent>
                         <p className="text-muted-foreground">Stap 2: Transcriptie wordt hier weergegeven...</p>
                       </CardContent>
                     </Card>
                   </motion.div>
                 )}
               </AnimatePresence>
             </div>
             {/* Step 3 Placeholder - Use Card for consistency */}
              <div id="summary-section" className="scroll-mt-24">
                <AnimatePresence>
                  {currentStep >= 3 && !summary && (
                    <motion.div key="step3-placeholder" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
                      <Card className="mb-12 min-h-[200px] flex items-center justify-center">
                        <CardContent>
                          <p className="text-muted-foreground">Stap 3: Samenvatting wordt hier weergegeven...</p>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {/* Reset button */}
             {(currentStep > 1 || uploadedBlobInfo) && !summary && !pipelineActive && ( // Check summary state
               <div className="flex justify-center mt-10">
                 <Button variant="outline" onClick={handleReset}>Opnieuw Beginnen</Button>
               </div>
             )}
           </div>
        </>
      )}
    </main>
  );
}
