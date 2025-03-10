'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: string;
  transcription?: string; // Make the transcription optional
  onSendEmail: (success: boolean, message: string) => void;
}

export default function EmailModal({ isOpen, onClose, summary, transcription = '', onSendEmail }: EmailModalProps) {
  const [emailContent, setEmailContent] = useState<string>('');
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
  
  // Format the summary as an email using the API
  const formatAsEmail = async () => {
    setIsFormatting(true);
    setError(null);
    
    try {
      // First try with the transcript if available
      if (transcription && transcription.trim() !== '') {
        const response = await fetch('/api/refine-summary', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            summary,
            transcript: transcription,
            action: 'email-format'
          })
        });
        
        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.error);
        }
        
        setEmailContent(data.refinedSummary);
        return;
      }
      
      // Fallback - if no transcript, we'll just format the summary directly
      // as a simple email without AI refinement
      const formattedEmail = `Beste collega,

Hierbij de samenvatting van onze recente vergadering:

${summary}

Met vriendelijke groet,
${senderName || 'Super Kees Online'}`;
      
      setEmailContent(formattedEmail);
    } catch (error) {
      console.error('Error formatting email:', error);
      setError(error instanceof Error ? error.message : 'Er is een fout opgetreden bij het formatteren van de e-mail');
      // Fallback to original summary if formatting fails
      setEmailContent(summary);
    } finally {
      setIsFormatting(false);
    }
  };
  
  // Effect to format summary as email on initial load
  useEffect(() => {
    if (isOpen && summary) {
      setEmailContent(summary);
      formatAsEmail();
    }
    // Add formatAsEmail to dependency array
  }, [isOpen, summary, formatAsEmail]);
  
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
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);
  
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);
  
  // Validate a single email address
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };
  
  // Add a new email to the list
  const handleAddEmail = () => {
    if (!newEmail.trim()) {
      return;
    }
    
    if (!validateEmail(newEmail)) {
      setError('Het e-mailadres is ongeldig');
      return;
    }
    
    if (emailList.includes(newEmail.trim())) {
      setError('Dit e-mailadres is al toegevoegd');
      return;
    }
    
    setEmailList([...emailList, newEmail.trim()]);
    setNewEmail('');
    setError(null);
  };
  
  // Remove an email from the list
  const handleRemoveEmail = (emailToRemove: string) => {
    setEmailList(emailList.filter(email => email !== emailToRemove));
  };
  
  // Handle enter key press in email input
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddEmail();
    }
  };
  
  // Send the email
  const handleSendEmail = async () => {
    if (emailList.length === 0) {
      setError('Voer ten minste één e-mailadres in');
      return;
    }
    
    if (!subject.trim()) {
      setError('Voer een onderwerp in');
      return;
    }
    
    setIsSending(true);
    setError(null);
    
    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: emailList,
          subject,
          content: emailContent,
          senderName: senderName.trim() || undefined,
          additionalMessage: additionalMessage.trim() || undefined
        })
      });
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      const recipientMessage = emailList.length > 1 
        ? `E-mail succesvol verzonden naar ${emailList.length} ontvangers` 
        : `E-mail succesvol verzonden naar ${emailList[0]}`;
      
      onSendEmail(true, data.message || recipientMessage);
      onClose();
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
  
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-60 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          ref={modalRef}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden"
        >
          <div className="flex justify-between items-center p-6 border-b border-neutral-200">
            <h2 className="text-xl font-semibold text-neutral-800">
              {isPreview ? 'Voorbeeld van e-mail' : 'Verstuur samenvatting via e-mail'}
            </h2>
            <button
              onClick={onClose}
              className="text-neutral-500 hover:text-neutral-700 transition-colors"
              aria-label="Sluiten"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-130px)]">
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
            
            {isPreview ? (
              <div className="bg-neutral-50 rounded-xl p-6 mb-6 border border-neutral-200">
                <div className="mb-4 pb-4 border-b border-neutral-200">
                  <div className="text-sm text-neutral-500 mb-1">Van:</div>
                  <div className="text-neutral-800">
                    Super Kees Online{senderName ? ` (${senderName})` : ''}
                  </div>
                </div>
                
                <div className="mb-4 pb-4 border-b border-neutral-200">
                  <div className="text-sm text-neutral-500 mb-1">Aan:</div>
                  <div className="text-neutral-800">
                    {emailList.length > 0 ? emailList.join(', ') : '[Vul e-mailadressen in]'}
                  </div>
                </div>
                
                <div className="mb-4 pb-4 border-b border-neutral-200">
                  <div className="text-sm text-neutral-500 mb-1">Onderwerp:</div>
                  <div className="font-medium text-neutral-800">{subject}</div>
                </div>
                
                {additionalMessage && (
                  <div className="mb-4 p-3 bg-blue-50 border-l-4 border-blue-400 text-neutral-700 rounded-r-lg">
                    {additionalMessage}
                  </div>
                )}
                
                <div className="prose prose-sm max-w-none">
                  {emailContent.split('\n').map((paragraph, i) => (
                    <p key={i} className="mb-2">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Ontvangers
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder="Voer een e-mailadres in"
                      className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleAddEmail}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Toevoegen
                    </button>
                  </div>
                  
                  {/* Added email chips/tags */}
                  <div className="flex flex-wrap gap-2 mb-2">
                    {emailList.map((email, index) => (
                      <div key={index} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full flex items-center">
                        <span className="text-sm">{email}</span>
                        <button
                          onClick={() => handleRemoveEmail(email)}
                          className="ml-2 text-blue-500 hover:text-blue-700"
                          aria-label={`Verwijder ${email}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  
                  <p className="text-xs text-neutral-500 mt-1">
                    Voeg meerdere e-mailadressen toe door na elk adres op &quot;Toevoegen&quot; te klikken
                  </p>
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Onderwerp
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Onderwerp van de e-mail"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Persoonlijke boodschap (optioneel)
                  </label>
                  <textarea
                    value={additionalMessage}
                    onChange={(e) => setAdditionalMessage(e.target.value)}
                    placeholder="Voeg een persoonlijke boodschap toe aan het begin van de e-mail"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    rows={3}
                  />
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Je naam (optioneel)
                  </label>
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="Je naam"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div className="mb-4">
                  <label className="flex items-center justify-between text-sm font-medium text-neutral-700 mb-1">
                    <span>E-mailinhoud</span>
                    <button
                      onClick={formatAsEmail}
                      disabled={isFormatting}
                      className="text-blue-600 hover:text-blue-800 text-xs flex items-center disabled:text-blue-300"
                    >
                      {isFormatting ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Formatteren...
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                            <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5l6.74-6.76z"></path>
                            <line x1="16" y1="8" x2="2" y2="22"></line>
                            <line x1="17.5" y1="15" x2="9" y2="15"></line>
                          </svg>
                          Opnieuw formatteren
                        </>
                      )}
                    </button>
                  </label>
                  <textarea
                    value={emailContent}
                    onChange={(e) => setEmailContent(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                    rows={12}
                  />
                </div>
              </>
            )}
          </div>
          
          <div className="p-6 border-t border-neutral-200 bg-neutral-50 flex justify-between">
            <button
              onClick={() => setIsPreview(!isPreview)}
              className="px-4 py-2 border border-neutral-300 rounded-lg text-neutral-700 hover:bg-neutral-100 transition-colors flex items-center"
            >
              {isPreview ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                  Bewerken
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                    <path d="M15 3h6v6"></path>
                    <path d="M10 14 21 3"></path>
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  </svg>
                  Voorbeeld
                </>
              )}
            </button>
            
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-neutral-300 rounded-lg text-neutral-700 hover:bg-neutral-100 transition-colors"
              >
                Annuleren
              </button>
              
              <button
                onClick={handleSendEmail}
                disabled={isSending}
                className={`px-6 py-2 rounded-lg text-white font-medium flex items-center transition-all ${
                  isSending
                    ? 'bg-green-400 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700 hover:shadow-md'
                }`}
              >
                {isSending ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Verzenden...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                      <path d="m22 2-7 20-4-9-9-4Z"></path>
                      <path d="M22 2 11 13"></path>
                    </svg>
                    Versturen naar {emailList.length} {emailList.length === 1 ? 'ontvanger' : 'ontvangers'}
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}