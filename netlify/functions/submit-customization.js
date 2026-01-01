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
    
    // Prepare email contents for both admin and user
    const adminEmailContent = prepareAdminEmailContent(fields, files, orderId);
    const userEmailContent = prepareUserEmailContent(fields, files, orderId);
    
    // Send email to admin WITH attachments
    await sendGmail(adminEmailContent, files, true);
    
    // Send confirmation email to user WITHOUT attachments
    if (fields.email) {
      await sendGmail(userEmailContent, [], false);
      console.log(`✅ Confirmation email sent to user: ${fields.email}`);
    } else {
      console.log('⚠️ No user email provided, skipping confirmation email');
    }
    
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
        files_received: files.length,
        confirmation_sent: !!fields.email
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

// Generate numeric-only order ID (6-digit random number)
function generateNumericOrderId() {
  // Generate 6-digit random number (100000 to 999999)
  const min = 100000;
  const max = 999999;
  const randomNum = Math.floor(Math.random() * (max - min + 1)) + min;
  
  // Add timestamp for more uniqueness (optional)
  const timestamp = Date.now() % 100000; // Last 5 digits of timestamp
  const finalId = (randomNum + timestamp) % 1000000; // Ensure 6 digits
  
  // Ensure it's 6 digits with leading zeros if needed
  return String(finalId).padStart(6, '0');
}


// Send email via Gmail
async function sendGmail(emailContent, files, includeAttachments = false) {
  // Create transporter using Gmail
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: CONFIG.GMAIL_USER,
      pass: CONFIG.GMAIL_APP_PASSWORD
    }
  });
  
  // Prepare attachments if needed
  const attachments = includeAttachments 
    ? files.map(file => ({
        filename: file.filename,
        content: file.content,
        contentType: file.mimeType || 'application/octet-stream',
        encoding: 'base64'
      }))
    : [];
  
  console.log(`📧 Preparing to send ${includeAttachments ? 'admin' : 'user'} email with ${attachments.length} attachments`);
  
  // Email options
  const mailOptions = {
    from: {
      name: 'Marcoenzolani Customize Product Form',
      address: CONFIG.GMAIL_USER
    },
    to: emailContent.to,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
    attachments: attachments
  };
  
  // Add replyTo for admin email
  if (emailContent.replyTo) {
    mailOptions.replyTo = emailContent.replyTo;
  }
  
  // Send email
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ ${includeAttachments ? 'Admin' : 'User confirmation'} email sent successfully to ${emailContent.to}!`);
    console.log('📎 Message ID:', info.messageId);
    
    return info;
  } catch (error) {
    console.error(`❌ Failed to send ${includeAttachments ? 'admin' : 'user'} email:`, error);
    throw error;
  }
}

// Helper: Get option display text
function getOptionText(optionValue, otherValue, defaultValue = 'No Change') {
  if (!optionValue || optionValue === 'none') return defaultValue;
  if (optionValue === 'other' && otherValue) return `Other: ${escapeHtml(otherValue)}`;
  return escapeHtml(optionValue.charAt(0).toUpperCase() + optionValue.slice(1));
}

// Prepare admin email content
function prepareAdminEmailContent(fields, files, orderId) {
  // Filter only files that have actual content (not empty)
  const validFiles = files.filter(file => file.size > 0 && file.filename);
  
  console.log(`📊 Valid files: ${validFiles.length} out of ${files.length} total`);
  
  // Only show files that were actually uploaded
  const fileListHtml = validFiles.map(file => `
    <div style="margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 4px;">
      <strong>${file.fieldName}:</strong> ${escapeHtml(file.filename)}<br>
      <small>Size: ${(file.size / 1024).toFixed(2)} KB</small>
    </div>
  `).join('');
  
  const fileListText = validFiles.map(file => 
    `• ${file.fieldName}: ${file.filename} (${(file.size / 1024).toFixed(2)} KB)`
  ).join('\n');
  
  // Get artwork placement list (only show if checkbox is checked AND file is uploaded)
  const artworkPlacements = [];
  
  // Check each artwork placement
  const artworkMappings = [
    { field: 'artwork_left_chest', fileField: 'co_left_chest_image', label: 'Left Chest' },
    { field: 'artwork_right_chest', fileField: 'co_right_chest_image', label: 'Right Chest' },
    { field: 'artwork_left_arm', fileField: 'co_left_arm_image', label: 'Left Arm' },
    { field: 'artwork_right_arm', fileField: 'co_right_arm_image', label: 'Right Arm' },
    { field: 'artwork_back', fileField: 'co_back_img_image', label: 'Back' },
    { field: 'artwork_other', fileField: 'co_other_img_image', label: 'Other Location' }
  ];
  
  artworkMappings.forEach(mapping => {
    const hasFile = validFiles.some(file => file.fieldName === mapping.fileField);
    if (fields[mapping.field] === 'yes' && hasFile) {
      artworkPlacements.push(mapping.label);
    }
  });
  
  const artworkHtml = artworkPlacements.length > 0 
    ? `<ul style="margin: 5px 0 0 20px;">
        ${artworkPlacements.map(placement => `<li>${placement}</li>`).join('')}
       </ul>`
    : '<p style="color: #666;"><em>No artwork files uploaded</em></p>';
  
  const artworkText = artworkPlacements.length > 0
    ? artworkPlacements.map(p => `• ${p}`).join('\n')
    : 'No artwork files uploaded';
  
  return {
    to: CONFIG.NOTIFICATION_EMAIL || CONFIG.GMAIL_USER,
    replyTo: fields.email || CONFIG.GMAIL_USER,
    subject: `🚨 Customization Request #${orderId}: ${fields.product_title || 'Marcoenzolani Customize This Product'}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; }
          .header { background: #fff3f3; padding: 20px; border-radius: 5px; margin-bottom: 20px; border-left: 4px solid #dc3545; }
          .section { margin: 20px 0; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background: white; }
          .section-title { color: #000; font-size: 18px; margin-top: 0; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #f0f0f0; }
          .field { margin: 12px 0; padding: 8px 0; }
          .field-label { font-weight: bold; color: #555; display: inline-block; min-width: 140px; }
          .file-count {
            background: ${validFiles.length > 0 ? '#4CAF50' : '#6c757d'};
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
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 500;
          }
          .status-selected { background: #d4edda; color: #155724; }
          .status-default { background: #f8f9fa; color: #6c757d; }
          .status-other { background: #fff3cd; color: #856404; }
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
          .do-not-reply {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #6c757d;
            margin: 20px 0;
            font-size: 14px;
            color: #666;
          }
          .admin-alert {
            background: #fff3f3;
            border: 1px solid #f5c6cb;
            border-radius: 6px;
            padding: 15px;
            margin: 15px 0;
            font-size: 14px;
            color: #721c24;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h2 style="margin: 0; color: #000;">🚨 NEW CUSTOMIZATION REQUEST - ACTION REQUIRED</h2>
          <p style="margin: 10px 0; font-size: 16px;">
            <strong>Request ID:</strong> 
            <span class="order-id">#${orderId}</span>
          </p>
          <p style="margin: 5px 0;"><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
          <p style="margin: 5px 0;">
            <strong>Files Attached:</strong> 
            <span class="file-count">${validFiles.length} / ${files.length}</span>
          </p>
          <div class="admin-alert">
            <strong>⚠️ ADMIN ACTION REQUIRED:</strong> 
            Please review this customization request and contact the customer within 24 hours.
          </div>
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
            <span class="field-label">Product URL:</span> <a href="${escapeHtml(fields.product_url || '#')}">${escapeHtml(fields.product_url || 'Not specified')}</a>
          </div>
          ${fields.product_image ? `
          <div class="field">
            <span class="field-label">Product Image:</span> 
            <a href="${escapeHtml(fields.product_image)}">View Image</a>
          </div>
          ` : ''}
        </div>
        
        <!-- CUSTOMIZATION OPTIONS SECTION -->
        <div class="section">
          <h3 class="section-title">🎨 Customization Options</h3>
          
          <div class="option-group">
            <div class="field">
              <span class="field-label">Leather Color:</span>
              ${(() => {
                const value = fields.custom_option_lc;
                const other = fields.custom_option_lc_other;
                let badgeClass = 'status-default';
                let displayText = 'No Change';
                
                if (value && value !== 'none') {
                  badgeClass = value === 'other' ? 'status-other' : 'status-selected';
                  displayText = value === 'other' && other ? 
                    `Other: ${escapeHtml(other)}` : 
                    escapeHtml(value.charAt(0).toUpperCase() + value.slice(1));
                }
                
                return `<span class="status-badge ${badgeClass}">${displayText}</span>`;
              })()}
            </div>
          </div>
          
          <div class="option-group">
            <div class="field">
              <span class="field-label">Leather Type:</span>
              ${(() => {
                const value = fields.custom_option_lt;
                const other = fields.custom_option_lt_other;
                let badgeClass = 'status-default';
                let displayText = 'No Change';
                
                if (value && value !== 'none') {
                  badgeClass = value === 'other' ? 'status-other' : 'status-selected';
                  displayText = value === 'other' && other ? 
                    `Other: ${escapeHtml(other)}` : 
                    escapeHtml(value.charAt(0).toUpperCase() + value.slice(1));
                }
                
                return `<span class="status-badge ${badgeClass}">${displayText}</span>`;
              })()}
            </div>
          </div>
          
          <div class="option-group">
            <div class="field">
              <span class="field-label">Inner Lining:</span>
              ${(() => {
                const value = fields.custom_option_il;
                const other = fields.custom_option_il_other;
                let badgeClass = 'status-default';
                let displayText = 'No Change';
                
                if (value && value !== 'none') {
                  badgeClass = value === 'other' ? 'status-other' : 'status-selected';
                  displayText = value === 'other' && other ? 
                    `Other: ${escapeHtml(other)}` : 
                    escapeHtml(value.charAt(0).toUpperCase() + value.slice(1));
                }
                
                return `<span class="status-badge ${badgeClass}">${displayText}</span>`;
              })()}
            </div>
          </div>
          
          <div class="option-group">
            <div class="field">
              <span class="field-label">Hardware Color:</span>
              ${(() => {
                const value = fields.custom_option_hc;
                const other = fields.custom_option_hc_other;
                let badgeClass = 'status-default';
                let displayText = 'No Change';
                
                if (value && value !== 'none') {
                  badgeClass = value === 'other' ? 'status-other' : 'status-selected';
                  displayText = value === 'other' && other ? 
                    `Other: ${escapeHtml(other)}` : 
                    escapeHtml(value.charAt(0).toUpperCase() + value.slice(1));
                }
                
                return `<span class="status-badge ${badgeClass}">${displayText}</span>`;
              })()}
            </div>
          </div>
          
          <div class="option-group">
            <div class="field">
              <span class="field-label" style="vertical-align: top;">Artwork Placement:</span>
              <div style="display: inline-block;">
                ${artworkHtml}
                ${artworkPlacements.length === 0 ? 
                  '<p style="font-size: 12px; color: #666; margin-top: 5px;">No files uploaded for artwork</p>' : 
                  ''
                }
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
        
        ${validFiles.length > 0 ? `
        <div class="section">
          <h3 class="section-title">📎 Uploaded Files (${validFiles.length} attached)</h3>
          <p>The following files were uploaded and are attached to this email:</p>
          ${fileListHtml}
          <div class="customization-note">
            <strong>ℹ️ Note:</strong> Only files with actual content are shown above and attached to this email.
          </div>
        </div>
        ` : `
        <div class="section">
          <h3 class="section-title">📎 Uploaded Files</h3>
          <p style="color: #666; font-style: italic;">No files were uploaded with this request.</p>
        </div>
        `}
        
        <div class="do-not-reply">
          <strong>📧 IMPORTANT:</strong> This email was sent to <strong>${CONFIG.NOTIFICATION_EMAIL || CONFIG.GMAIL_USER}</strong> only.<br>
          <strong>DO NOT REPLY TO THIS EMAIL.</strong> Instead, reply to the customer's email directly at: 
          ${fields.email ? `<a href="mailto:${escapeHtml(fields.email)}">${escapeHtml(fields.email)}</a>` : 'No customer email provided'}
        </div>
        
        <hr>
        <div style="text-align: center; color: #666; font-size: 13px; padding: 15px;">
          <p style="margin: 5px 0;">
            <strong>Submitted via Marcoenzolani Customize This Product Form</strong>
          </p>
          <p style="margin: 5px 0;">
            Request ID: <strong class="order-id" style="font-size: 14px;">#${orderId}</strong> | 
            Timestamp: ${new Date().toLocaleString()}
          </p>
          <p style="margin: 5px 0; font-size: 12px;">
            Product: ${escapeHtml(fields.product_title || 'N/A')}
          </p>
          <p style="margin: 5px 0; font-size: 11px; color: #999;">
            Files: ${validFiles.length} uploaded, ${files.length - validFiles.length} empty filtered
          </p>
        </div>
      </body>
      </html>
    `,
    text: `
      =====================================
      🚨 NEW CUSTOMIZATION REQUEST - ACTION REQUIRED
      =====================================
      
      REQUEST ID: #${orderId}
      TIMESTAMP: ${new Date().toLocaleString()}
      FILES: ${validFiles.length} uploaded (${files.length - validFiles.length} empty filtered)
      
      ⚠️ ADMIN ACTION REQUIRED: 
      Please review this customization request and contact the customer within 24 hours.
      
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
      
      ${validFiles.length > 0 ? `
      --------------------------------------------------
      📎 UPLOADED FILES (${validFiles.length} attached)
      --------------------------------------------------
      ${fileListText}
      
      Note: Only files with actual content are attached to this email.
      ` : `
      --------------------------------------------------
      📎 UPLOADED FILES
      --------------------------------------------------
      No files were uploaded with this request.
      `}
      
      =====================================
      📧 IMPORTANT EMAIL INFORMATION
      =====================================
      DO NOT REPLY TO THIS EMAIL.
      This email was sent to ${CONFIG.NOTIFICATION_EMAIL || CONFIG.GMAIL_USER} only.
      
      Reply to the customer directly at: ${fields.email || 'No customer email provided'}
      
      =====================================
      SUBMISSION DETAILS
      =====================================
      Submitted via Marcoenzolani Customize This Product Form
      Request ID: #${orderId}
      Timestamp: ${new Date().toLocaleString()}
      Files: ${validFiles.length} uploaded
      
      =====================================
    `
  };
}

// Prepare user confirmation email content
function prepareUserEmailContent(fields, files, orderId) {
  const validFiles = files.filter(file => file.size > 0 && file.filename);
  
  return {
    to: fields.email,
    subject: `✅ Customization Request Confirmation #${orderId} - Marcoenzolani`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
          .header { background: #f0f9ff; padding: 30px; text-align: center; border-radius: 10px; margin-bottom: 30px; }
          .content { padding: 20px; }
          .section { margin: 25px 0; padding: 20px; border-radius: 8px; background: #ffffff; border: 1px solid #e1e8ed; }
          .section-title { color: #2c3e50; font-size: 20px; margin-top: 0; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #f0f0f0; }
          .field { margin: 15px 0; padding: 10px 0; }
          .field-label { font-weight: bold; color: #555; display: inline-block; min-width: 160px; }
          .order-id {
            font-family: monospace;
            font-size: 24px;
            font-weight: bold;
            color: #2c3e50;
            background: #f8f9fa;
            padding: 10px 20px;
            border-radius: 8px;
            display: inline-block;
            margin: 10px 0;
          }
          .thank-you { 
            background: #e8f5e9; 
            padding: 25px; 
            border-radius: 10px; 
            text-align: center;
            margin: 30px 0;
            border-left: 4px solid #4CAF50;
          }
          .next-steps { 
            background: #fff3e0; 
            padding: 25px; 
            border-radius: 10px; 
            margin: 30px 0;
            border-left: 4px solid #FF9800;
          }
          .contact-info { 
            background: #e3f2fd; 
            padding: 25px; 
            border-radius: 10px; 
            margin: 30px 0;
            border-left: 4px solid #2196F3;
          }
          .footer { 
            text-align: center; 
            padding: 25px; 
            color: #666; 
            font-size: 14px;
            border-top: 1px solid #e0e0e0;
            margin-top: 40px;
          }
          .status-badge {
            display: inline-block;
            padding: 6px 15px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 500;
            background: #4CAF50;
            color: white;
          }
          .logo { max-width: 200px; margin: 0 auto 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 style="color: #2c3e50; margin-bottom: 10px;">Thank You, ${escapeHtml(fields.name || 'Valued Customer')}!</h1>
          <p style="color: #666; font-size: 18px;">Your customization request has been received successfully.</p>
          <div class="order-id">#${orderId}</div>
        </div>
        
        <div class="content">
          <div class="thank-you">
            <h2 style="color: #2c3e50; margin-top: 0;">🎉 Request Submitted Successfully!</h2>
            <p style="font-size: 16px; line-height: 1.6;">
              Thank you for choosing Marcoenzolani for your customization needs. 
              We've received your request and our team will review it shortly.
            </p>
          </div>
          
          <div class="section">
            <h3 class="section-title">📋 Request Summary</h3>
            <div class="field">
              <span class="field-label">Request ID:</span> #${orderId}
            </div>
            <div class="field">
              <span class="field-label">Date & Time:</span> ${new Date().toLocaleString()}
            </div>
            <div class="field">
              <span class="field-label">Status:</span> <span class="status-badge">Submitted</span>
            </div>
            <div class="field">
              <span class="field-label">Product:</span> ${escapeHtml(fields.product_title || 'Custom Product')}
            </div>
            <div class="field">
              <span class="field-label">Files Uploaded:</span> ${validFiles.length} file(s)
            </div>
          </div>
          
          <div class="section">
            <h3 class="section-title">🎨 Your Customization Choices</h3>
            <div class="field">
              <span class="field-label">Leather Color:</span> ${getOptionText(fields.custom_option_lc, fields.custom_option_lc_other)}
            </div>
            <div class="field">
              <span class="field-label">Leather Type:</span> ${getOptionText(fields.custom_option_lt, fields.custom_option_lt_other)}
            </div>
            <div class="field">
              <span class="field-label">Inner Lining:</span> ${getOptionText(fields.custom_option_il, fields.custom_option_il_other)}
            </div>
            <div class="field">
              <span class="field-label">Hardware Color:</span> ${getOptionText(fields.custom_option_hc, fields.custom_option_hc_other)}
            </div>
            ${fields.description ? `
            <div class="field">
              <span class="field-label">Additional Notes:</span> ${escapeHtml(fields.description)}
            </div>
            ` : ''}
          </div>
          
          <div class="next-steps">
            <h3 class="section-title">📅 What Happens Next?</h3>
            <ol style="line-height: 1.8; padding-left: 20px;">
              <li><strong>Review:</strong> Our team will review your customization request within 24 hours.</li>
              <li><strong>Confirmation:</strong> We'll contact you to confirm the details and discuss any specifics.</li>
              <li><strong>Pricing & Timeline:</strong> You'll receive a detailed quote and production timeline.</li>
              <li><strong>Production:</strong> Once approved, our artisans will begin crafting your unique piece.</li>
            </ol>
          </div>
          
          <div class="contact-info">
            <h3 class="section-title">📞 Need to Update Your Request?</h3>
            <p style="margin: 15px 0;">
              If you need to make any changes to your request or have additional questions, 
              please contact us using your Request ID: <strong>#${orderId}</strong>
            </p>
            <p style="margin: 15px 0;">
              <strong>Email:</strong> mrafay.developer@gmail.com<br>
              <strong>Phone:</strong> [Your Business Phone Number]
            </p>
          </div>
        </div>
        
        <div class="footer">
          <p style="margin: 5px 0;">
            <strong>Marcoenzolani Customize Product Form</strong>
          </p>
          <p style="margin: 5px 0; font-size: 12px; color: #999;">
            Request ID: #${orderId} | Submitted: ${new Date().toLocaleString()}
          </p>
          <p style="margin: 20px 0 0; font-size: 11px; color: #999;">
            This is an automated confirmation email. Please do not reply to this message.
          </p>
        </div>
      </body>
      </html>
    `,
    text: `
      =============================================
      ✅ CUSTOMIZATION REQUEST CONFIRMATION
      =============================================
      
      Thank you for your customization request with Marcoenzolani!
      
      REQUEST DETAILS:
      -----------------
      Request ID: #${orderId}
      Date & Time: ${new Date().toLocaleString()}
      Status: Submitted
      Product: ${fields.product_title || 'Custom Product'}
      Files Uploaded: ${validFiles.length}
      
      YOUR CUSTOMIZATION CHOICES:
      ---------------------------
      Leather Color: ${getOptionText(fields.custom_option_lc, fields.custom_option_lc_other)}
      Leather Type: ${getOptionText(fields.custom_option_lt, fields.custom_option_lt_other)}
      Inner Lining: ${getOptionText(fields.custom_option_il, fields.custom_option_il_other)}
      Hardware Color: ${getOptionText(fields.custom_option_hc, fields.custom_option_hc_other)}
      
      ${fields.description ? `
      Additional Notes:
      ${fields.description}
      ` : ''}
      
      WHAT HAPPENS NEXT?
      ------------------
      1. Review: Our team will review your request within 24 hours
      2. Confirmation: We'll contact you to confirm details
      3. Pricing & Timeline: You'll receive a detailed quote
      4. Production: Our artisans will craft your unique piece
      
      NEED TO UPDATE YOUR REQUEST?
      ----------------------------
      Please contact us using your Request ID: #${orderId}
      
      Email: mrafay.developer@gmail.com
      
      =============================================
      THANK YOU FOR CHOOSING Marcoenzolani
      =============================================
      
      Request ID: #${orderId}
      Submitted: ${new Date().toLocaleString()}
      
      This is an automated confirmation email. Please do not reply.
      =============================================
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