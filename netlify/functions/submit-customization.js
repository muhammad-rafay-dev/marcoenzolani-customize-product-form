// netlify/functions/submit-customization.js
const Busboy = require('busboy');
const nodemailer = require('nodemailer');

exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse the multipart form data
    const { fields, files } = await parseFormData(event);
    
    console.log(`📨 Received submission with ${files.length} files`);
    
    // Generate unique order ID
    const orderId = generateOrderId(Date.now());
    
    // Prepare email content
    const emailContent = prepareEmailContent(fields, files, orderId);
    
    // Send email using Gmail WITH attachments
    await sendGmail(emailContent, files);
    
    // Return success response
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        id: orderId,
        message: 'Customization request submitted successfully!',
        files_received: files.length
      })
    };
    
  } catch (error) {
    console.error('❌ Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};

// Parse multipart form data
function parseFormData(event) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: event.headers });
    const fields = {};
    const files = [];
    
    busboy.on('field', (name, value) => {
      fields[name] = value;
    });
    
    busboy.on('file', (name, file, info) => {
      const chunks = [];
      file.on('data', (chunk) => chunks.push(chunk));
      file.on('end', () => {
        files.push({
          fieldName: name,
          filename: info.filename,
          mimeType: info.mimeType,
          content: Buffer.concat(chunks),
          size: Buffer.concat(chunks).length
        });
      });
    });
    
    busboy.on('finish', () => {
      resolve({ fields, files });
    });
    
    busboy.on('error', (err) => {
      reject(err);
    });
    
    // Write the body to busboy
    busboy.write(
      event.body,
      event.isBase64Encoded ? 'base64' : 'binary'
    );
    busboy.end();
  });
}

// Generate order ID (same as The Jacket Maker)
function generateOrderId(timestamp) {
  const key = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let num = timestamp;
  let result = '';
  
  while (num > 0) {
    result = key[num % key.length] + result;
    num = Math.floor(num / key.length);
  }
  
  return result || 'a';
}

// Send email via Gmail WITH FILE ATTACHMENTS
async function sendGmail(emailContent, files) {
  // Create transporter using Gmail
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
  
  // Prepare attachments
  const attachments = files.map(file => ({
    filename: file.filename,
    content: file.content,
    contentType: file.mimeType || 'application/octet-stream',
    encoding: 'base64'
  }));
  
  console.log(`📧 Preparing to send email with ${attachments.length} attachments`);
  
  // Email options
  const mailOptions = {
    from: {
      name: 'Marco Enzolani Customizations',
      address: process.env.GMAIL_USER
    },
    to: process.env.NOTIFICATION_EMAIL || process.env.GMAIL_USER,
    replyTo: emailContent.fields.email || process.env.GMAIL_USER,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
    attachments: attachments
  };
  
  // Send email
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully!');
    console.log('📎 Message ID:', info.messageId);
    
    return info;
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    throw error;
  }
}

// Prepare email content
function prepareEmailContent(fields, files, orderId) {
  const fileListHtml = files.map(file => `
    <div style="margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 4px;">
      <strong>${file.fieldName}:</strong> ${escapeHtml(file.filename)}<br>
      <small>Size: ${(file.size / 1024).toFixed(2)} KB</small>
    </div>
  `).join('');
  
  const fileListText = files.map(file => 
    `• ${file.fieldName}: ${file.filename} (${(file.size / 1024).toFixed(2)} KB)`
  ).join('\n');
  
  return {
    orderId,
    fields,
    files,
    subject: `🎨 Customization Request #${orderId}: ${fields.product_title || 'Marco Enzolani Product'}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; }
          .header { background: #f8f9fa; padding: 20px; border-radius: 5px; }
          .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
          .field { margin: 10px 0; }
          .field-label { font-weight: bold; color: #555; }
          .file-count {
            background: #4CAF50;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            margin-left: 5px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>🎨 New Customization Request</h2>
          <p><strong>Request ID:</strong> #${orderId}</p>
          <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Files Attached:</strong> <span class="file-count">${files.length}</span></p>
        </div>
        
        <div class="section">
          <h3>👤 Customer Information</h3>
          <div class="field">
            <span class="field-label">Name:</span> ${escapeHtml(fields.name || 'Not provided')}
          </div>
          <div class="field">
            <span class="field-label">Email:</span> ${escapeHtml(fields.email || 'Not provided')}
          </div>
          <div class="field">
            <span class="field-label">Phone:</span> ${escapeHtml(fields.phone || 'Not provided')}
          </div>
        </div>
        
        <div class="section">
          <h3>🛍️ Product Details</h3>
          <div class="field">
            <span class="field-label">Product:</span> ${escapeHtml(fields.product_title || 'Not specified')}
          </div>
          <div class="field">
            <span class="field-label">Product ID:</span> ${escapeHtml(fields.product_id || 'Not specified')}
          </div>
        </div>
        
        ${fields.description ? `
        <div class="section">
          <h3>📝 Customer Message</h3>
          <p>${escapeHtml(fields.description)}</p>
        </div>
        ` : ''}
        
        ${files.length > 0 ? `
        <div class="section">
          <h3>📎 Uploaded Files (${files.length} attached)</h3>
          <p>The following files are attached to this email:</p>
          ${fileListHtml}
          <p style="font-size: 12px; color: #666; margin-top: 15px;">
            ℹ️ These files are attached to this email. You can download them directly from your email client.
          </p>
        </div>
        ` : ''}
        
        <hr>
        <p style="color: #666; font-size: 12px;">
          Submitted via Marco Enzolani Customization Form
          <br>Request ID: #${orderId}
        </p>
      </body>
      </html>
    `,
    text: `
      NEW CUSTOMIZATION REQUEST #${orderId}
      =====================================
      
      Customer Information:
      --------------------
      Name: ${fields.name || 'Not provided'}
      Email: ${fields.email || 'Not provided'}
      Phone: ${fields.phone || 'Not provided'}
      
      Product Details:
      ----------------
      Product: ${fields.product_title || 'Not specified'}
      Product ID: ${fields.product_id || 'Not specified'}
      
      ${fields.description ? `Message: ${fields.description}\n` : ''}
      
      Files Uploaded: ${files.length} file(s) attached to this email
      ${files.length > 0 ? fileListText : 'No files uploaded'}
      
      =====================================
      Submitted: ${new Date().toLocaleString()}
      Request ID: #${orderId}
    `
  };
}

// Helper: Escape HTML
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}