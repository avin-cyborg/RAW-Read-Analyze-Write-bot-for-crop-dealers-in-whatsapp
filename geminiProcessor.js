// geminiProcessor.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

// Load environment variables
require('dotenv').config();

// Configure logging
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD, HH:mm:ss' }),
    winston.format.printf(
        info => `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message}`
    )
);

const logger = winston.createLogger({
    level: 'info',
    format: logFormat,
    transports: [
        new winston.transports.Console(),
        new DailyRotateFile({
            filename: 'logs/bot_activity-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d'
        })
    ]
});

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    logger.error('GEMINI_API_KEY not found in .env file.');
    throw new Error('GEMINI_API_KEY is not defined. Please set it in your .env file.');
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- CROP CATEGORIES AND STANDARDIZATION MAPPING ---
// This mapping helps Gemini standardize crop names and assign categories.
// Ensure these standardized names match your expectations for routing.
const CROP_CATEGORIES_AND_STANDARDIZATION = {
    "PULSES": {
        "CHANA DAL": ["CHANA", "CHANA DAL", "GRAM", "SENAGA PAPPU"],
        "TOOR DAL": ["TOOR", "TOOR DAL", "ARHAR", "TUR", "KANDI PAPPU", "KANDULU"],
        "URAD DAL": ["URAD", "URAD DAL", "MINUMULU", "MINAPAPPU"],
        "MOONG DAL": ["MOONG", "MOONG DAL", "MUNG", "MUNG DAL", "PESALU", "PESARA PAPPU"],
        "MASUR DAL": ["MASUR", "MASUR DAL"],
        "MATAR": ["MATAR", "MATAR DAL", "BATANI", "BATANI PAPPU"]
    },
    "SPICES": {
        "TURMERIC": ["TURMERIC", "HALDI"],
        "DHANIA": ["DHANIA", "CORIANDER"],
        "CHILLI": ["CHILLI", "CHILLY", "CHILI", "MIRCHI"],
        "JEERA": ["JEERA", "CUMIN"],
        "SAUNF": ["SAUNF", "FENNEL"],
        "METHI": ["METHI", "FENUGREEK"],
        "KALONJI": ["KALONJI", "BLACK CUMIN"],
        "AJWAIN": ["AJWAIN", "CAROM SEEDS"],
        "BLACK PEPPER": ["BLACK PEPPER", "KALI MIRCH"]
    },
    "OILS": {
        "COTTON OIL": ["COTTON", "COTTON OIL"],
        "COTTON KHAL": ["COTTON KHAL"],
        "RICE BRAN OIL": ["RICE BRAN", "RICE BRAN OIL"],
        "GN SEED OIL": ["GN SEED", "GROUNDNUT SEED", "GNUT SEED"],
        "GROUNDNUT OIL": ["GROUNDNUT", "GROUNDNUT OIL", "PALLI NUNE"],
        "SESAME OIL": ["SESAME", "SESAME OIL", "TIL OIL"],
        "CASTOR OIL": ["CASTOR", "CASTOR OIL"],
        "KANDLA OIL": ["KANDLA", "KANDLA OIL"],
        "SOYA OIL": ["SOYA", "SOYABEAN", "SOYA OIL"],
        "PALM OIL": ["PALM", "PALM OIL"],
        "VANASPATI GHEE": ["VANASPATI", "VANASPATI GHEE"],
        "MUSTARD OIL": ["MUSTARD", "MUSTARD OIL", "SARSON"],
        "ADANI WILMAR": ["ADANI WILMAR", "ADANI"],
    },
    "SUGAR": {
        "SUGAR": ["SUGAR", "CHINI"],
        "JAGGERY": ["JAGGERY", "GUD"]
    },
    "KIRANA": {
        "KIRANA": ["KIRANA", "GROCERY"]
    },
};

// Flatten the mapping for easy lookup by Gemini's prompt and local processing
const FLATTENED_CROP_MAPPING = {};
const STANDARDIZED_NAMES = new Set();
const CATEGORIES = new Set();

for (const category in CROP_CATEGORIES_AND_STANDARDIZATION) {
    CATEGORIES.add(category);
    for (const standardizedName in CROP_CATEGORIES_AND_STANDARDIZATION[category]) {
        STANDARDIZED_NAMES.add(standardizedName);
        for (const alias of CROP_CATEGORIES_AND_STANDARDIZATION[category][standardizedName]) {
            FLATTENED_CROP_MAPPING[alias.toUpperCase()] = { standardizedName, category };
        }
    }
}

// Convert sets to arrays for the prompt
const STANDARDIZED_NAMES_ARRAY = Array.from(STANDARDIZED_NAMES).join(', ');
const CATEGORIES_ARRAY = Array.from(CATEGORIES).join(', ');

// --- NEW: Fallback mapping for specific PULSES crop names in Telugu ---
// This ensures desired Telugu translations even if Gemini's isn't perfect.
const PULSES_TELUGU_FALLBACK_MAPPING = {
    "CHANA DAL": {
        desired: "సెనగ పప్పు",
        regex: /\b(CHANA\s*DAL|CHANA|GRAM|సెనగ దాల్|చెన దాల్|శనగ పప్పు)\b/gi
    },
    "TOOR DAL": {
        desired: "కంది పప్పు",
        regex: /\b(TOOR\s*DAL|TOOR|ARHAR|TUR|కంది దాల్|టూర్ దాల్)\b/gi
    },
    "URAD DAL": {
        desired: "మినపప్పు",
        regex: /\b(URAD\s*DAL|URAD|ఉరద్ దాల్)\b/gi
    },
    "MOONG DAL": {
        desired: "పెసర పప్పు",
        regex: /\b(MOONG\s*DAL|MOONG|MUNG|MUNG\s*DAL|మూంగ్ దాల్|ముంగ్ దాల్)\b/gi
    },
    "MASUR DAL": {
        desired: "మసూర్ పప్పు",
        regex: /\b(MASUR\s*DAL|MASUR|మసూర్ దాల్)\b/gi
    },
    "MATAR": {
        desired: "బటానీ పప్పు",
        regex: /\b(MATAR|MATAR\s*DAL|బటానీ|మటార్ దాల్)\b/gi
    }
};

/**
 * Extracts, standardizes, categorizes, and translates crop offers from a raw message using Gemini,
 * applying extensive formatting and filtering rules.
 *
 * @param {string} messageContent The raw message content from a seller group.
 * @param {string[]} targetLanguages An array of language codes (e.g., ['en', 'te']) for translation.
 * @returns {Promise<Object>} A promise that resolves to an object where keys are standardized crop names
 * and values are objects containing the standardized name, category, and formatted messages for each target language.
 * Example:
 * {
 * "MOONG DAL": {
 * "standardizedName": "MOONG DAL",
 * "category": "PULSES",
 * "en": "KEKRI\\nNEW MOONG DAL: 6800-7200 (-50)\\nARRIVAL: 750-900 BAG",
 * "te": "కేక్రి\\nకొత్త పెసర పప్పు: 6800-7200 (-50)\\nరాబడులు: 750-900 సంచులు"
 * },
 * "SUGAR": { ... }
 * }
 */
async function extractAndTranslateCropOffers(messageContent, targetLanguages = ['en']) {
    logger.info(`Attempting to process message with Gemini for extraction, standardization, categorization, and translation.`);

    // Helper function to apply common formatting rules
    const applyFormattingRules = (text) => {
        let formatted = text;

        // Rule: Remove lines with NA, NAD, NO SALES etc.
        formatted = formatted.split('\n')
            .filter(line => !/(NA|NAD|NO\s*SALE|NO\s*SALES|No\s*Sales|Not\s*Available|NO\s*RATE|NO\s*TRADING)/i.test(line))
            .join('\n');

        // Rule: Remove +0 and (+0)
        formatted = formatted.replace(/\s?\(\+0\)\s?/g, '').replace(/\s?\+0\s?/g, '');

        // Rule: (2 katta = 1 bag) i.e, half the quantity and replace "katta" with "bags"
        formatted = formatted.replace(/(\d+)\s*-\s*(\d+)\s*KATTA/gi, (match, p1, p2) => {
            const q1 = Math.ceil(parseInt(p1) / 2);
            const q2 = Math.floor(parseInt(p2) / 2);
            return `${q1}-${q2} BAG`;
        });
        formatted = formatted.replace(/(\d+)\s*KATTA/gi, (match, p1) => {
            const q1 = Math.ceil(parseInt(p1) / 2);
            return `${q1} BAG`;
        });

        // Rule: (1 quintal = 2 bags) i.e, double the quantity and replace "quintal(s)" with "bags"
        formatted = formatted.replace(/(\d+)\s*-\s*(\d+)\s*QUINTAL(?:S)?/gi, (match, p1, p2) => {
            const q1 = parseInt(p1) * 2;
            const q2 = parseInt(p2) * 2;
            return `${q1}-${q2} BAG`;
        });
        formatted = formatted.replace(/(\d+)\s*QUINTAL(?:S)?/gi, (match, p1) => {
            const q1 = parseInt(p1) * 2;
            return `${q1} BAG`;
        });

        // Rule: Remove mobile numbers and other personal/marketing info
        formatted = formatted.replace(/\b(?:\+?\d{1,3}[-.\s]?)?(\d{10})\b/g, ''); // Phone numbers (more robust)
        formatted = formatted.replace(/(?:CONTACT|CALL|DM|WHATSAPP|FOR DETAILS|TRIAL OFFER|INFORMATION IS INDICATIVE|AS AGGREGATED BY MARKET SOURCES|NAME\/CITY FOR FREE TRIAL|PULSES:|OILSEED:|SPICES:)\s*[:\d\s\-\/]*\S*/gi, ''); // Marketing/contact phrases
        formatted = formatted.replace(/\S*@\S*\.\S*/g, ''); // Email addresses

        // Rule: Format Market Names (e.g., "KEKRI MARKET" -> "KEKRI" on a new line)
        let lines = formatted.split('\n');
        formatted = lines.map(line => {
            const marketMatch = line.match(/^(\w+(?:\s+\w+)*?)\s+MARKET/i);
            if (marketMatch && marketMatch[1]) {
                return marketMatch[1].toUpperCase() + (line.substring(marketMatch[0].length).trim() ? '\n' + line.substring(marketMatch[0].length).trim() : '');
            }
            return line;
        }).join('\n');

        // Rule: Put proper line and character spacing and capitalize the message
        formatted = formatted.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0) // Remove empty lines after trimming
            .join('\n');

        // --- REMOVE ALL EMOJIS ---
        formatted = formatted.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FAD0}-\u{1FADF}\u{1FA70}-\u{1FA7F}\u{1FA80}-\u{1FA8F}\u{1FA90}-\u{1FA9F}\u{2B50}\u{2B06}\u{2934}\u{2935}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2500}-\u{25FF}\u{2B00}-\u{2BFF}\u{2B50}]/gu, '');
        formatted = formatted.replace(/👉/g, ''); // Explicitly remove specific arrow emoji

        // Capitalize the entire message for consistency, but after market name handling
        formatted = formatted.toUpperCase();

        return formatted;
    };

    const initialPrompt = `You are an expert market data analyst for agricultural commodities.
Analyze the following WhatsApp message containing crop market offers.
For each distinct crop offer, perform the following steps:

1.  Extraction: Identify the crop name, prices, arrival quantities, and any associated market/location details.
    **IMPORTANT**: For crops appearing with different quality/origin names (e.g., 'Sudan', 'Mozambique Gajri' for 'Tur'), or **different markets/locations** (e.g., "Sugar from Kekri Market", "Sugar from Tonk Market"), treat each quality/origin/market as a *distinct offer*. Ensure the quality/origin/market is captured and included in the \`extractedName\` field and subsequently reflected in the \`details\` for each language. For example, if the input says "Tur Sudan", your extractedName should be "Tur Sudan". If it's "Sugar from Kekri Market", your extractedName should be "Sugar Kekri Market".
2.  Standardization: Map the base crop name (e.g., "Tur" from "Tur Sudan") to one of the following standardized names: ${STANDARDIZED_NAMES_ARRAY}. If a crop doesn't match, try to infer the closest one or use a general category if unsure. The standardized name should *not* include the quality/origin/market.
3.  Categorization: Assign each standardized crop to one of these categories: ${CATEGORIES_ARRAY}.
4.  Initial Formatting (English):
    * Preserve all relevant numerical data (prices, quantities) and units (e.g., KATTA, QUINTAL).
    * Preserve place names (state, district, city, village, local areas in India) exactly as they are, without alteration.
    * Remove lines that explicitly state "NA", "NAD", "NO SALE", "NO TRADING", "NOT AVAILABLE", "NO RATE".
    * Remove "+0" or "(+0)" from price indications.
    * Convert KATTA to BAG: If "KATTA" is present, replace it with "BAG". Assume \`2 KATTA = 1 BAG\`. If a range, convert both numbers (e.g., "100-200 KATTA" becomes "50-100 BAG"). Round up for the lower bound and down for the upper bound if odd.
    * Convert QUINTAL to BAG: If "QUINTAL" or "QUINTALS" is present, replace it with "BAG". Assume \`1 QUINTAL = 2 BAGS\`. If a range, convert both numbers.
    * Remove all mobile numbers (10 digits), email addresses, and general marketing/contact phrases like "CONTACT", "CALL", "DM", "WHATSAPP", "FOR DETAILS", "TRIAL OFFER", "INFORMATION IS INDICATIVE", "AS AGGREGATED BY MARKET SOURCES", "NAME/CITY FOR FREE TRIAL", "PULSES:", "OILSEED:", "SPICES:".
    * Format Market Names: If a line ends with " MARKET" (e.g., "KEKRI MARKET"), capitalize the market name (e.g., "KEKRI") and ensure it's on its own line, followed by the remaining details on subsequent lines.
    * Ensure proper line and character spacing; remove empty lines.
    * Capitalize the entire formatted message for consistency.
    * Remove all emojis (e.g., "👉", "✅").
5.  Translation: Translate the final formatted English message into all specified target languages: ${targetLanguages.map(l => `'${l}'`).join(', ')}.

VERY IMPORTANT TRANSLATION RULE FOR TELUGU (if 'te' or 'Telugu' is a target language):
When translating the word 'ARRIVAL' into Telugu, you MUST use 'రాబడులు' (Raabaḍulu). Do NOT use 'రాక' (rāka) or any other word for ARRIVAL. This is a strict and critical requirement.
For PULSES, ensure the crop names are translated to their specific Telugu terms as follows:
- CHANA DAL: సెనగ పప్పు
- TOOR DAL: కంది పప్పు
- URAD DAL: మినపప్పు
- MOONG DAL: పెసర పప్పు
- MASUR DAL: మసూర్ పప్పు
- MATAR: బటానీ పప్పు

Output Format:
Provide the output as a JSON array of objects. The entire JSON must be enclosed in a single \`\`\`json block. Do not include any other text or characters outside of this block.
Each object should have:
- extractedName: The original crop name extracted from the message, including any quality/origin/market.
- standardizedName: The standardized base crop name (e.g., "TOOR DAL" for "Tur Sudan").
- category: The category of the crop (from the provided list).
- details: An object where keys are language codes (e.g., 'en', 'te') and values are the fully formatted and translated crop offer strings for that language.

Example Output Format:
\`\`\`json
[
  {
    "extractedName": "TUR SUDAN",
    "standardizedName": "TOOR DAL",
    "category": "PULSES",
    "details": {
      "en": "MUMBAI\\nTUR SUDAN: 6250-6300",
      "te": "ముంబై\\nటూర్ సూడాన్: 6250-6300"
    }
  },
  {
    "extractedName": "CHANA TANZANIA",
    "standardizedName": "CHANA DAL",
    "category": "PULSES",
    "details": {
      "en": "CHANA/KABULI\\nTANZANIA CHANA: 5750-5775",
      "te": "శనగ/కాబులి\\nటాంజానియా శనగ: 5750-5775"
    }
  },
  {
    "extractedName": "SUGAR KEKRI MARKET",
    "standardizedName": "SUGAR",
    "category": "SUGAR",
    "details": {
      "en": "KEKRI MARKET\\nSUGAR: 6800-7200\\nARRIVAL: 1500-1800 BAG",
      "te": "కేక్రి మార్కెట్\\nపంచదార: 6800-7200\\nరాబడులు: 1500-1800 సంచులు"
    }
  }
]
\`\`\`

WhatsApp Message to Process:
\`\`\`
${messageContent}
\`\`\`
`;

    let apiResponse;
    let extractedOffers = [];
    try {
        apiResponse = await model.generateContent(initialPrompt);

        let textResponse = '';
        if (apiResponse && apiResponse.response && apiResponse.response.candidates &&
            apiResponse.response.candidates.length > 0 &&
            apiResponse.response.candidates[0].content &&
            apiResponse.response.candidates[0].content.parts &&
            apiResponse.response.candidates[0].content.parts.length > 0 &&
            apiResponse.response.candidates[0].content.parts[0].text) {

            textResponse = apiResponse.response.candidates[0].content.parts[0].text;
            logger.info(`Gemini raw response (extracted): ${textResponse}`);
        } else {
            logger.error(`Gemini API response structure is invalid or missing expected text.`);
            logger.error(`Full Gemini response object: ${JSON.stringify(apiResponse)}`);
            return {};
        }

        try {
            const jsonMatch = textResponse.match(/```json\s*([\s\S]*?)\s*```/s);
            if (jsonMatch && jsonMatch[1]) {
                const jsonString = jsonMatch[1];
                extractedOffers = JSON.parse(jsonString);
            } else {
                logger.warn("Could not find ```json block in Gemini's response. Attempting to parse raw response directly.");
                extractedOffers = JSON.parse(textResponse);
            }

            if (!Array.isArray(extractedOffers)) {
                throw new Error("Gemini did not return a JSON array as expected.");
            }
        } catch (parseError) {
            logger.error(`Failed to parse Gemini's JSON response: ${parseError.message}. Raw text: ${textResponse}`);
            const lenientResult = parseLeniently(textResponse);
            if (lenientResult.length > 0) {
                extractedOffers = lenientResult.map(item => {
                    const baseCropName = item.extractedName.split(' ')[0].toUpperCase();
                    const mapping = FLATTENED_CROP_MAPPING[baseCropName];
                    const standardizedName = mapping ? mapping.standardizedName : item.extractedName.toUpperCase();
                    const category = mapping ? mapping.category : "UNKNOWN";

                    const formattedEnglish = applyFormattingRules(item.details.en);
                    const details = { en: formattedEnglish };

                    if (targetLanguages.includes('te')) {
                        details.te = `Translation not available in lenient mode. Original: ${formattedEnglish}`;
                    }

                    return {
                        extractedName: item.extractedName,
                        standardizedName: standardizedName,
                        category: category,
                        details: details
                    };
                });
                logger.warn("Successfully parsed with lenient fallback, but translation might be partial.");
            } else {
                logger.warn("Lenient parsing also yielded no results.");
                return {};
            }
        }

        const finalFormattedOffers = {};

        for (const cropOffer of extractedOffers) {
            let { extractedName, standardizedName, category, details } = cropOffer;

            if (!standardizedName || !category || !details || typeof details !== 'object' || Object.keys(details).length === 0) {
                logger.warn(`Skipping malformed crop offer from Gemini after initial parse: ${JSON.stringify(cropOffer)}`);
                continue;
            }

            standardizedName = standardizedName.toUpperCase();
            category = category.toUpperCase();

            if (details['te']) {
                logger.info(`Telugu translation BEFORE "రాక" replacement for ${standardizedName}: "${details['te'].substring(0, 50)}..."`);
                details['te'] = details['te'].replace(/రాక\s*[:\-–.]?/g, 'రాబడులు').trim();
                logger.info(`Telugu translation AFTER "రాక" replacement for ${standardizedName}: "${details['te'].substring(0, 50)}..."`);

                const currentStandardizedName = standardizedName.toUpperCase();
                if (PULSES_TELUGU_FALLBACK_MAPPING[currentStandardizedName]) {
                    const { desired: desiredTeluguName, regex: regexToReplace } = PULSES_TELUGU_FALLBACK_MAPPING[currentStandardizedName];

                    logger.info(`Telugu translation BEFORE crop name replacement (${currentStandardizedName}): "${details['te'].substring(0, 50)}..."`);
                    details['te'] = details['te'].replace(regexToReplace, desiredTeluguName);
                    logger.info(`Telugu translation AFTER crop name replacement (${currentStandardizedName}): "${details['te'].substring(0, 50)}..."`);
                }
            }

            finalFormattedOffers[extractedName.toUpperCase()] = {
                extractedName: extractedName,
                standardizedName: standardizedName,
                category: category,
                ...details
            };
        }

        logger.info(`Successfully processed message with Gemini. Final offers: ${JSON.stringify(finalFormattedOffers, null, 2)}`);
        return finalFormattedOffers;

    } catch (error) {
        logger.error(`An unexpected error occurred during Gemini processing: ${error.message}`);
        logger.error(`Gemini raw API response (if available): ${apiResponse ? JSON.stringify(apiResponse) : 'undefined'}`);
        return {};
    }
}

// Helper function for lenient parsing if Gemini doesn't return perfect JSON
function parseLeniently(text) {
    logger.warn("Attempting lenient parsing as strict JSON parsing failed.");
    const jsonObjects = [];
    let startIndex = 0;
    const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/s);
    const contentToParse = jsonBlockMatch && jsonBlockMatch[1] ? jsonBlockMatch[1] : text;

    try {
        while (startIndex < contentToParse.length) {
            const openBrace = contentToParse.indexOf('{', startIndex);
            if (openBrace === -1) break;

            let braceCount = 0;
            let endIndex = -1;
            for (let i = openBrace; i < contentToParse.length; i++) {
                if (contentToParse[i] === '{') {
                    braceCount++;
                } else if (contentToParse[i] === '}') {
                    braceCount--;
                }
                if (braceCount === 0 && i > openBrace) {
                    endIndex = i;
                    break;
                }
            }

            if (endIndex !== -1) {
                const potentialJson = contentToParse.substring(openBrace, endIndex + 1);
                try {
                    const parsedObject = JSON.parse(potentialJson);
                    // Filter for objects that look like crop offers
                    if (parsedObject.extractedName && parsedObject.standardizedName && parsedObject.category && parsedObject.details) {
                        jsonObjects.push(parsedObject);
                    }
                } catch (e) {
                    // Log for debugging but continue trying to find other objects
                    logger.debug(`Lenient parse failed for potential object: ${potentialJson.substring(0, 50)}... Error: ${e.message}`);
                }
                startIndex = endIndex + 1;
            } else {
                break;
            }
        }
        return jsonObjects;
    } catch (e) {
        logger.error(`Error during deep lenient parsing: ${e.message}`);
        return [];
    }
}

module.exports = {
    extractAndTranslateCropOffers
};