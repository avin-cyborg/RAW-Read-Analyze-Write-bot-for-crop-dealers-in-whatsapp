// config.js

// --- IMPORTANT: REPLACE THESE WITH YOUR ACTUAL WHATSAPP GROUP IDs ---
// You obtained these IDs from the bot's startup logs (e.g., "123459909012345678@g.us").

const SELLER_GROUP_IDS = [
    '000000000000000000@g.us' // Seller Group 1
    //'120363993964644334@g.us', // Seller Group 2
    //'120363400033138757@g.us'  // Seller Group 3
    // Add more seller group IDs as needed
];

// This maps top-level CATEGORIES of crops (e.g., "PULSES", "SPICES")
// to their respective buyer group IDs for each supported language.
// The language keys ('en', 'te') are standard ISO codes and will be used
// consistently across geminiProcessor and index.js.
const BUYER_GROUP_MAPPING = {
    "PULSES": {
        "en": '000000000000000000@g.us',// <<< IMPORTANT: Replace with actual ID
        "te": '000000000000000000@g.us'  // <<< IMPORTANT: Replace with actual ID
    },
    "SPICES": {
        "en": '000000000000000000@g.us',// <<< IMPORTANT: Replace with actual ID
        "te": '000000000000000000@g.us'  // <<< IMPORTANT: Replace with actual ID
        // As per requirements, Spices are English-only. No "te" entry here.
    },
    "OILS": {
        "en": '000000000000000000@g.us',// <<< IMPORTANT: Replace with actual ID
        "te": '000000000000000000@g.us'  // <<< IMPORTANT: Replace with actual ID
        // As per requirements, Oils are English-only. No "te" entry here.
    },
    "SUGAR": {
        "en": '000000000000000000@g.us',// Your existing "Sugar Buyers - English" group ID
        "te": '000000000000000000@g.us'  // <<< IMPORTANT: Replace with actual ID
        // As per requirements, Sugar is English-only. The previous "Telugu" entry for Sugar has been removed.
        // If you still need a Telugu Sugar group, please let me know.
    },
    "KIRANA": {
        "en": '000000000000000000@g.us' // <<< IMPORTANT: Replace with actual ID (to be updated in future)
        // Kirana is English-only. No "te" entry here.
    }, 
    // The "RICE" entry was removed from here as it was not part of the new specified categories (Pulses, Spices, Oils, Sugar, Kirana).
    // If you need to include "RICE", please clarify which new category it falls under or if it needs a new category.
};

// This is the group where ALL processed English messages will be sent.
// This ID should be specific to your "All Updates" WhatsApp group.
const ALL_UPDATES_GROUP_ID = '000000000000000000@g.us'; // <<< IMPORTANT: Replace with your actual "All Updates" group ID

// config.js

// --- START: NEW POST-PROCESSING REPLACEMENTS ---
// This object defines specific word-for-word replacements to be applied
// after Gemini has processed the message. This ensures client-specific
// vocabulary is always used in the final output.
const POST_PROCESSING_REPLACEMENTS = {
    "te": {
        // Your existing replacement:
        "రాక": "రాబడులు",
        "ఎరుపు కంది": "ఎర్ర కందులు",
        "ఎరుపుకంది": "ఎర్ర కందులు",
        "తెల్ల కంది": "తెల్ల కందులు",
        "తెల్లకంది": "తెల్ల కందులు",
        "ఉత్తమ నాణ్యత": "బెస్ట్ క్వాలిటీ",
        "ఉత్తమనాణ్యత": "బెస్ట్ క్వాలిటీ",
        "మధ్యమ నాణ్యత": "మీడియం క్వాలిటీ",
        "మధ్యమనాణ్యత": "మీడియం క్వాలిటీ",
        "ఎంఎచ్": "మహారాష్ట్ర",

        
        /* Add more Telugu replacements here. For example:
        "ధర": "రేటు",
        "రకం": "క్వాలిటీ" */
    },
   /* "en": {
        // Add any English replacements here. For example:
        "PRICE": "RATE",
        "QUALITY": "TYPE"
    }*/
};
// --- END: NEW POST-PROCESSING REPLACEMENTS ---


// These are the standard ISO language codes into which Gemini will translate
// the crop offer summaries. These will be used as keys in BUYER_GROUP_MAPPING
// and in the object returned by geminiProcessor.
const TARGET_LANGUAGES = ['en', 'te']; // 'en' for English, 'te' for Telugu

// This exports all variables so other parts of your bot (like index.js) can use them.
module.exports = {
    SELLER_GROUP_IDS,
    BUYER_GROUP_MAPPING,
    TARGET_LANGUAGES,
    ALL_UPDATES_GROUP_ID,
    POST_PROCESSING_REPLACEMENTS // Export the new ID
};
