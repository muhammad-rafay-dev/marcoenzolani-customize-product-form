// Store credentials in the function (not ideal but free)
const CONFIG = {
  // Replace these with your actual values
  GMAIL_USER: "mrafay.developer@gmail.com",
  GMAIL_APP_PASSWORD: "btol kvrd hmel jfym",
  NOTIFICATION_EMAIL: "mrafay.developer@gmail.com",
  
  // Optional: Add a simple obfuscation
  getCredentials: function() {
    return {
      user: this.GMAIL_USER,
      pass: this.GMAIL_APP_PASSWORD,
      to: this.NOTIFICATION_EMAIL
    };
  }
};

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
    console.log('📝 Form fields:', Object.keys(fields));
    
    // Generate unique numeric order ID
    const orderId = generateNumericOrderId();
    
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
      console.log(`📋 Field: ${name} = ${value}`);
    });
    
    busboy.on('file', (name, file, info) => {
      const chunks = [];
      file.on('data', (chunk) => chunks.push(chunk));
      file.on('end', () => {
        const fileData = {
          fieldName: name,
          filename: info.filename,
          mimeType: info.mimeType,
          content: Buffer.concat(chunks),
          size: Buffer.concat(chunks).length
        };
        files.push(fileData);
        console.log(`📎 File: ${name} - ${info.filename} (${(fileData.size / 1024).toFixed(2)} KB)`);
      });
    });
    
    busboy.on('finish', () => {
      console.log(`✅ Parsed ${Object.keys(fields).length} fields and ${files.length} files`);
      resolve({ fields, files });
    });
    
    busboy.on('error', (err) => {
      console.error('❌ Busboy error:', err);
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

// Generate numeric-only order ID (8-digit random number)
function generateNumericOrderId() {
  // Generate 8-digit random number (10000000 to 99999999)
  const min = 10000000;
  const max = 99999999;
  const randomNum = Math.floor(Math.random() * (max - min + 1)) + min;
  
  // Add timestamp for more uniqueness (optional)
  const timestamp = Date.now() % 1000000; // Last 6 digits of timestamp
  const finalId = (randomNum + timestamp) % 100000000; // Ensure 8 digits
  
  // Ensure it's 8 digits with leading zeros if needed
  return String(finalId).padStart(8, '0');
}

// Send email via Gmail WITH FILE ATTACHMENTS
async function sendGmail(emailContent, files) {
  // Create transporter using Gmail
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: CONFIG.GMAIL_USER,
      pass: CONFIG.GMAIL_APP_PASSWORD
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
      address: CONFIG.GMAIL_USER
    },
    to: CONFIG.NOTIFICATION_EMAIL || CONFIG.GMAIL_USER,
    replyTo: emailContent.fields.email || CONFIG.GMAIL_USER,
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

// Helper: Get option display text
function getOptionText(optionValue, otherValue, defaultValue = 'No Change') {
  if (!optionValue || optionValue === 'none') return defaultValue;
  if (optionValue === 'other' && otherValue) return `Other: ${escapeHtml(otherValue)}`;
  return escapeHtml(optionValue.charAt(0).toUpperCase() + optionValue.slice(1));
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
  
  // Get artwork placement list
  const artworkPlacements = [];
  if (fields.artwork_left_chest === 'yes') artworkPlacements.push('Left Chest');
  if (fields.artwork_right_chest === 'yes') artworkPlacements.push('Right Chest');
  if (fields.artwork_left_arm === 'yes') artworkPlacements.push('Left Arm');
  if (fields.artwork_right_arm === 'yes') artworkPlacements.push('Right Arm');
  if (fields.artwork_back === 'yes') artworkPlacements.push('Back');
  if (fields.artwork_other === 'yes') artworkPlacements.push('Other Location');
  
  const artworkHtml = artworkPlacements.length > 0 
    ? `<ul style="margin: 5px 0 0 20px;">
        ${artworkPlacements.map(placement => `<li>${placement}</li>`).join('')}
       </ul>`
    : '<p style="color: #666;"><em>No artwork placement selected</em></p>';
  
  const artworkText = artworkPlacements.length > 0
    ? artworkPlacements.map(p => `• ${p}`).join('\n')
    : 'No artwork placement selected';
  
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
          .header { background: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
          .section { margin: 20px 0; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background: white; }
          .section-title { color: #000; font-size: 18px; margin-top: 0; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #f0f0f0; }
          .field { margin: 12px 0; padding: 8px 0; }
          .field-label { font-weight: bold; color: #555; display: inline-block; min-width: 140px; }
          .file-count {
            background: #4CAF50;
            color: white;
            padding: 3px 10px;
            border-radius: 12px;
            font-size: 12px;
            margin-left: 5px;
          }
          .customization-note {
            background: #e8f4fd;
            border-left: 4px solid #2196F3;
            padding: 12px 15px;
            margin: 15px 0;
            font-size: 14px;
            border-radius: 4px;
          }
          .option-group { margin: 10px 0; }
          .status-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
          }
          .status-selected { background: #d4edda; color: #155724; }
          .status-default { background: #f8f9fa; color: #6c757d; }
          .order-id {
            font-family: monospace;
            font-size: 18px;
            font-weight: bold;
            color: #000;
            background: #f8f9fa;
            padding: 5px 10px;
            border-radius: 4px;
            display: inline-block;
          }
          hr { border: none; border-top: 1px solid #e0e0e0; margin: 25px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2 style="margin: 0; color: #000;">🎨 New Customization Request</h2>
          <p style="margin: 10px 0; font-size: 16px;">
            <strong>Request ID:</strong> 
            <span class="order-id">#${orderId}</span>
          </p>
          <p style="margin: 5px 0;"><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
          <p style="margin: 5px 0;"><strong>Files Attached:</strong> <span class="file-count">${files.length}</span></p>
        </div>
        
        <div class="section">
          <h3 class="section-title">👤 Customer Information</h3>
          <div class="field">
            <span class="field-label">Name:</span> ${escapeHtml(fields.name || 'Not provided')}
          </div>
          <div class="field">
            <span class="field-label">Email:</span> <a href="mailto:${escapeHtml(fields.email || '')}">${escapeHtml(fields.email || 'Not provided')}</a>
          </div>
          <div class="field">
            <span class="field-label">Phone:</span> ${escapeHtml(fields.phone || 'Not provided')}
          </div>
        </div>
        
        <div class="section">
          <h3 class="section-title">🛍️ Product Details</h3>
          <div class="field">
            <span class="field-label">Product:</span> ${escapeHtml(fields.product_title || 'Not specified')}
          </div>
          <div class="field">
            <span class="field-label">Product ID:</span> ${escapeHtml(fields.product_id || 'Not specified')}
          </div>
          <div class="field">
            <span class="field-label">Product URL:</span> <a href="${escapeHtml(fields.product_url || '#')}">View Product</a>
          </div>
          ${fields.product_image ? `
          <div class="field">
            <span class="field-label">Product Image:</span> 
            <a href="${escapeHtml(fields.product_image)}">View Image</a>
          </div>
          ` : ''}
        </div>
        
        <!-- ✅ CUSTOMIZATION OPTIONS SECTION -->
        <div class="section">
          <h3 class="section-title">🎨 Customization Options</h3>
          
          <div class="option-group">
            <div class="field">
              <span class="field-label">Leather Color:</span>
              <span class="status-badge ${fields.custom_option_lc && fields.custom_option_lc !== 'none' ? 'status-selected' : 'status-default'}">
                ${getOptionText(fields.custom_option_lc, fields.custom_option_lc_other)}
              </span>
            </div>
          </div>
          
          <div class="option-group">
            <div class="field">
              <span class="field-label">Leather Type:</span>
              <span class="status-badge ${fields.custom_option_lt && fields.custom_option_lt !== 'none' ? 'status-selected' : 'status-default'}">
                ${getOptionText(fields.custom_option_lt, fields.custom_option_lt_other)}
              </span>
            </div>
          </div>
          
          <div class="option-group">
            <div class="field">
              <span class="field-label">Inner Lining:</span>
              <span class="status-badge ${fields.custom_option_il && fields.custom_option_il !== 'none' ? 'status-selected' : 'status-default'}">
                ${getOptionText(fields.custom_option_il, fields.custom_option_il_other)}
              </span>
            </div>
          </div>
          
          <div class="option-group">
            <div class="field">
              <span class="field-label">Hardware Color:</span>
              <span class="status-badge ${fields.custom_option_hc && fields.custom_option_hc !== 'none' ? 'status-selected' : 'status-default'}">
                ${getOptionText(fields.custom_option_hc, fields.custom_option_hc_other)}
              </span>
            </div>
          </div>
          
          <div class="option-group">
            <div class="field">
              <span class="field-label" style="vertical-align: top;">Artwork Placement:</span>
              <div style="display: inline-block;">
                ${artworkHtml}
              </div>
            </div>
          </div>
        </div>
        
        ${fields.description ? `
        <div class="section">
          <h3 class="section-title">📝 Customer Message</h3>
          <div style="padding: 15px; background: #f8f9fa; border-radius: 6px; border-left: 4px solid #6c757d;">
            ${escapeHtml(fields.description).replace(/\n/g, '<br>')}
          </div>
        </div>
        ` : ''}
        
        ${files.length > 0 ? `
        <div class="section">
          <h3 class="section-title">📎 Uploaded Files (${files.length} attached)</h3>
          <p>The following files are attached to this email:</p>
          ${fileListHtml}
          <div class="customization-note">
            <strong>ℹ️ Note:</strong> These files are attached to this email. You can download them directly from your email client.
          </div>
        </div>
        ` : ''}
        
        <hr>
        <div style="text-align: center; color: #666; font-size: 13px; padding: 15px;">
          <p style="margin: 5px 0;">
            <strong>Submitted via Marco Enzolani Customization Form</strong>
          </p>
          <p style="margin: 5px 0;">
            Request ID: <strong class="order-id" style="font-size: 14px;">#${orderId}</strong> | 
            Timestamp: ${new Date().toLocaleString()}
          </p>
          <p style="margin: 5px 0; font-size: 12px;">
            Product: ${escapeHtml(fields.product_title || 'N/A')}
          </p>
        </div>
      </body>
      </html>
    `,
    text: `
      =====================================
      🎨 NEW CUSTOMIZATION REQUEST
      =====================================
      
      REQUEST ID: #${orderId}
      TIMESTAMP: ${new Date().toLocaleString()}
      FILES: ${files.length} attached
      
      --------------------------------------------------
      👤 CUSTOMER INFORMATION
      --------------------------------------------------
      Name: ${fields.name || 'Not provided'}
      Email: ${fields.email || 'Not provided'}
      Phone: ${fields.phone || 'Not provided'}
      
      --------------------------------------------------
      🛍️ PRODUCT DETAILS
      --------------------------------------------------
      Product: ${fields.product_title || 'Not specified'}
      Product ID: ${fields.product_id || 'Not specified'}
      Product URL: ${fields.product_url || 'Not specified'}
      
      --------------------------------------------------
      🎨 CUSTOMIZATION OPTIONS
      --------------------------------------------------
      Leather Color: ${getOptionText(fields.custom_option_lc, fields.custom_option_lc_other)}
      Leather Type: ${getOptionText(fields.custom_option_lt, fields.custom_option_lt_other)}
      Inner Lining: ${getOptionText(fields.custom_option_il, fields.custom_option_il_other)}
      Hardware Color: ${getOptionText(fields.custom_option_hc, fields.custom_option_hc_other)}
      
      Artwork Placement:
      ${artworkText}
      
      ${fields.description ? `
      --------------------------------------------------
      📝 CUSTOMER MESSAGE
      --------------------------------------------------
      ${fields.description}
      ` : ''}
      
      ${files.length > 0 ? `
      --------------------------------------------------
      📎 UPLOADED FILES (${files.length} attached)
      --------------------------------------------------
      ${fileListText}
      
      Note: These files are attached to this email.
      ` : ''}
      
      =====================================
      SUBMISSION DETAILS
      =====================================
      Submitted via Marco Enzolani Customization Form
      Request ID: #${orderId}
      Timestamp: ${new Date().toLocaleString()}
      
      =====================================
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