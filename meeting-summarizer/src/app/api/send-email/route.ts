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

// Helper function to replace newlines with <br> only outside of HTML tags
const processContentForHtmlEmail = (content: string): string => {
  // This regex attempts to find text segments that are NOT inside HTML tags.
  // It's a simplified approach and might not handle all complex HTML cases,
  // but should work for the expected mix of plain text and HTML tables.
  // It looks for segments that do not contain '<' or '>' characters, or are within known HTML tags (like table tags).
  // A more robust solution would involve a proper HTML parser.
  // Replaced '.' with '[\\s\\S]' to match any character including newlines without the /s flag
  const parts = content.split(/(<table[\\s\\S]*?<\/table>)/g); // Split by table tags, keeping the tags

  let processedContent = '';

  parts.forEach(part => {
    // Replaced '.' with '[\\s\\S]' to match any character including newlines without the /s flag
    if (part.match(/^<table[\\s\\S]*?<\/table>$/)) {
      // If the part is an HTML table, append it as is
      processedContent += part;
    } else {
      // If the part is not an HTML table (assumed to be plain text or other markdown converted HTML),
      // replace newlines with <br>
      processedContent += part.replace(/\n/g, '<br>');
    }
  });

  return processedContent;
};


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

    // Process the content to handle newlines correctly for HTML email
    const processedContent = processContentForHtmlEmail(content);

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
            /* Basic table styles for email compatibility */
            table {
                border-collapse: collapse;
                width: 100%;
                margin: 20px 0; /* Add some vertical space around tables */
            }
            th, td {
                border: 1px solid #ddd;
                padding: 8px;
                text-align: left;
            }
            th {
                background-color: #f2f2f2;
                font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>${subject}</h2>
          </div>

          ${additionalMessage ? `
          <div class="message-box">
            <p>${additionalMessage.replace(/\n/g, '<br>')}</p> <!-- Replace newlines in additional message -->
          </div>
          ` : ''}

          <div class="content">
            ${processedContent}
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