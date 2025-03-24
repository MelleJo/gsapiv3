// src/app/api/send-email/route.ts

import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

interface EmailRequest {
  to: string[];
  subject: string;
  content: string;
  senderName?: string;
  additionalMessage?: string;
  isHtml?: boolean;
}

export async function POST(request: Request) {
  try {
    const { to, subject, content, senderName, additionalMessage, isHtml } = await request.json() as EmailRequest;
    
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
            /* Email client safe styles */
            body { 
              font-family: Arial, sans-serif; 
              line-height: 1.6; 
              color: #333333; 
              max-width: 650px; 
              margin: 0 auto; 
              padding: 20px; 
            }
            .header { 
              border-bottom: 1px solid #eeeeee; 
              padding-bottom: 10px; 
              margin-bottom: 20px; 
            }
            .footer { 
              margin-top: 30px; 
              padding-top: 10px; 
              border-top: 1px solid #eeeeee; 
              font-size: 12px; 
              color: #666666; 
            }
            h2 { 
              color: #444444; 
              margin: 0 0 10px 0;
              font-size: 20px;
            }
            table {
              border-collapse: collapse;
              width: 100%;
              margin: 10px 0;
            }
            th, td {
              border: 1px solid #d1d5db;
              padding: 8px;
              text-align: left;
              vertical-align: top;
            }
            th {
              background-color: #f3f4f6;
              font-weight: 600;
              color: #111827;
            }
            td {
              background-color: #ffffff;
              color: #111827;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>${subject}</h2>
          </div>
          
          ${additionalMessage || ''}
          
          <div class="content">
            ${isHtml ? content : content.replace(/\n/g, '<br>')}
          </div>
          
          <div class="footer">
            <p>Dit bericht is verzonden via Meeting Summarizer${senderName ? ` door ${senderName}` : ''}.</p>
          </div>
        </body>
      </html>
    `;

    // Create plain text version by stripping HTML
    const createPlainText = (html: string): string => {
      return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style tags
        .replace(/<[^>]+>/g, '') // Remove HTML tags
        .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
        .replace(/\s+/g, ' ') // Collapse multiple spaces
        .trim();
    };

    // Configure email options with both HTML and plain text versions
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'Meeting Summarizer <noreply@meeting-summarizer.com>',
      to: to.join(', '),
      subject: subject,
      html: htmlContent,
      text: createPlainText(htmlContent),
      // Email client compatibility headers
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Priority': '3',
        'X-MSMail-Priority': 'Normal',
      }
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
