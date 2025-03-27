'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, MotionProps } from 'framer-motion';
import React, { HTMLAttributes, forwardRef } from 'react';

type MotionDivProps = HTMLAttributes<HTMLDivElement> & MotionProps;
const MotionDiv = forwardRef<HTMLDivElement, MotionDivProps>((props, ref) => (
  <motion.div ref={ref} {...props} />
));
MotionDiv.displayName = 'MotionDiv';

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: string; // Raw Markdown for API calls
  summaryHtml: string; // HTML for display/fallback content
  transcription?: string; // Make the transcription optional
  onSendEmail: (success: boolean, message: string) => void;
}

// Function to extract plain text from HTML (moved here for use)
const extractTextFromHtml = (html: string): string => {
  if (typeof window === 'undefined') return ''; // Avoid errors during SSR
  try {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    // Add line breaks between block elements for better readability
    tempDiv.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, tr').forEach(el => {
      el.insertAdjacentText('afterend', '\n');
    });
    // Add extra line break after tables
    tempDiv.querySelectorAll('table').forEach(el => {
      el.insertAdjacentText('afterend', '\n\n');
    });
    return tempDiv.textContent || tempDiv.innerText || '';
  } catch (e) {
    console.error("Error extracting text from HTML:", e);
    return ''; // Fallback
  }
};


export default function EmailModal({
  isOpen,
  onClose,
  summary, // Raw Markdown
  summaryHtml, // HTML version
  transcription = '',
  onSendEmail
}: EmailModalProps) {
  const [emailContent, setEmailContent] = useState<string>(''); // This will hold the final text/HTML for the email body
  const [recipients, setRecipients] = useState<string>('');
  const [emailList, setEmailList] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState<string>('');
  const [subject, setSubject] = useState<string>('Vergaderingsamenvatting');
  const [additionalMessage, setAdditionalMessage] = useState<string>('');
  const [senderName, setSenderName] = useState<string>('');
  const [isPreview, setIsPreview] = useState<boolean>(false);
  const [isFormatting, setIsFormatting] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Format the summary as an email using the API or fallback
  const formatAsEmail = useCallback(async () => {
    setIsFormatting(true);
    setError(null);

    try {
      // Try refining via API using RAW MARKDOWN summary
      if (transcription && transcription.trim() !== '' && summary && summary.trim() !== '') {
        const response = await fetch('/api/refine-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summary: summary, // Use raw Markdown summary
            transcript: transcription,
            action: 'email-format'
          })
        });

        const data = await response.json();
        if (!response.ok || data.error) {
          throw new Error(data.error || `API fout bij formatteren (${response.status})`);
        }
        // Assuming the API returns plain text suitable for email
        setEmailContent(data.refinedSummary);
        setIsFormatting(false);
        return; // Exit if successful
      }

      // Fallback: Use plain text extracted from HTML summary
      const plainTextSummary = extractTextFromHtml(summaryHtml);
      const formattedEmail = `Beste collega,

Hierbij de samenvatting van onze recente vergadering:

${plainTextSummary.trim()}

Met vriendelijke groet,
${senderName || 'Super Kees Online'}`;

      setEmailContent(formattedEmail);

    } catch (error) {
      console.error('Error formatting email:', error);
      setError(error instanceof Error ? error.message : 'Er is een fout opgetreden bij het formatteren van de e-mail');
      // Fallback to plain text summary if formatting fails
      setEmailContent(extractTextFromHtml(summaryHtml));
    } finally {
      setIsFormatting(false);
    }
  }, [summary, summaryHtml, transcription, senderName]); // Depend on both summary versions

  // Effect to format summary as email when modal opens or summaryHtml changes
  useEffect(() => {
    if (isOpen && summaryHtml) {
      // Set initial content quickly, then format
      setEmailContent(extractTextFromHtml(summaryHtml)); // Show plain text initially
      formatAsEmail(); // Attempt API formatting
    } else if (!isOpen) {
       // Reset state when modal closes
       setEmailContent('');
       setRecipients('');
       setSubject('Vergaderingsamenvatting');
       setAdditionalMessage('');
       setSenderName('');
       setIsPreview(false);
       setError(null);
    }
  }, [isOpen, summaryHtml, formatAsEmail]); // Rerun formatAsEmail if summaryHtml changes while open

  // Effect to synchronize emailList with recipients string
  useEffect(() => {
    if (recipients.trim()) {
      const emails = recipients.split(',').map(email => email.trim()).filter(email => email);
      setEmailList(emails);
    } else {
      setEmailList([]);
    }
  }, [recipients]);

  // Effect to update recipients when emailList changes
  useEffect(() => {
    setRecipients(emailList.join(', '));
  }, [emailList]);

  // Handle click outside modal to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    if (isOpen) { document.addEventListener('mousedown', handleClickOutside); }
    return () => { document.removeEventListener('mousedown', handleClickOutside); };
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) { document.body.style.overflow = 'hidden'; }
    else { document.body.style.overflow = 'auto'; }
    return () => { document.body.style.overflow = 'auto'; };
  }, [isOpen]);

  // Validate a single email address
  const validateEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  // Add a new email to the list
  const handleAddEmail = () => {
    if (!newEmail.trim()) return;
    if (!validateEmail(newEmail)) { setError('Het e-mailadres is ongeldig'); return; }
    if (emailList.includes(newEmail.trim())) { setError('Dit e-mailadres is al toegevoegd'); return; }
    setEmailList([...emailList, newEmail.trim()]);
    setNewEmail('');
    setError(null);
  };

  // Remove an email from the list
  const handleRemoveEmail = (emailToRemove: string) => setEmailList(emailList.filter(email => email !== emailToRemove));

  // Handle enter key press in email input
  const handleKeyPress = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); handleAddEmail(); } };

  // Send the email
  const handleSendEmail = async () => {
    if (emailList.length === 0) { setError('Voer ten minste één e-mailadres in'); return; }
    if (!subject.trim()) { setError('Voer een onderwerp in'); return; }

    setIsSending(true);
    setError(null);

    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emailList,
          subject,
          // Send the potentially refined plain text content
          content: emailContent,
          senderName: senderName.trim() || undefined,
          additionalMessage: additionalMessage.trim() || undefined
        })
      });

      const data = await response.json();
      if (!response.ok || data.error) { throw new Error(data.error || `Verzenden mislukt (${response.status})`); }

      const recipientMessage = emailList.length > 1 ? `E-mail succesvol verzonden naar ${emailList.length} ontvangers` : `E-mail succesvol verzonden naar ${emailList[0]}`;
      onSendEmail(true, data.message || recipientMessage);
      onClose(); // Close modal on success

    } catch (error) {
      console.error('Error sending email:', error);
      const errorMessage = error instanceof Error ? error.message : 'Er is een fout opgetreden bij het verzenden van de e-mail';
      setError(errorMessage);
      onSendEmail(false, errorMessage);
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  // --- RENDER LOGIC --- (Mostly unchanged, but uses emailContent state)
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-60 flex items-center justify-center p-4">
        <MotionDiv
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          ref={modalRef}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" // Added flex flex-col
        >
          {/* Header */}
          <div className="flex justify-between items-center p-6 border-b border-neutral-200 flex-shrink-0">
            <h2 className="text-xl font-semibold text-neutral-800">
              {isPreview ? 'Voorbeeld van e-mail' : 'Verstuur samenvatting via e-mail'}
            </h2>
            <button onClick={onClose} className="text-neutral-500 hover:text-neutral-700 transition-colors" aria-label="Sluiten">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          {/* Scrollable Content Area */}
          <div className="p-6 overflow-y-auto flex-grow">
            <AnimatePresence>
              {error && ( <MotionDiv /* Error display */ >{error}</MotionDiv> )}
            </AnimatePresence>

            {isPreview ? (
              // Preview Mode
              <div className="bg-neutral-50 rounded-xl p-6 border border-neutral-200">
                 {/* Van/Aan/Onderwerp */}
                 <div className="mb-4 pb-4 border-b border-neutral-200">...</div>
                 <div className="mb-4 pb-4 border-b border-neutral-200">...</div>
                 <div className="mb-4 pb-4 border-b border-neutral-200">...</div>
                 {/* Additional Message */}
                 {additionalMessage && ( <div className="mb-4 p-3 bg-blue-50 ...">{additionalMessage}</div> )}
                 {/* Email Content (plain text rendering) */}
                 <div className="whitespace-pre-wrap text-sm text-neutral-800">
                   {emailContent}
                 </div>
              </div>
            ) : (
              // Edit Mode
              <>
                {/* Recipients Input */}
                <div className="mb-4">...</div>
                {/* Subject Input */}
                <div className="mb-4">...</div>
                {/* Additional Message Textarea */}
                <div className="mb-4">...</div>
                {/* Sender Name Input */}
                <div className="mb-4">...</div>
                {/* Email Content Textarea */}
                <div className="mb-4">
                  <label className="flex items-center justify-between text-sm font-medium text-neutral-700 mb-1">
                    <span>E-mailinhoud</span>
                    <button onClick={formatAsEmail} disabled={isFormatting} className="...">
                      {/* Reformat button */}
                    </button>
                  </label>
                  <textarea
                    value={emailContent} // Display potentially refined content
                    onChange={(e) => setEmailContent(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                    rows={12}
                  />
                </div>
              </>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-6 border-t border-neutral-200 bg-neutral-50 flex justify-between flex-shrink-0">
            <button onClick={() => setIsPreview(!isPreview)} className="...">
              {isPreview ? 'Bewerken' : 'Voorbeeld'}
            </button>
            <div className="flex space-x-3">
              <button onClick={onClose} className="...">Annuleren</button>
              <button onClick={handleSendEmail} disabled={isSending} className="...">
                {isSending ? 'Verzenden...' : `Versturen naar ${emailList.length} ${emailList.length === 1 ? 'ontvanger' : 'ontvangers'}`}
              </button>
            </div>
          </div>
        </MotionDiv>
      </div>
    </AnimatePresence>
  );
}
