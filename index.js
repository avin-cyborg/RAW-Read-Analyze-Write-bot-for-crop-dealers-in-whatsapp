require('dotenv').config();
const fs = require('fs');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const nodemailer = require('nodemailer');
const { SELLER_GROUP_IDS, BUYER_GROUP_MAPPING, TARGET_LANGUAGES, ALL_UPDATES_GROUP_ID, POST_PROCESSING_REPLACEMENTS } = require('./config');
const { extractAndTranslateCropOffers } = require('./geminiProcessor');

const SESSION_DATA_PATH = './.wwebjs_auth';
const LOGS_DIR = './logs';
const LOG_FILE_PREFIX = 'bot_activity';
const MARKET_STATS_FILE = './market_stats.json';

let botAutomationEnabled = false;

// --- START: REINSTATED OILS HANDLING WITH CAREFUL CLEANING ---

// List of keywords to identify an OILS message.
// This list should still be comprehensive as it's the primary trigger for the bypass.
const OILS_ALIASES = [
    'COTTON OIL', 'COTTON KHAL', 'RICE BRAN OIL', 'GN SEED OIL', 'GROUNDNUT OIL',
    'SESAME OIL', 'CASTOR OIL', 'KANDLA OIL', 'SOYA OIL', 'PALM OIL', 'SOY',
    'VANASPATI OIL', 'MUSTARD OIL', 'ADANI WILMAR', 'COTTON', 'RICE BRAN', 'GN SEED', 
    'GROUNDNUT', 'COCONUT OIL', 'COCONUT', 'SESAME', 'CASTOR', 'KANDLA', 'PALM', 'VANASPATI', 'MUSTARD', 'ADANI', 'ADANI WILMAR', 'WILMAR', 
    'SF', 'SUN', 'TIL'
];

/**
 * Checks if a message body contains any of the oil-related keywords.
 * @param {string} rawText The raw message text.
 * @returns {boolean} True if it's an OILS message, otherwise false.
 */
function isOilsMessage(rawText) {
    const upperText = rawText.toUpperCase();
    return OILS_ALIASES.some(alias => upperText.includes(alias));
}

/**
 * CAREFULLY removes only marketing information, contact details, and emojis.
 * It DOES NOT attempt to remove market/location lines that contain relevant data.
 * @param {string} rawText The raw message text.
 * @returns {string} The cleaned message text.
 */
/**
 * CAREFULLY and THOROUGHLY removes marketing info, contact details, and ALL emojis.
 * It is designed to preserve the core commodity data while stripping away all noise.
 * @param {string} rawText The raw message text.
 * @returns {string} The cleaned message text.
 */
/**
 * Aggressively cleans OILS messages by removing entire lines that contain unwanted content.
 * It checks each line for marketing keywords, phone numbers, or emails and discards the line if a match is found.
 * @param {string} rawText The raw message text.
 * @returns {string} The cleaned message text with offending lines completely removed.
 */
/**
 * Intelligently cleans OILS messages. It aggressively removes lines with unwanted content,
 * BUT has a special exception for the top two lines to find and preserve crop names
 * that might be mixed with marketing text.
 * @param {string} rawText The raw message text.
 * @returns {string} The cleaned message text.
 */
/**
 * Intelligently and robustly cleans OILS messages. It inspects EVERY line for unwanted
 * content and acts accordingly, while still preserving crop names from headers.
 * @param {string} rawText The raw message text.
 * @returns {string} The cleaned message text.
 */
function stripUnwantedContentFromOilsMessage(rawText) {
    // --- START: DATA SETUP ---
    // This section contains all the necessary data and regular expressions for cleaning.

    // A comprehensive list of ALL known crop names from your project.
    // This is needed to find and rescue crop names from marketing headers.
   const ALL_CROP_ALIASES = [
        /*Pulses
        'TUR', 'ARHAR', 'CHANA', 'BENGAL GRAM', 'URAD', 'BLACK MATPE', 'MOONG', 'GREEN GRAM', 'MASUR', 'LENTIL', 'MATAR', 'PEAS', 'KABULI', 'CHICKPEAS',
        // Spices
        'CHILLI', 'TURMERIC', 'CORIANDER', 'CUMIN', 'FENUGREEK', 'TAMARIND',*/
        // Oils (from your previous OILS_ALIASES list)
        'COTTON OIL', 'COTTON KHAL', 'RICE BRAN OIL', 'GN SEED OIL', 'GROUNDNUT OIL', 'GROUNDNUT SEED', 'SESAME OIL', 'CASTOR OIL', 'KANDLA OIL', 'SOYA OIL', 'PALM OIL', 'VANASPATI OIL', 'MUSTARD OIL', 'ADANI WILMAR',
        'COTTON', 'RICE BRAN', 'GN SEED', 'GROUNDNUT', 'COCONUT OIL', 'COCONUT', 'SESAME', 'CASTOR', 'KANDLA', 'PALM', 'VANASPATI', 'MUSTARD', 'ADANI', 'ADANI WILMAR', 'WILMAR', 'SF'
    ];

    // Keywords that trigger line inspection/deletion.
    const forbiddenKeywords = [
        'BULLETIN', 'MARKET', 'TRADERS', 'INDIA', 'NEWS', 'AGRI', 'CONTACT', 'CALL', 'DM', 'WHATSAPP', 'DETAILS', 'TRIAL', 'OFFER', 'INDICATIVE', 'AGGREGATED', 'SOURCES', 'SERVICE', 'PULSES:', 'OIL/OILSEED:', 'SPICES:', 'SOURCE:', 'REF:', 'RATES', 'UPDATE', 'TODAY', 'बाजार', 'JAGRUTHI', 'NAIDU'
    ];

    // The robust regular expressions for finding unwanted content.
    const phoneRegex = /\b(?:(?:\(\+?91\)|\+91)[\s-]?)?\d{10}\b/g;
    const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
    const comprehensiveEmojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F004}-\u{1F0CF}\u{1F200}-\u{1F251}\u{2300}-\u{23FF}\u{2B50}]/gu;
    const hindiRegex = /[\u0900-\u097F]/g;

    const originalLines = rawText.split('\n');
    const finalLines = [];
    let extractedCropName = null;
    // --- END: DATA SETUP ---

    // --- START: UNIFIED PROCESSING LOOP ---
    // This single loop processes every line from the message.
    for (const [index, line] of originalLines.entries()) {
        const upperLine = line.toUpperCase();
        
        // 1. Check for phone numbers or emails first. This is a hard fail for any line.
        // If found, the line is skipped immediately. This is the strict check you requested.
        if (phoneRegex.test(line) || emailRegex.test(line)) {
            continue; // Skip this line completely, regardless of its position.
        }

        // 2. Check for marketing keywords.
        const hasForbiddenKeyword = forbiddenKeywords.some(keyword => upperLine.includes(keyword));
        if (hasForbiddenKeyword) {
            // It's a marketing line. Let's see if we can rescue a crop name.
            // This check is now restricted to the top two lines using `index < 2`.
            if (index < 2 && !extractedCropName) {
                // Search from longest crop name to shortest to avoid partial matches
                const sortedCrops = [...ALL_CROP_ALIASES].sort((a, b) => b.length - a.length);
                for (const crop of sortedCrops) {
                    if (upperLine.includes(crop)) {
                        extractedCropName = crop; // Found and rescued the crop name.
                        break;
                    }
                }
            }
            // In any case, we discard the marketing line itself.
            continue;
        }

        // 3. If the line has survived all checks, it's a clean line.
        // We remove any remaining emojis and add it to our final output.
        const cleanedLine = line.replace(comprehensiveEmojiRegex, '').replace(hindiRegex, '').trim();
        if (cleanedLine) {
            finalLines.push(cleanedLine);
        }
    }
    // --- END: UNIFIED PROCESSING LOOP ---

    // --- START: FINAL ASSEMBLY ---
    // If we rescued a crop name from the header, we add it to the top of the message.
    if (extractedCropName) {
        finalLines.unshift(extractedCropName);
    }

    // Join the cleaned lines back into a single string.
    return finalLines.join('\n');
    // --- END: FINAL ASSEMBLY ---
}
// --- END: REINSTATED OILS HANDLING WITH CAREFUL CLEANING ---
// index1.js

// --- START: NEW HELPER FUNCTION ---
/**
 * Applies a series of find-and-replace operations based on the config.
 * @param {string} text The text to process.
 * @param {string} lang The language code ('en' or 'te').
 * @returns {string} The processed text.
 */
function applyPostProcessingReplacements(text, lang) {
    if (!text || !POST_PROCESSING_REPLACEMENTS[lang]) {
        return text;
    }

    let processedText = text;
    const replacements = POST_PROCESSING_REPLACEMENTS[lang];

    for (const wordToFind in replacements) {
        const wordToReplace = replacements[wordToFind];
        // Use a RegExp to replace all occurrences, case-insensitively.
        const regex = new RegExp(wordToFind, 'gi');
        processedText = processedText.replace(regex, wordToReplace);
    }

    return processedText;
}
// --- END: NEW HELPER FUNCTION ---










// Configure Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});
const emailTo = process.env.EMAIL_TO;
if (!emailTo) {
  console.warn('EMAIL_TO not found in .env. Email notifications will be disabled.');
}

if (!fs.existsSync(SESSION_DATA_PATH)) {
  fs.mkdirSync(SESSION_DATA_PATH, { recursive: true });
}
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const logFormat = winston.format.printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level.toUpperCase()}]: ${message}`;
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'DD-MM-YYYY, HH:mm:ss' }),
    logFormat
  ),
  transports: [
    new winston.transports.Console(),
    new DailyRotateFile({
      filename: `${LOG_FILE_PREFIX}-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      dirname: LOGS_DIR
    })
  ],
});

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_DATA_PATH }),
  puppeteer: {
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--start-maximized'
    ]
  }
});

client.on('qr', (qr) => {
  logger.info('QR Code received. Scan with WhatsApp Linked Devices.');
  qrcode.generate(qr, { small: true });
  io.emit('qr', qr);
});

client.on('ready', async () => {
  logger.info('✅ WhatsApp Bot is ready!');
  io.emit('ready', { status: 'Bot is ready!' });
  try {
    const chats = await client.getChats();
    logger.info('Listing all WhatsApp groups:');
    chats.forEach(chat => {
      if (chat.isGroup) {
        logger.info(`- NAME: "${chat.name}" | ID: "${chat.id._serialized}"`);
      }
    });
  } catch (err) {
    logger.error(`Error retrieving chats: ${err.message}`);
  }
});

client.on('auth_failure', msg => {
  logger.warn('❌ Authentication failed, please re-scan QR. Msg: ' + msg);
  io.emit('auth_failure', { message: 'Authentication failed! Please re-scan QR.' });
});

client.on('disconnected', reason => {
  logger.warn('🔴 WhatsApp Client disconnected. Reason: ' + reason);
  io.emit('disconnected', { reason });
});

async function sendErrorEmail(originalMessage, errorMessage, logReport) {
  if (!emailTo) {
    logger.warn('Email recipient not configured. Skipping error email.');
    return;
  }
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: emailTo,
    subject: 'WhatsApp Bot Error Report',
    html: `
      <p>Failed to process a seller message and send to buyer groups.</p>
      <strong>Original Message:</strong><br>
      <pre>${originalMessage}</pre>
      <strong>Error:</strong><br>
      <pre>${errorMessage}</pre>
      <strong>Recent Logs:</strong><br>
      <pre>${logReport}</pre>
      `
  };
  try {
    await transporter.sendMail(mailOptions);
    logger.info('✅ Sent error report email.');
  } catch (err) {
    logger.error('❌ Failed to send error report email: ' + err.message);
  }
}

const MAX_RETRIES = 3;
const INITIAL_DELAY = 1000;
async function processMessageWithRetries(messageContent, targetLanguages) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const processedOffers = await extractAndTranslateCropOffers(messageContent, targetLanguages);
      if (
        !processedOffers ||
        typeof processedOffers !== 'object' ||
        Object.keys(processedOffers).length === 0
      ) {
        throw new Error('Gemini returned no or invalid crop offers.');
      }
      return processedOffers;
    } catch (err) {
      logger.error(`Gemini error on attempt ${attempt + 1}: ${err.message}`);
      const delay = INITIAL_DELAY * (2 ** attempt);
      logger.warn(`Retrying Gemini in ${delay / 1000} seconds...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Gemini failed after all retries.');
}

client.on('message', async (msg) => {
  logger.info(`[RAW MESSAGE] From: ${msg.from}, IsGroup: ${msg.isGroup}, Body: ${msg.body.substring(0, 100)}...`);
  const isActuallyGroup = msg.isGroup === true || (typeof msg.isGroup === 'undefined' && msg.from.endsWith('@g.us'));
  if (!botAutomationEnabled || !isActuallyGroup || !SELLER_GROUP_IDS.includes(msg.from)) {
    if (isActuallyGroup && SELLER_GROUP_IDS.includes(msg.from) && !botAutomationEnabled) {
      const chat = await msg.getChat();
      logger.info(`Automation OFF: Skipped message from seller group "${chat.name}".`);
    } else if (!isActuallyGroup) {
      const contact = await msg.getContact();
      logger.info(`DM from ${contact.pushname || contact.name}, skipped.`);
    } else {
      const chat = await msg.getChat();
      logger.info(`Skipped message from non-seller group "${chat.name}" (${msg.from}).`);
    }
    return;
  }
  logger.info(`Processing message from seller group ${msg.from}`);
  io.emit('status', { message: `Processing message from seller group ${msg.from}` });
  // --- START: REINSTATED OILS BYPASS LOGIC ---

// Check if the message is for the OILS category
if (isOilsMessage(msg.body)) {
    logger.info('OILS message detected. Bypassing Gemini and using simplified formatting.');
    io.emit('status', { message: 'OILS message detected. Formatting simply...' });

    // 1. Clean the message by carefully removing only unwanted content
    const cleanedMessageBody = stripUnwantedContentFromOilsMessage(msg.body);

    // 2. Append the standard broker information
    const brokerInfoText = 'A MARKET LOOKS\n\n*NO CASH ONLY GPAY, PHONEPE, UPI TO : 6300486156*';
    const finalMessage = cleanedMessageBody + '\n\n' + brokerInfoText;

    try {
        // Safety check: Only send if there's actual content after cleaning.
        if (cleanedMessageBody.trim().length === 0) {
            logger.warn('⚠️ OILS message was empty after cleaning. Skipping sending.');
            io.emit('status', { message: '⚠️ OILS message empty after cleaning. Skipped.' });
        } else {
            const oilGroups = BUYER_GROUP_MAPPING['OILS'];

            // Send to OILS buyer groups (English and Telugu)
            if (oilGroups) {
                if (oilGroups.en) {
                    await client.sendMessage(oilGroups.en, finalMessage);
                    logger.info(`✅ Sent simplified OILS message to English buyer group: ${oilGroups.en}`);
                }
                if (oilGroups.te) {
                    await client.sendMessage(oilGroups.te, finalMessage);
                    logger.info(`✅ Sent simplified OILS message to Telugu buyer group: ${oilGroups.te}`);
                }
            }

            // Send to the "All Updates" group
            if (ALL_UPDATES_GROUP_ID) {
                await client.sendMessage(ALL_UPDATES_GROUP_ID, finalMessage);
                logger.info(`✅ Sent simplified OILS message to the All Updates group: ${ALL_UPDATES_GROUP_ID}`);
            }
        }

    } catch (err) {
        logger.error(`❌ Failed to send simplified OILS message: ${err.message}`);
        io.emit('status', { message: `❌ Error sending OILS message: ${err.message}` });
    }

    // IMPORTANT: Stop further processing for this message
    return;
}

// --- END: REINSTATED OILS BYPASS LOGIC ---


  try {
    const chat = await msg.getChat();
    logger.info(`Received message in seller group "${chat.name}": "${msg.body}"`);
    // Process message with Gemini with retry logic
    let processedOffers = {};
    try {
      processedOffers = await processMessageWithRetries(msg.body, TARGET_LANGUAGES);
    } catch (geminiError) {
      logger.error(`Gemini processing failed: ${geminiError.message}`);
      io.emit('status', { message: `❌ Gemini processing failed: ${geminiError.message}` });
      let logReportContent = '';
      try {
        logReportContent = readLatestLogTail(200);
      } catch (readErr) {
        logReportContent = `Error reading logs: ${readErr.message}`;
      }
      await sendErrorEmail(msg.body, geminiError.message, logReportContent);
      return;
    }
    logger.info('Gemini processing complete.');
    logger.info(`Processed Offers: ${JSON.stringify(processedOffers, null, 2)}`);
    if (processedOffers && typeof processedOffers === 'object' && Object.keys(processedOffers).length > 0) {
      logger.info('Preparing to send summaries to buyer groups.');
      const groupedMessages = { en: {}, te: {} };
      const allUpdatesContent = { en: [], te: [] };
      // Group messages by category and language
      for (const extractedName in processedOffers) {
        const offer = processedOffers[extractedName];
        const category = offer.category;
        if (category && BUYER_GROUP_MAPPING[category]) {
          if (!groupedMessages.en[category]) {
            groupedMessages.en[category] = [];
          }
          if (!groupedMessages.te[category]) {
            groupedMessages.te[category] = [];
          }
          // NEW, IMPROVED CODE
          if (offer.en) {
            const finalEnglishText = applyPostProcessingReplacements(offer.en, 'en');
            groupedMessages.en[category].push(finalEnglishText);
        }
        if (offer.te) {
    // This replaces your previous hardcoded "రాక" replacement logic.
          const finalTeluguText = applyPostProcessingReplacements(offer.te, 'te');
          groupedMessages.te[category].push(finalTeluguText);
        }

        } else {
          logger.warn(`No buyer group mapping for category "${category}", offer "${offer.standardizedName}" (original: ${extractedName})`);
        }
      }
      // Broker company info to append
      const brokerInfoLines = [
        'A MARKET LOOKS',
        '*NO CASH ONLY GPAY, PHONEPE, UPI TO : 6300486156*'
      ];
      const brokerInfoText = brokerInfoLines.join('\n\n');
      // Send grouped messages to buyer groups (English & Telugu)
      for (const category in groupedMessages.en) {
        // ===== ONLY CHANGE MADE: separator removed =====
        const englishConsolidatedMessage = groupedMessages.en[category].join('\n') + '\n\n' + brokerInfoText;
        const teluguConsolidatedMessage  = groupedMessages.te[category].join('\n') + '\n\n' + brokerInfoText;
        // ==============================================
        const categoryGroups = BUYER_GROUP_MAPPING[category];
        // English message
        if (englishConsolidatedMessage && categoryGroups && categoryGroups.en) {
          const buyerGroupId = categoryGroups.en;
          try {
            const buyerChat = await client.getChatById(buyerGroupId);
            if (buyerChat && buyerChat.isGroup) {
              if (englishConsolidatedMessage.trim().length > 0) {
                await client.sendMessage(buyerGroupId, englishConsolidatedMessage);
                logger.info(`✅Sent English message for category "${category}" to group "${buyerChat.name}"`);
                io.emit('status', { message: `Sent English message for category "${category}" to group "${buyerChat.name}".` });
                allUpdatesContent.en.push(`--- ${category.toUpperCase()} (ENGLISH) ---\n${englishConsolidatedMessage}`);
              } else {
                logger.warn(`Empty English message for category "${category}", skipping.`);
              }
            } else {
              logger.warn(`Buyer group ID for category "${category}" (English) invalid or not a group: ${buyerGroupId}`);
            }
          } catch (sendErr) {
            logger.error(`Error sending English message for "${category}": ${sendErr.message}`);
          }
        }
        // Telugu message
        if (teluguConsolidatedMessage && categoryGroups && categoryGroups.te) {
          const buyerGroupId = categoryGroups.te;
          try {
            const buyerChat = await client.getChatById(buyerGroupId);
            if (buyerChat && buyerChat.isGroup) {
              if (teluguConsolidatedMessage.trim().length > 0) {
                await client.sendMessage(buyerGroupId, teluguConsolidatedMessage);
                logger.info(`✅Sent Telugu message for category "${category}" to group "${buyerChat.name}"`);
                io.emit('status', { message: `Sent Telugu message for category "${category}" to group "${buyerChat.name}".` });
                allUpdatesContent.te.push(`--- ${category.toUpperCase()} (TELUGU) ---\n${teluguConsolidatedMessage}`);
              } else {
                logger.warn(`Empty Telugu message for category "${category}", skipping.`);
              }
            } else {
              logger.warn(`Buyer group ID for category "${category}" (Telugu) invalid or not a group: ${buyerGroupId}`);
            }
          } catch (sendErr) {
            logger.error(`Error sending Telugu message for "${category}": ${sendErr.message}`);
          }
        }
      }
      // Send combined summary to All Updates group if configured
      if (ALL_UPDATES_GROUP_ID) {
        try {
          const allUpdatesChat = await client.getChatById(ALL_UPDATES_GROUP_ID);
          if (allUpdatesChat && allUpdatesChat.isGroup) {
            const combinedEnglish = allUpdatesContent.en.join('\n');
            if (combinedEnglish.trim().length > 0) {
              await client.sendMessage(ALL_UPDATES_GROUP_ID, `${combinedEnglish}`);
              logger.info('✅Sent combined English updates to All Updates group.');
              io.emit('status', { message: 'Sent combined English updates to All Updates group.' });
            } else {
              logger.warn('Empty combined English updates for All Updates group. Skipped sending.');
            }
            const combinedTelugu = allUpdatesContent.te.join('\n');
            if (combinedTelugu.trim().length > 0) {
              await client.sendMessage(ALL_UPDATES_GROUP_ID, `${combinedTelugu}`);
              logger.info('✅Sent combined Telugu updates to All Updates group.');
              io.emit('status', { message: 'Sent combined Telugu updates to All Updates group.' });
            } else {
              logger.warn('Empty combined Telugu updates for All Updates group. Skipped sending.');
            }
          } else {
            logger.warn('All Updates group ID invalid or not a group.');
            io.emit('status', { message: '⚠️ All Updates group ID invalid or non-existing.' });
          }
        } catch (err) {
          logger.error('Error sending to All Updates group: ' + err.message);
          io.emit('status', { message: '❌ Failed to send to All Updates group.' });
        }
      } else {
        logger.warn('All Updates group ID not configured, skipped sending combined update.');
      }
    } else {
      logger.warn('No valid processed offers received from Gemini.');
      io.emit('status', { message: '⚠️ No valid offers from Gemini. Skipping forwarding.' });
    }
  } catch (err) {
    logger.error(`Error processing message from ${msg.from}: ${err.message}`);
    io.emit('status', { message: `❌ Error processing message: ${err.message}` });
    let logReportContent = '';
    try {
      logReportContent = readLatestLogTail(200);
    } catch (readErr) {
      logReportContent = `Error reading logs: ${readErr.message}... `;
    }
    await sendErrorEmail(msg.body, err.message, logReportContent);
  }
});

function saveMarketStats(stats) {
  let currentStats = {};
  if (fs.existsSync(MARKET_STATS_FILE)) {
    try {
      currentStats = JSON.parse(fs.readFileSync(MARKET_STATS_FILE, 'utf8'));
    } catch (e) {
      logger.error(`Error parsing market stats file: ${e.message}`);
      currentStats = {};
    }
  }
  if (Array.isArray(stats)) {
    stats.forEach(s => {
      const key = `${s.crop || 'unknown'}-${s.date || 'unknown'}-${s.sourceGroup || 'unknown'}`;
      currentStats[key] = s;
    });
  } else if (typeof stats === 'object' && stats !== null) {
    const key = `${stats.crop || 'unknown'}-${stats.date || 'unknown'}-${stats.sourceGroup || 'unknown'}`;
    currentStats[key] = stats;
  }
  try {
    fs.writeFileSync(MARKET_STATS_FILE, JSON.stringify(currentStats, null, 2));
    logger.info('Market statistics saved successfully.');
  } catch (e) {
    logger.error(`Error writing market stats file: ${e.message}`);
  }
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

io.on('connection', (socket) => {
  logger.info('Web UI connected.');
  socket.emit('automation_status', botAutomationEnabled);
  socket.on('toggle_automation', (status) => {
    botAutomationEnabled = status;
    logger.info(`Bot automation turned ${botAutomationEnabled ? 'ON' : 'OFF'} via web UI.`);
    io.emit('automation_status', botAutomationEnabled);
  });
  socket.on('disconnect', () => {
    logger.info('Web UI disconnected.');
  });
});

server.listen(PORT, () => {
  logger.info(`Web server running on http://localhost:${PORT}`);
  io.emit('status', { message: `Web server running on http://localhost:${PORT}` });
});

client.initialize();

// Helper to get last N lines from latest log file
function readLatestLogTail(lines = 200) {
  try {
    const logFiles = fs.readdirSync(LOGS_DIR)
      .filter(file => file.startsWith(LOG_FILE_PREFIX) && file.endsWith('.log'))
      .sort()
      .reverse();
    if (logFiles.length === 0) return 'No log files found.';
    const latestLogPath = `${LOGS_DIR}/${logFiles[0]}`;
    const logContent = fs.readFileSync(latestLogPath, 'utf8');
    const logLines = logContent.trim().split('\n');
    const tailLines = logLines.slice(-lines);
    return tailLines.join('\n');
  } catch (err) {
    return `Error reading tail of log file: ${err.message}`;
  }
}
