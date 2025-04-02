// src/app/components/FinalScreen.tsx
'use client';

import { useState, useEffect } from 'react'; // Add useEffect import
import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"; // Added CardFooter
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Settings, Mail, RotateCcw, FileText, Trash2, Save, XCircle, Edit } from 'lucide-react'; // Added Save, XCircle, Edit icons
import SummaryDisplay from './SummaryDisplay';
import SummaryActions from './SummaryActions';
import { Textarea } from "@/components/ui/textarea"; // Import Textarea
import { toast } from "sonner"; // For notifications

// Removed MotionDiv definition

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
  summary: initialSummary, // Rename prop to avoid conflict with state
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
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [editedSummary, setEditedSummary] = useState(initialSummary);

  // Update local state if initialSummary prop changes (e.g., after regeneration)
  useEffect(() => {
    setEditedSummary(initialSummary);
  }, [initialSummary]);

  const handleEditToggle = () => {
    if (isEditingSummary) {
      // If canceling edit, reset to initial summary
      setEditedSummary(initialSummary);
    }
    setIsEditingSummary(!isEditingSummary);
  };

  const handleSummaryChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedSummary(event.target.value);
  };

  const handleSaveChanges = () => {
    onRefinedSummary(editedSummary); // Pass edited summary back up
    setIsEditingSummary(false); // Exit editing mode
    toast.success("Samenvatting bijgewerkt!");
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <CardTitle>Verwerking voltooid</CardTitle> {/* Sentence case */}
          <CardDescription>Bestand: {audioFileName}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row justify-between items-center gap-4">
           <p className="text-sm text-muted-foreground">Hier is je samenvatting en transcriptie.</p>
           <Button variant="outline" size="icon" onClick={onToggleSettings} aria-label="Instellingen">
             <Settings className="h-4 w-4" />
           </Button>
        </CardContent>
      </Card>

      {/* Summary Card - Now with Editing */}
      <Card>
        <CardHeader className="flex flex-row justify-between items-center">
          <CardTitle>Samenvatting</CardTitle> {/* Already sentence case */}
          {/* Edit/Cancel Button */}
          <Button variant="ghost" size="sm" onClick={handleEditToggle}>
            {isEditingSummary ? (
              <><XCircle className="mr-2 h-4 w-4" /> Annuleren</>
            ) : (
              <><Edit className="mr-2 h-4 w-4" /> Bewerken</>
            )}
          </Button>
        </CardHeader>
        <CardContent>
          {isEditingSummary ? (
            <div className="space-y-4">
              <Textarea
                value={editedSummary}
                onChange={handleSummaryChange}
                rows={15} // Adjust rows as needed
                // Use dark theme styles for textarea within the dark card
                className="w-full font-sans text-sm border-slate-600 bg-slate-700/50 text-slate-100 placeholder:text-slate-400 focus-visible:ring-slate-400"
              />
              {/* Save Button - Only shown when editing */}
              <div className="flex justify-end">
                <Button onClick={handleSaveChanges}>
                  <Save className="mr-2 h-4 w-4" /> Wijzigingen Opslaan
                </Button>
              </div>
            </div>
          ) : (
            // Display the potentially edited summary using SummaryDisplay
            // Ensure SummaryDisplay uses the correct background/text color for readability
             <div className="bg-white text-gray-900 p-4 rounded-md border border-gray-200"> {/* Wrap SummaryDisplay for light background */}
               <SummaryDisplay summary={editedSummary} isLoading={isSummarizing} />
             </div>
          )}
        </CardContent>
        {/* Summary actions (like Email) in Footer - Only show when not editing */}
        {!isEditingSummary && editedSummary && !isSummarizing && (
          <CardFooter className="flex flex-wrap gap-2 justify-end">
             <Button variant="ghost" onClick={onOpenEmailModal}>
               <Mail className="mr-2 h-4 w-4" /> E-mail Samenvatting
             </Button>
             {/* Consider moving refine actions here or keeping them separate */}
          </CardFooter>
        )}
      </Card>

      {/* Summary Actions Card (Refinement) - Keep separate for now */}
       <SummaryActions
         summary={editedSummary} // Pass potentially edited summary
         transcription={transcription}
         onRefinedSummary={onRefinedSummary} // This will update editedSummary via prop change
         onOpenEmailModal={onOpenEmailModal} // Keep prop, though button moved above
       />


      {/* Transcription Accordion */}
      {transcription && (
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger>Bekijk Transcriptie</AccordionTrigger>
            <AccordionContent>
              <Card className="mt-4">
                <CardContent className="p-4 max-h-96 overflow-y-auto text-sm bg-muted/30 rounded-md">
                  <pre className="whitespace-pre-wrap font-sans">{transcription}</pre>
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {/* Action Buttons Card */}
      <Card>
        <CardHeader>
          <CardTitle>Acties</CardTitle> {/* Already sentence case */}
          <CardDescription>Wat wil je nu doen?</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap justify-center gap-4">
          <Button variant="outline" onClick={onRegenerateSummary} disabled={isSummarizing || isTranscribing}>
            <RotateCcw className="mr-2 h-4 w-4" /> Samenvatting Opnieuw Genereren
          </Button>
          <Button variant="outline" onClick={onRegenerateTranscript} disabled={isSummarizing || isTranscribing}>
            <FileText className="mr-2 h-4 w-4" /> Transcriptie Opnieuw Genereren
          </Button>
          <Button variant="destructive" onClick={onReset}>
            <Trash2 className="mr-2 h-4 w-4" /> Opnieuw Beginnen
          </Button>
        </CardContent>
      </Card>

      {/* Removed style jsx global */}
    </div>
  );
}
