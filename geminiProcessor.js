// geminiProcessor.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
require('dotenv').config();

/* --- START: NEW API KEY MANAGEMENT ---
// Load all API keys from the .env file
const API_KEYS_STRING = process.env.GEMINI_API_KEYS;
if (!API_KEYS_STRING) {
throw new Error('GEMINI_API_KEYS not found in .env file. Please provide a comma-separated list of keys.');
}
const API_KEYS = API_KEYS_STRING.split(',').map(key => key.trim());
let currentApiKeyIndex = 0; // This will track which key we are currently using.
logger.info(`[API Management] Loaded ${API_KEYS.length} API keys.`);
// --- END: NEW API KEY MANAGEMENT ---*/

// Configure logging
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD, HH:mm:ss' }),
    winston.format.printf(info => `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message}`)
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

// --- CORRECTED API KEY MANAGEMENT ---
// This block loads all your keys from the .env file and prepares for rotation.
const API_KEYS_STRING = process.env.GEMINI_API_KEYS;
if (!API_KEYS_STRING) {
    throw new Error('GEMINI_API_KEYS not found in .env file. Please provide a comma-separated list of keys.');
}
const API_KEYS = API_KEYS_STRING.split(',').map(key => key.trim());
let currentApiKeyIndex = 0; // This variable will track which key we are currently using.
logger.info(`[API Management] Loaded ${API_KEYS.length} API keys successfully.`);
// --- END OF API KEY MANAGEMENT CORRECTION ---

// --- CROP CATEGORIES AND STANDARDIZATION MAPPING ---
// This entire section is preserved exactly as it was in your file.
const CROP_CATEGORIES_AND_STANDARDIZATION = {
    "PULSES": {
        "CHANA DAL": ["CHANA DAL", "SHENAGA PAPPU"],
        "CHANA": ["CHANA", "SHENAGALU"],
        "TOOR DAL": ["TOOR DAL", "TUR DAL", "KANDI PAPPU"],
        "TUR": ["TOOR", "ARHAR", "TUR", "KANDULU"],
        "URAD": ["URAD", "MINUMULU"],
        "MOONG": ["MOONG", "MUNG", "PESALU"],
        "URAD DAL": ["URAD DAL", "MINAPAPPU"],
        "MUNG DAL": ["MOONG DAL", "MUNG DAL", "PESARA PAPPU"],
        "MASUR DAL": ["MASUR", "MASUR DAL"],
        "MATAR": ["MATAR", "BATANI"],
        "MATAR DAL": ["MATAR DAL", "BATANI PAPPU"]
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
        "VANASPATI OIL": ["VANASPATI", "VANASPATI GHEE"],
        "MUSTARD OIL": ["MUSTARD", "MUSTARD OIL", "SARSON"],
        "ADANI WILMAR": ["ADANI WILMAR", "ADANI"]
    },
    "SUGAR": {
        "SUGAR": ["SUGAR", "CHINI"],
        "JAGGERY": ["JAGGERY", "GUD"]
    },
    "KIRANA": {
        "KIRANA": ["KIRANA", "GROCERY"]
    }
};

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
const STANDARDIZED_NAMES_ARRAY = Array.from(STANDARDIZED_NAMES).join(', ');
const CATEGORIES_ARRAY = Array.from(CATEGORIES).join(', ');

// This function is defined outside the main processing function as it was in your file.
function parseLeniently(text) {
    logger.warn("Attempting lenient parsing as strict JSON parsing failed.");
    const jsonObjects = [];
    let startIndex = 0;
    const jsonBlockMatch = text.match(/``````/);
    const contentToParse = jsonBlockMatch && jsonBlockMatch[1] ? jsonBlockMatch[1] : text;
    try {
        while (startIndex < contentToParse.length) {
            const openBrace = contentToParse.indexOf('{', startIndex);
            if (openBrace === -1) break;
            let braceCount = 0;
            let endIndex = -1;
            for (let i = openBrace; i < contentToParse.length; i++) {
                if (contentToParse[i] === '{') braceCount++;
                else if (contentToParse[i] === '}') braceCount--;
                if (braceCount === 0 && i > openBrace) {
                    endIndex = i;
                    break;
                }
            }
            if (endIndex !== -1) {
                const potentialJson = contentToParse.substring(openBrace, endIndex + 1);
                try {
                    const parsedObject = JSON.parse(potentialJson);
                    if (parsedObject.extractedName && parsedObject.standardizedName && parsedObject.category && parsedObject.details) {
                        jsonObjects.push(parsedObject);
                    }
                } catch (e) {
                    // Ignore parse error, continue
                }
                startIndex = endIndex + 1;
            } else {
                break;
            }
        }
        return jsonObjects;
    } catch (e) {
        logger.error(`Error during lenient JSON parsing: ${e.message}`);
        return [];
    }
}

/**
 * Extracts and translates crop offers using Gemini AI.
 * @param {string} messageContent - Raw message text from seller group.
 * @param {string[]} targetLanguages - Languages to translate into.
 * @returns {Promise} - Processed crop offers keyed by extractedName.
 */
async function extractAndTranslateCropOffers(messageContent, targetLanguages = ['en']) {

    // --- PULSES TELUGU FALLBACK MAPPING is preserved here, inside the function as you had it ---
    const PULSES_TELUGU_FALLBACK_MAPPING = {
        "CHANA DAL": { desired: "శెనగ పప్పు", regex: /\b(CHANA\s*DAL|CHANA|సెనగ దాల్|చెన దాల్|శనగ పప్పు)\b/gi },
        "CHANA": { desired: "శెనగలు", regex: /\b(CHANA|సెనగలు| చెనగలు)\b/gi },
        "TOOR DAL": { desired: "కంది పప్పు", regex: /\b(TOOR\s*DAL|TUR\s*DAL|కంది దాల్|టూర్ దాల్)\b/gi },
        "TUR": { desired: "కందులు", regex: /\b(TOOR|ARHAR|TUR|కందులు)\b/gi },
        "URAD DAL": { desired: "మినపప్పు", regex: /\b(URAD\s*DAL|ఉరద్ దాల్)\b/gi },
        "URAD": { desired: "మినుములు", regex: /\b(URAD|ఉరద్)\b/gi },
        "MUNG DAL": { desired: "పెసర పప్పు", regex: /\b(MOONG\s*DAL|MUNG\s*DAL|మూంగ్ దాల్|ముంగ్ దాల్)\b/gi },
        "MOONG": { desired: "పెసలు", regex: /\b(MOONG|MUNG|మూంగ్|ముంగ్)\b/gi },
        "MASUR DAL": { desired: "మసూర్ పప్పు", regex: /\b(MASUR\s*DAL|MASUR|మసూర్ దాల్)\b/gi },
        "MATAR": { desired: "బటానా", regex: /\b(MATAR|బటానీ|మటార్|బటానా)\b/gi },
        "MATAR DAL": { desired: "బటానా పప్పు", regex: /\b(MATAR\s*DAL|బటానా పప్పు|మటార్ దాల్|బటానీ పప్పు)\b/gi }
    };

    // The applyFormattingRules function is preserved here, inside the main function as you had it.
    const applyFormattingRules = (text) => {
        let formatted = text;
        formatted = formatted.split('\n').filter(line => !/(NA|NAD|NO\s*SALE|NO\s*SALES|No\s*Sales|Not\s*Available|NO\s*RATE|NO\s*TRADING)/i.test(line)).join('\n');
        formatted = formatted.replace(/\(\+\s*0\)/g, '').replace(/\(-\s*0\)/g, '').replace(/^\+0\b/gm, '').replace(/\s\+0\b/g, '').replace(/^\-0\b/gm, '').replace(/\s\-0\b/g, '');
        formatted = formatted.replace(/(\d+)\s*-\s*(\d+)\s*KATTA/gi, (match, p1, p2) => {
            const q1 = Math.ceil(parseInt(p1) / 2);
            const q2 = Math.floor(parseInt(p2) / 2);
            return `${q1}-${q2} BAG`;
        });
        formatted = formatted.replace(/(\d+)\s*KATTA/gi, (match, p1) => { const q1 = Math.ceil(parseInt(p1) / 2); return `${q1} BAG`; });
        formatted = formatted.replace(/(\d+)\s*-\s*(\d+)\s*QUINTAL(?:S)?/gi, (match, p1, p2) => { const q1 = parseInt(p1) * 2; const q2 = parseInt(p2) * 2; return `${q1}-${q2} BAG`; });
        formatted = formatted.replace(/(\d+)\s*QUINTAL(?:S)?/gi, (match, p1) => { const q1 = parseInt(p1) * 2; return `${q1} BAG`; });
        formatted = formatted.replace(/\b(?:\+?\d{1,3}[-.\s]?)?(\d{10})\b/g, '');
        formatted = formatted.replace(/(?:CONTACT|CALL|DM|WHATSAPP|FOR DETAILS|TRIAL OFFER|INFORMATION IS INDICATIVE|AS AGGREGATED BY MARKET SOURCES|NAME\/CITY FOR FREE TRIAL|PULSES:|OILSEED:|SPICES:)\s*[:\d\s\-\/]*\S*/gi, '');
        formatted = formatted.replace(/\S*@\S*\.\S*/g, '');
        let lines = formatted.split('\n');
        formatted = lines.map(line => {
            const marketMatch = line.match(/^(\w+(?:\s+\w+)*?)\s+MARKET/i);
            if (marketMatch && marketMatch[1]) { return marketMatch[1].toUpperCase() + (line.substring(marketMatch[0].length).trim() ? '\n' + line.substring(marketMatch[0].length).trim() : ''); }
            return line;
        }).join('\n');
        formatted = formatted.split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n').toUpperCase();
        formatted = formatted.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FAD0}-\u{1FADF}\u{1FA70}-\u{1FA7F}\u{1FA80}-\u{1FA8F}\u{1FA90}-\u{1FA9F}\u{2B50}\u{2B06}\u{2934}\u{2935}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2500}-\u{25FF}\u{2B00}-\u{2BFF}]/gu, '');
        formatted = formatted.replace(/👉/g, '');
        return formatted;
    };

    // Your entire massive Gemini prompt is preserved here.
    const initialPrompt = `You are an expert market data analyst for agricultural commodities.
Analyze the following WhatsApp message containing crop market offers.

For each distinct crop offer, perform the following steps:

1. Extraction: Identify the crop name, prices, arrival quantities, and any associated market/location details.

**IMPORTANT**: For crops appearing with different quality/origin names (e.g., 'Sudan', 'Mozambique Gajri' for 'Tur'), or **different markets/locations** (e.g., "Sugar from Kekri Market", "Sugar from Tonk Market"), treat each quality/origin/market as a *distinct offer*. Ensure the quality/origin/market is captured and included in the \`extractedName\` field and subsequently reflected in the \`details\` for each language. For example, if the input says "Tur Sudan", your extractedName should be "Tur Sudan". If it's "Sugar from Kekri Market", your extractedName should be "Sugar Kekri Market".

2. Standardization: Map the base crop name (e.g., "Tur" from "Tur Sudan") to one of the following standardized names: ${STANDARDIZED_NAMES_ARRAY}. If a crop doesn't match, try to infer the closest one or use a general category if unsure. The standardized name should *not* include the quality/origin/market.

3. Categorization: Assign each standardized crop to one of these categories: ${CATEGORIES_ARRAY}.

4. Initial Formatting (English):

*   **CRITICAL FILTERING RULE**: A crop offer is valid **ONLY** if it contains an explicit base price (e.g., '1200', '1200-1300'). You **MUST** completely ignore and exclude from the output any line that ONLY contains a price variation (e.g., '+50', '(-100)', '+0') but no base price. For example, if the input is "CHENNAI : +0", it must be skipped.
*   **ARRIVAL DATA**: If the original message does not specify an 'ARRIVAL' quantity for a valid crop offer, you **MUST** remove the line \`ARRIVAL: \` to its formatted \`details\` string.
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
* Remove all emojis (e.g., "👉", "✅" and any other emojis if found).

* When extracting a price, ALWAYS include any variation or change shown next to the price (for example: "+200", "+150", "(-100)", "(+250)", "-250", "+350"). These should appear *directly after* the main price value, with parentheses if present, otherwise as a space then the sign and value, EXACTLY as written in the source. Do NOT remove or skip these, even if they are positive or negative. **Only** remove "+0", "-0", "(+0)", or "(-0)" (where 0 is the number zero); KEEP all other numbers.

* When parsing crops, always check if the crop offer includes a quality, origin, or type designation (e.g., words like "KARNATAKA GHUNGROO", "GUJARATH JADA", "RAJASTHAN JADA", or **any other similar terms present in the message**).
* If such a quality/origin/type is present, treat it explicitly as a quality/type descriptor associated with the crop and do NOT interpret it as a place name, even if it resembles place names.
* Only consider place names as those explicitly understood to be locations (cities, districts, markets, states).
* This ensures that unknown or new quality descriptors are handled gracefully and classified correctly in the extracted data.

* The output should be COMPACT: do not output repeated separator lines ("-----") or excessive blank/empty lines; only one blank line between sections if needed.

5. Translation: Translate the final formatted English message into all specified target languages: ${targetLanguages.map(l => `'${l}'`).join(', ')}.

VERY IMPORTANT TRANSLATION RULE FOR TELUGU (if 'te' or 'Telugu' is a target language):

When translating the word 'ARRIVAL' into Telugu, you MUST use 'రాబడులు' (Raabaḍulu). Do NOT use 'రాక' (rāka) or any other word for ARRIVAL. This is a strict and critical requirement.

For PULSES, ensure the crop names are translated to their specific Telugu terms as follows:

- CHANA: శెనగలు

- CHANA DAL: శెనగ పప్పు

- TUR: కందులు

- TOOR DAL: కంది పప్పు

- URAD DAL: మినపప్పు

- URAD: మినుములు

- MOONG DAL: పెసర పప్పు

- MUNG: పెసలు

- MASUR DAL: మసూర్ పప్పు

- MATAR DAL: బటానా పప్పు

- MATAR: బటానా

Output Format:

Provide the output as a JSON array of objects. The entire JSON must be enclosed in a single \`\`\`json block. Do not include any other text or characters outside of this block.

Each object should have:

- extractedName: The original crop name extracted from the message, including any quality/origin/market.

- standardizedName: The standardized base crop name (e.g., "TOOR DAL" for "Tur Sudan").

- category: The category of the crop (from the provided list).

- details: An object where keys are language codes (e.g., 'en', 'te') and values are the fully formatted and translated crop offer strings for that language.

Example Output Format :

\`\`\`json
[
  {
    "extractedName": "TUR SUDAN",
    "standardizedName": "TOOR DAL",
    "category": "PULSES",
    "details": {
      "en": "MUMBAI\nTUR SUDAN: 6250-6300 (+200)\nARRIVAL: 150-180 BAG",
      "te": "ముంబై\nటூர் సూడాన్: 6250-6300 (+200)\nరాబడులు: 150-180 బస్తాలు"
    }
  },
  {
    "extractedName": "SUGAR KEKRI MARKET",
    "standardizedName": "SUGAR",
    "category": "SUGAR",
    "details": {
      "en": "KEKRI\nSUGAR: 6800-7200\nARRIVAL: 1500-1800 BAG",
      "te": "కేక్రి\nపంచదార: 6800-7200\nరాబడులు: 1500-1800 బస్తాలు"
    }
  }
]
\`\`\`

WhatsApp Message to Process:
\`\`\`
${messageContent}
\`\`\`
`;

    // This is the new API Key rotation loop.
    const maxAttempts = API_KEYS.length;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const activeApiKey = API_KEYS[currentApiKeyIndex];
        const genAI = new GoogleGenerativeAI(activeApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        try {
            logger.info(`[API] Making request using API Key at index: ${currentApiKeyIndex}`);
            const apiResponse = await model.generateContent(initialPrompt);

            // --- START of your original parsing logic, now correctly placed inside the loop ---
            let textResponse = '';
            if (apiResponse && apiResponse.response && apiResponse.response.candidates && apiResponse.response.candidates.length > 0 && apiResponse.response.candidates[0].content && apiResponse.response.candidates[0].content.parts && apiResponse.response.candidates[0].content.parts.length > 0 && apiResponse.response.candidates[0].content.parts[0].text) {
                textResponse = apiResponse.response.candidates[0].content.parts[0].text;
                logger.info(`Gemini raw response (extracted): ${textResponse}`);
            } else {
                logger.error(`Gemini API response structure is invalid or missing expected text.`);
                logger.error(`Full Gemini response object: ${JSON.stringify(apiResponse)}`);
                throw new Error("Invalid Gemini response structure."); // Throw error to allow retry logic to handle it
            }

            let extractedOffers = [];
            try {
                // This is the NEW, CORRECTED line
                const jsonMatch = textResponse.match(/\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/i);

                if (jsonMatch && jsonMatch[1]) {
                    const jsonString = jsonMatch[1];
                    extractedOffers = JSON.parse(jsonString);
                } else {
                    logger.warn("Could not find `````` block");
                    logger.warn("Trying raw parse. Response starts with: " + textResponse.slice(0, 100));
                    try {
                        extractedOffers = JSON.parse(textResponse);
                    } catch (e) {
                        logger.error("Failed to parse response", e);
                        throw e; // Re-throw to be caught by the lenient parser logic
                    }
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
                        return { extractedName: item.extractedName, standardizedName: standardizedName, category: category, details: details };
                    });
                    logger.warn("Lenient parsing succeeded but translation may be partial.");
                } else {
                    logger.warn("Lenient parsing also yielded no results.");
                    throw new Error("Strict and lenient JSON parsing failed."); // Throw error
                }
            }

            const finalFormattedOffers = {};
            for (const cropOffer of extractedOffers) {
                let { extractedName, standardizedName, category, details } = cropOffer;
                if (!standardizedName || !category || !details || typeof details !== 'object' || Object.keys(details).length === 0) {
                    logger.warn(`Skipping malformed crop offer from Gemini: ${JSON.stringify(cropOffer)}`);
                    continue;
                }
                standardizedName = standardizedName.toUpperCase();
                category = category.toUpperCase();
                if (details['te']) {
                    logger.info(`Telugu translation BEFORE 'రాక' replacement for ${standardizedName}: "${details['te'].substring(0, 50)}..."`);
                    details['te'] = details['te'].replace(/రాక\s*[:\-–.]?/g, 'రాబడులు').trim();
                    logger.info(`Telugu translation AFTER 'రాక' replacement for ${standardizedName}: "${details['te'].substring(0, 50)}..."`);
                }
                if (PULSES_TELUGU_FALLBACK_MAPPING[standardizedName]) {
                    const { desired: desiredTeluguName, regex: regexToReplace } = PULSES_TELUGU_FALLBACK_MAPPING[standardizedName];
                    logger.info(`Telugu crop name replacement before: "${details['te'] ? details['te'].substring(0, 50) : ''}..."`);
                    if (details['te']) {
                        details['te'] = details['te'].replace(regexToReplace, desiredTeluguName);
                    }
                    logger.info(`Telugu crop name replacement after: "${details['te'] ? details['te'].substring(0, 50) : ''}..."`);
                }
                finalFormattedOffers[extractedName.toUpperCase()] = { extractedName: extractedName, standardizedName: standardizedName, category: category, ...details };
            }
            // --- END of your original parsing logic ---

            logger.info(`✅ Successfully processed and parsed message with key index ${currentApiKeyIndex}.`);
            return finalFormattedOffers; // Success! Exit the function.

        } catch (error) {
            // This is the error handling and key rotation logic.
            if (error.message && error.message.includes('429')) {
                logger.error(`[API] 429 Rate limit hit for API Key at index: ${currentApiKeyIndex}.`);
                currentApiKeyIndex = (currentApiKeyIndex + 1) % API_KEYS.length;
                logger.warn(`[API ROTATION] Switched to new API Key at index: ${currentApiKeyIndex}. Retrying...`);
                
                if (attempt === maxAttempts - 1) {
                    logger.error("[API] All API keys have been tried and hit their rate limits.");
                    throw new Error("All available API keys have been exhausted.");
                }
            } else {
                logger.error(`A non-recoverable error occurred on attempt ${attempt + 1}: ${error.message}`);
                throw error; // Re-throw the error so the retry logic in index1.js can handle it
            }
        }
    }
    // This is a final safeguard.
    throw new Error("Processing failed after exhausting all API keys and attempts.");
}

module.exports = {
    extractAndTranslateCropOffers
};
