// src/app/components/FinalScreen.tsx
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SummaryDisplay from './SummaryDisplay';
import TranscriptionDisplay from './TranscriptionDisplay';
import SummaryActions from './SummaryActions';

interface FinalScreenProps {
  summary: string;
  transcription: string;
  audioFileName: string;
  isSummarizing: boolean;
  isTranscribing: boolean;
  transcriptionInfo: {
    chunked: boolean;
    chunks: number;
  };
  onRefinedSummary: (refinedSummary: string) => void;
  onOpenEmailModal: () => void;
  onReset: () => void;
  onToggleSettings: () => void;
  onRegenerateSummary: () => void;
  onRegenerateTranscript: () => void;
}

export default function FinalScreen({
  summary,
  transcription,
  audioFileName,
  isSummarizing,
  isTranscribing,
  transcriptionInfo,
  onRefinedSummary,
  onOpenEmailModal,
  onReset,
  onToggleSettings,
  onRegenerateSummary,
  onRegenerateTranscript
}: FinalScreenProps) {
  return (
    <div className="max-w-6xl mx-auto px-4 pt-6">
      {/* Header with file info and actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 bg-white rounded-xl p-5 shadow-md">
        <div className="flex items-center mb-4 md:mb-0">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">{audioFileName}</h1>
            <p className="text-sm text-gray-500">Verwerking voltooid</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={onToggleSettings}
            className="py-2 px-4 flex items-center gap-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Instellingen</span>
          </button>
          
          <button
            onClick={onReset}
            className="py-2 px-4 flex items-center gap-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span>Terug naar Home</span>
          </button>
        </div>
      </div>
      
      {/* Main content area */}
      <div className="grid grid-cols-1 gap-8">
        {/* Summary section - Prominent and primary */}
        <div className="mb-8">
          <SummaryDisplay summary={summary} isLoading={isSummarizing} />
        </div>
        
        {/* Summary actions */}
        {summary && !isSummarizing && (
          <div className="mb-8">
            <SummaryActions
              summary={summary}
              transcription={transcription}
              onRefinedSummary={onRefinedSummary}
              onOpenEmailModal={onOpenEmailModal}
            />
          </div>
        )}
        
        {/* Transcription - Collapsed by default */}
        {transcription && (
          <div className="mb-8">
            <TranscriptionDisplay 
              text={transcription} 
              isLoading={false}
              chunked={transcriptionInfo.chunked}
              chunksCount={transcriptionInfo.chunks}
            />
          </div>
        )}
        
        {/* Small action buttons at the bottom */}
        <div className="flex flex-wrap justify-center gap-4 mt-4 mb-12">
          <button
            onClick={onRegenerateSummary}
            disabled={isSummarizing}
            className={`py-2 px-4 text-sm rounded-md border ${
              isSummarizing 
                ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                : 'border-blue-200 text-blue-600 hover:bg-blue-50'
            }`}
          >
            {isSummarizing ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Genereren...
              </span>
            ) : (
              "Genereer samenvatting opnieuw"
            )}
          </button>
          
          <button
            onClick={onRegenerateTranscript}
            disabled={isTranscribing}
            className={`py-2 px-4 text-sm rounded-md border ${
              isTranscribing 
                ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                : 'border-purple-200 text-purple-600 hover:bg-purple-50'
            }`}
          >
            {isTranscribing ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-purple-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Genereren...
              </span>
            ) : (
              "Genereer transcript opnieuw"
            )}
          </button>
          
          <button
            onClick={onReset}
            className="py-2 px-4 text-sm rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            Ga terug naar het homescherm
          </button>
        </div>
      </div>
    </div>
  );
}