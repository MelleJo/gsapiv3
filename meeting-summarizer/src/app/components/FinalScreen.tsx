// src/app/components/FinalScreen.tsx
'use client';

import { useState } from 'react';
import { motion, AnimatePresence, MotionProps } from 'framer-motion';
import React, { HTMLAttributes, forwardRef } from 'react';
import SummaryDisplay from './SummaryDisplay';
import SummaryActions from './SummaryActions';

// Create properly typed motion components
type MotionDivProps = HTMLAttributes<HTMLDivElement> & MotionProps;
const MotionDiv = forwardRef<HTMLDivElement, MotionDivProps>((props, ref) => (
  <motion.div ref={ref} {...props} />
));
MotionDiv.displayName = 'MotionDiv';

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
  const [showTranscript, setShowTranscript] = useState<boolean>(false);

  return (
    <div className="max-w-6xl mx-auto px-4 pt-6">
      {/* Elegant header with file info and actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 shadow-md">
        <div className="flex items-center mb-4 md:mb-0">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mr-4 shadow-md">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{audioFileName}</h1>
            <p className="text-sm text-gray-500 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Verwerking voltooid
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={onToggleSettings}
            className="py-2 px-4 flex items-center gap-2 rounded-lg text-gray-600 hover:bg-white/80 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Instellingen</span>
          </button>
          
          <button
            onClick={onReset}
            className="py-2 px-4 flex items-center gap-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors shadow-md"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span>Nieuw Bestand</span>
          </button>
        </div>
      </div>
      
      {/* Main content area */}
      <div className="grid grid-cols-1 gap-8">
        {/* Summary section - Prominent and primary */}
        <div className="mb-6">
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
        
        {/* Transcription - Toggleable */}
        {transcription && (
          <div className="mb-8">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold text-gray-800">Transcriptie</h2>
                  {transcriptionInfo.chunked && transcriptionInfo.chunks > 1 && (
                    <div className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                      </svg>
                      Verwerkt in {transcriptionInfo.chunks} delen
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setShowTranscript(!showTranscript)}
                  className="flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors"
                >
                  {showTranscript ? 'Verbergen' : 'Tonen'}
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    className={`w-4 h-4 transition-transform ${showTranscript ? 'rotate-180' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
              </div>
              
              <AnimatePresence>
                {showTranscript ? (
                  <MotionDiv
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                      {transcription.split('\n').map((paragraph, i) => (
                        <p key={i} className="mb-4 text-gray-700 leading-relaxed">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </MotionDiv>
                ) : (
                  <div 
                    className="text-gray-700 text-sm bg-gray-50 p-4 rounded-lg mb-3 cursor-pointer"
                    onClick={() => setShowTranscript(true)}
                  >
                    {transcription.substring(0, 150)}...
                    <div className="text-blue-600 text-xs mt-2 flex items-center justify-center">
                      Klik om volledige transcriptie te zien
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        className="w-4 h-4 ml-1"
                      >
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </div>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
        
        {/* Small action buttons at the bottom - modern pill-shaped */}
        <div className="flex flex-wrap justify-center gap-4 mt-4 mb-12">
          <button
            onClick={onRegenerateSummary}
            disabled={isSummarizing}
            className={`py-2 px-6 text-sm rounded-full flex items-center ${
              isSummarizing 
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors border border-blue-200'
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
              <>
                <svg className="w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Regenereer samenvatting
              </>
            )}
          </button>
          
          <button
            onClick={onRegenerateTranscript}
            disabled={isTranscribing}
            className={`py-2 px-6 text-sm rounded-full flex items-center ${
              isTranscribing 
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors border border-purple-200'
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
              <>
                <svg className="w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                Genereer transcript opnieuw
              </>
            )}
          </button>
        </div>
      </div>
      
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }
      `}</style>
    </div>
  );
}