// index.js

const fs = require('fs');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
require('dotenv').config(); // Load environment variables from .env file

// --- Configuration ---
// Import configuration from config.js
// IMPORTANT: Now also importing ALL_UPDATES_GROUP_ID
const { SELLER_GROUP_IDS, BUYER_GROUP_MAPPING, TARGET_LANGUAGES, ALL_UPDATES_GROUP_ID } = require('./config');

// Import Gemini processing module
const { extractAndTranslateCropOffers } = require('./geminiProcessor');

// --- File Paths and Directories ---
const SESSION_DATA_PATH = './.wwebjs_auth';
const LOGS_DIR = './logs';
const LOG_FILE_PREFIX = 'bot_activity';
const MARKET_STATS_FILE = './market_stats.json'; // File to store market statistics

// --- Global Automation Toggle ---
let botAutomationEnabled = false; // Automation is OFF by default

// --- Ensure necessary directories exist ---
if (!fs.existsSync(SESSION_DATA_PATH)) {
    fs.mkdirSync(SESSION_DATA_PATH, { recursive: true });
}
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// --- Logger Setup ---
const logFormat = winston.format.printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
});

const logger = winston.createLogger({
    level: 'info', // Log level: info, debug, warn, error
    format: winston.format.combine(
        winston.format.timestamp({ format: 'DD-MM-YYYY, HH:mm:ss' }),
        logFormat
    ),
    transports: [
        new winston.transports.Console(), // Log to console
        new DailyRotateFile({
            filename: `${LOG_FILE_PREFIX}-%DATE%.log`,
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
            dirname: LOGS_DIR
        }) // Log to daily rotating file
    ],
});

// --- WhatsApp Client Initialization ---
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: SESSION_DATA_PATH }),
    puppeteer: {
        headless: false, // Set to true for production, false for debugging
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--start-maximized'
        ]
    }
});

// --- WhatsApp Client Event Listeners ---
client.on('qr', (qr) => {
    logger.info('QR Code received. Scan with WhatsApp Linked Devices.');
    qrcode.generate(qr, { small: true }); // Generate and display QR code in terminal
    io.emit('qr', qr); // Emit QR code to web UI
});

client.on('ready', async () => {
    logger.info('✅ WhatsApp Bot is ready!');
    io.emit('ready', { status: 'Bot is ready!' }); // Emit ready status to web UI

    // Attempt to retrieve chats and list group IDs for debugging/verification
    try {
        const chats = await client.getChats();
        logger.info('Attempting to retrieve chats and list group IDs...');
        chats.forEach(chat => {
            if (chat.isGroup) {
                logger.info(`- NAME: "${chat.name}" | ID: "${chat.id._serialized}"`);
            }
        });
    } catch (error) {
        logger.error(`Error retrieving chats: ${error.message}`);
    }
});

client.on('auth_failure', msg => {
    logger.warn('❌ Authentication failure! Please re-scan QR. Message: ' + msg);
    io.emit('auth_failure', { message: 'Authentication failure! Please re-scan QR.' });
});

client.on('disconnected', reason => {
    logger.warn('🔴 WhatsApp Client disconnected! Reason: ' + reason);
    io.emit('disconnected', { reason: reason });
});

// --- WhatsApp Client Message Handler ---
client.on('message', async (msg) => {
    logger.info(`[RAW MESSAGE] From: ${msg.from}, IsGroup: ${msg.isGroup}, Body: ${msg.body.substring(0, 100)}...`);

    // Determine if it's actually a group message, accounting for msg.isGroup being undefined
    const isActuallyGroup = msg.isGroup === true || (typeof msg.isGroup === 'undefined' && msg.from.endsWith('@g.us'));

    // Skip messages if automation is off, or if it's not a group message, or not from a seller group
    if (!botAutomationEnabled || !isActuallyGroup || !SELLER_GROUP_IDS.includes(msg.from)) {
        if (isActuallyGroup && SELLER_GROUP_IDS.includes(msg.from) && !botAutomationEnabled) {
            // Log that a message from a seller group was received but automation is OFF.
            const chat = await msg.getChat();
            logger.info(`Received message from seller group "${chat.name}", but automation is OFF. Message content: ${msg.body.substring(0, 50)}...`);
        } else if (!isActuallyGroup) { // Covers direct messages (DMs)
            // Log for direct messages
            const contact = await msg.getContact();
            logger.info(`Received direct message from ${contact.pushname || contact.name}: ${msg.body.substring(0, 50)}... (skipped - not from seller group)`);
        } else if (isActuallyGroup && !SELLER_GROUP_IDS.includes(msg.from)) {
            // Log specifically for group messages that are NOT seller groups
            const chat = await msg.getChat();
            logger.info(`Received message from NON-SELLER group "${chat.name}" (${msg.from}). Content: ${msg.body.substring(0, 50)}... (skipped)`);
        }
        return; // Exit the function if conditions are not met
    }

    // --- Message from a Seller Group (Automation ON) ---
    logger.info(`Processing message from seller group ${msg.from}`);
    io.emit('status', { message: `Processing message from seller group ${msg.from}` });

    try {
        const chat = await msg.getChat();
        const sellerGroupName = chat.name;
        logger.info(`Received message in seller group "${sellerGroupName}" (${msg.from}): "${msg.body}"`);

        // Process message with Gemini
        const processedOffers = await extractAndTranslateCropOffers(msg.body, TARGET_LANGUAGES);
        logger.info('Gemini processing complete.');
        logger.info(`Processed Offers from Gemini: ${JSON.stringify(processedOffers, null, 2)}`);


        // Check if processedOffers is a non-empty object
        if (processedOffers && typeof processedOffers === 'object' && Object.keys(processedOffers).length > 0) {
            logger.info('Attempting to send summaries to buyer groups.');

            // --- NEW: Grouping logic starts here ---
            const groupedMessages = {
                en: {}, // Stores arrays of English messages, grouped by category (e.g., "PULSES": ["msg1", "msg2"])
                te: {}  // Stores arrays of Telugu messages
            };

            // Initialize an array to hold all content for the "All Updates" group
            const allUpdatesContent = {
                en: [],
                te: []
            };

            // First pass: Populate groupedMessages
            for (const extractedName in processedOffers) {
                const offer = processedOffers[extractedName];
                const category = offer.category; // e.g., "PULSES", "SUGAR"

                if (category && BUYER_GROUP_MAPPING[category]) { // Only process if category has a mapping
                    // Ensure arrays exist for this category and language
                    if (!groupedMessages.en[category]) {
                        groupedMessages.en[category] = [];
                        groupedMessages.te[category] = [];
                    }

                    // Add the English and Telugu details to their respective category arrays
                    // Access offer.en and offer.te directly, not offer.details.en/te
                    if (offer.en) {
                        groupedMessages.en[category].push(offer.en);
                    }
                    if (offer.te) {
                        groupedMessages.te[category].push(offer.te);
                    }
                } else {
                    logger.warn(`No category mapping found for standardized crop "${offer.standardizedName}" (original: ${extractedName}). This offer will not be grouped into specific buyer groups.`);
                }
            }

            // Second pass: Consolidate and Send messages to specific buyer groups
            for (const category in groupedMessages.en) { // Iterate through categories that have offers
                // Updated separator
                const englishConsolidatedMessage = groupedMessages.en[category].join('\n\n-----------------\n\n');
                // Updated separator for Telugu
                const teluguConsolidatedMessage = groupedMessages.te[category].join('\n\n-----------------\n\n'); 

                const categoryGroups = BUYER_GROUP_MAPPING[category];

                // Send English consolidated message
                if (englishConsolidatedMessage && categoryGroups && categoryGroups.en) {
                    const buyerGroupId = categoryGroups.en;
                    try {
                        const buyerChat = await client.getChatById(buyerGroupId);
                        if (buyerChat && buyerChat.isGroup) {
                            // --- ADDED CHECK HERE ---
                            if (englishConsolidatedMessage.trim().length > 0) { 
                                await client.sendMessage(buyerGroupId, englishConsolidatedMessage);
                                logger.info(`✅ Sent consolidated English message for category "${category}" to group "${buyerChat.name}" (${buyerGroupId}).`);
                                io.emit('status', { message: `✅ Sent consolidated English message for category "${category}" to group "${buyerChat.name}".` });
                                allUpdatesContent.en.push(`--- ${category.toUpperCase()} (ENGLISH) ---\n${englishConsolidatedMessage}`); // Add to all updates content
                            } else {
                                logger.warn(`Skipping empty English message for category "${category}" for group "${buyerChat.name}" (${buyerGroupId}).`);
                            }
                            // --- END ADDED CHECK ---
                        } else {
                            logger.warn(`Buyer group ID for Category: ${category}, English (${buyerGroupId}) is not a valid group or does not exist.`);
                        }
                    } catch (sendError) {
                        logger.error(`Error sending consolidated English message for category ${category}: ${sendError.message}`);
                    }
                }

                // Send Telugu consolidated message
                if (teluguConsolidatedMessage && categoryGroups && categoryGroups.te) {
                    const buyerGroupId = categoryGroups.te;
                    try {
                        const buyerChat = await client.getChatById(buyerGroupId);
                        if (buyerChat && buyerChat.isGroup) {
                            // --- ADDED CHECK HERE ---
                            if (teluguConsolidatedMessage.trim().length > 0) {
                                await client.sendMessage(buyerGroupId, teluguConsolidatedMessage);
                                logger.info(`✅ Sent consolidated Telugu message for category "${category}" to group "${buyerChat.name}" (${buyerGroupId}).`);
                                io.emit('status', { message: `✅ Sent consolidated Telugu message for category "${category}" to group "${buyerChat.name}".` });
                                allUpdatesContent.te.push(`--- ${category.toUpperCase()} (TELUGU) ---\n${teluguConsolidatedMessage}`); // Add to all updates content
                            } else {
                                logger.warn(`Skipping empty Telugu message for category "${category}" for group "${buyerChat.name}" (${buyerGroupId}).`);
                            }
                            // --- END ADDED CHECK ---
                        } else {
                            logger.warn(`Buyer group ID for Category: ${category}, Telugu (${buyerGroupId}) is not a valid group or does not exist.`);
                        }
                    } catch (sendError) {
                        logger.error(`Error sending consolidated Telugu message for category ${category}: ${sendError.message}`);
                    }
                }
            }

            // Third pass: Send to "All Updates" group
            if (ALL_UPDATES_GROUP_ID) {
                try {
                    const allUpdatesChat = await client.getChatById(ALL_UPDATES_GROUP_ID);
                    if (allUpdatesChat && allUpdatesChat.isGroup) {
                        // Consolidate all English messages for "All Updates"
                        const finalAllUpdatesEnglish = allUpdatesContent.en.join('\n\n===== CATEGORY SEPARATOR =====\n\n');
                        if (finalAllUpdatesEnglish.trim().length > 0) {
                            await client.sendMessage(ALL_UPDATES_GROUP_ID, `*** ALL MARKET UPDATES (ENGLISH) ***\n\n${finalAllUpdatesEnglish}`);
                            logger.info(`✅ Sent combined English updates to "All Updates" group (${ALL_UPDATES_GROUP_ID}).`);
                            io.emit('status', { message: `✅ Sent combined English updates to "All Updates" group.` });
                        } else { // Added else for allUpdatesContent.en
                             logger.warn(`Skipping empty combined English updates for "All Updates" group (${ALL_UPDATES_GROUP_ID}).`);
                        }

                        // Consolidate all Telugu messages for "All Updates" (if applicable)
                        const finalAllUpdatesTelugu = allUpdatesContent.te.join('\n\n===== కేటగిరీ సెపరేటర్ =====\n\n'); // Telugu separator
                        if (finalAllUpdatesTelugu.trim().length > 0) {
                             await client.sendMessage(ALL_UPDATES_GROUP_ID, `*** అన్ని మార్కెట్ అప్‌డేట్‌లు (తెలుగు) ***\n\n${finalAllUpdatesTelugu}`);
                             logger.info(`✅ Sent combined Telugu updates to "All Updates" group (${ALL_UPDATES_GROUP_ID}).`);
                             io.emit('status', { message: `✅ Sent combined Telugu updates to "All Updates" group.` });
                        } else { // Added else for allUpdatesContent.te
                             logger.warn(`Skipping empty combined Telugu updates for "All Updates" group (${ALL_UPDATES_GROUP_ID}).`);
                        }

                    } else {
                        logger.warn(`"All Updates" group ID (${ALL_UPDATES_GROUP_ID}) is not a valid group or does not exist.`);
                        io.emit('status', { message: `⚠️ "All Updates" group ID is invalid or non-existent.` });
                    }
                } catch (allUpdatesError) {
                    logger.error(`Error sending to "All Updates" group: ${allUpdatesError.message}`);
                    io.emit('status', { message: `❌ Error sending to "All Updates" group.` });
                }
            } else {
                logger.warn(`"All Updates" group ID is not configured. Skipping "All Updates" forwarding.`);
            }

            // --- End of NEW Grouping logic ---

        } else {
            logger.warn('Gemini did not return valid crop offers. Skipping buyer group forwarding.');
            io.emit('status', { message: '⚠️ Gemini could not process the offer or found no offers. Skipping forwarding.' });
        }

    } catch (error) {
        logger.error(`Error processing message from ${msg.from}: ${error.message}`);
        io.emit('status', { message: `❌ Error processing message: ${error.message}` });
        // Optionally send an error message back to the seller group
        // client.sendMessage(msg.from, `Sorry, I encountered an error processing your request: ${error.message}`);
    }
});

// --- Market Statistics Functions (moved to bottom for better readability in this structure) ---
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

    // Merge new stats into existing ones
    // This example simply appends or updates based on a key (e.g., crop-date-location)
    // You might want to make this more sophisticated to store a history.
    // For simplicity, let's assume `stats` might be an array or single object.
    // Adjust this logic based on how `marketStats` is structured by Gemini.
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

// --- Web Server for Automation Toggle ---
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

app.use(express.static('public')); // Serve static files from 'public' directory

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

io.on('connection', (socket) => {
    logger.info('Web UI connected.');
    socket.emit('automation_status', botAutomationEnabled); // Send current status on connection

    socket.on('toggle_automation', (status) => {
        botAutomationEnabled = status;
        logger.info(`Bot automation turned ${botAutomationEnabled ? 'ON' : 'OFF'} via web UI.`);
        io.emit('automation_status', botAutomationEnabled); // Broadcast new status to all connected clients
    });

    socket.on('disconnect', () => {
        logger.info('Web UI disconnected.');
    });
});

server.listen(PORT, () => {
    logger.info(`Web server running on http://localhost:${PORT}`);
    io.emit('status', { message: `Web server running on http://localhost:${PORT}` });
});

// --- Initialize the WhatsApp client ---
client.initialize();