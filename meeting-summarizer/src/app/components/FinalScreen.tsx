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
  summary: string; // Only raw summary prop needed
  // Removed summaryHtml
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
  summary, // Only raw summary prop needed
  // Removed summaryHtml
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
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 shadow-md">
        {/* ... Header content ... */}
         <div className="flex items-center mb-4 md:mb-0">...</div>
         <div className="flex items-center space-x-3">...</div>
      </div>

      {/* Main content area */}
      <div className="grid grid-cols-1 gap-8">
      {/* Summary section */}
      <div className="mb-6">
        {/* Pass only summary */}
        <SummaryDisplay summary={summary} isLoading={isSummarizing} />
      </div>

      {/* Summary actions */}
      {/* Check summary for existence */}
      {summary && !isSummarizing && (
      <div className="mb-8">
        <SummaryActions
          summary={summary} // Pass raw summary
          transcription={transcription}
          onRefinedSummary={onRefinedSummary}
          onOpenEmailModal={onOpenEmailModal}
        />
      </div>
      )}

      {/* Transcription */}
      {transcription && ( <div className="mb-8"> ... </div> )}

      {/* Action buttons */}
      <div className="flex flex-wrap justify-center gap-4 mt-4 mb-12"> ... </div>
      </div>

      {/* Styles */}
      <style jsx global>{`...`}</style>
    </div>
  );
}
