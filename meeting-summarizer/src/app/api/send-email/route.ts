// src/app/api/send-email/route.ts

import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

interface EmailRequest {
  to: string[];
  subject: string;
  content: string;
  senderName?: string;
  additionalMessage?: string;
}

export async function POST(request: Request) {
  try {
    const { to, subject, content, senderName, additionalMessage } = await request.json() as EmailRequest;
    
    if (!to || !to.length || !subject || !content) {
      return NextResponse.json(
        { error: 'Ontvanger, onderwerp en inhoud zijn verplicht' },
        { status: 400 }
      );
    }

    // Validate email addresses
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = to.filter(email => !emailRegex.test(email));
    if (invalidEmails.length > 0) {
      return NextResponse.json(
        { error: `Ongeldige e-mailadressen: ${invalidEmails.join(', ')}` },
        { status: 400 }
      );
    }

    // Create email transporter
    // NOTE: For production, use environment variables for these credentials
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.example.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER || 'user@example.com',
        pass: process.env.EMAIL_PASSWORD || 'password',
      },
    });

    // Construct the email content with HTML formatting
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              line-height: 1.6; 
              color: #333; 
              max-width: 650px; 
              margin: 0 auto; 
              padding: 20px; 
            }
            .header { 
              border-bottom: 1px solid #eee; 
              padding-bottom: 10px; 
              margin-bottom: 20px; 
            }
            .footer { 
              margin-top: 30px; 
              padding-top: 10px; 
              border-top: 1px solid #eee; 
              font-size: 12px; 
              color: #666; 
            }
            h2 { 
              color: #444; 
            }
            .message-box {
              background-color: #f9f9f9;
              border-left: 4px solid #3b82f6;
              padding: 15px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>${subject}</h2>
          </div>
          
          ${additionalMessage ? `
          <div class="message-box">
            <p>${additionalMessage}</p>
          </div>
          ` : ''}
          
          <div class="content">
            ${content.replace(/\n/g, '<br>')}
          </div>
          
          <div class="footer">
            <p>Dit bericht is verzonden via Meeting Summarizer${senderName ? ` door ${senderName}` : ''}.</p>
          </div>
        </body>
      </html>
    `;

    // Configure email options
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'Meeting Summarizer <noreply@meeting-summarizer.com>',
      to: to.join(', '),
      subject: subject,
      html: htmlContent,
      text: additionalMessage 
        ? `${subject}\n\n${additionalMessage}\n\n${content}\n\nDit bericht is verzonden via Meeting Summarizer${senderName ? ` door ${senderName}` : ''}.`
        : `${subject}\n\n${content}\n\nDit bericht is verzonden via Meeting Summarizer${senderName ? ` door ${senderName}` : ''}.`,
    };

    // Send the email
    await transporter.sendMail(mailOptions);

    return NextResponse.json({ 
      success: true,
      message: `Email succesvol verzonden naar ${to.join(', ')}`
    });
  } catch (error: any) {
    console.error('Email verzenden mislukt:', error);
    const errorMessage = error.message || 'Email verzenden mislukt';
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}