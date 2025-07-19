// config.js

// --- IMPORTANT: REPLACE THESE WITH YOUR ACTUAL WHATSAPP GROUP IDs ---
// You obtained these IDs from the bot's startup logs (e.g., "123456789012345678@g.us").

const SELLER_GROUP_IDS = [
    '000000000000000000@g.us' // Seller Group 1:Replace with actual ID
    //'120363403964644334@g.us', // Seller Group 2
    //'120363401097138757@g.us'  // Seller Group 3
    // Add more seller group IDs as needed
];

// This maps top-level CATEGORIES of crops (e.g., "PULSES", "SPICES")
// to their respective buyer group IDs for each supported language.
// The language keys ('en', 'te') are standard ISO codes and will be used
// consistently across geminiProcessor and index.js.
const BUYER_GROUP_MAPPING = {
    "PULSES": {
        "en": '000000000000000000@g.us', // <<< IMPORTANT: Replace with actual ID
        "te": '000000000000000000@g.us'  // <<< IMPORTANT: Replace with actual ID
    },
    "SPICES": {
        "en": '000000000000000000@g.us' // <<< IMPORTANT: Replace with actual ID
        // As per requirements, Spices are English-only. No "te" entry here.
    },
    "OILS": {
        "en": '000000000000000000@g.us'   // <<< IMPORTANT: Replace with actual ID
        // As per requirements, Oils are English-only. No "te" entry here.
    },
    "SUGAR": {
        "en": '000000000000000000@g.us' // Your existing "Sugar Buyers - English" group ID.
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

// These are the standard ISO language codes into which Gemini will translate
// the crop offer summaries. These will be used as keys in BUYER_GROUP_MAPPING
// and in the object returned by geminiProcessor.
const TARGET_LANGUAGES = ['en', 'te']; // 'en' for English, 'te' for Telugu

// This exports all variables so other parts of your bot (like index.js) can use them.
module.exports = {
    SELLER_GROUP_IDS,
    BUYER_GROUP_MAPPING,
    TARGET_LANGUAGES,
    ALL_UPDATES_GROUP_ID // Export the new ID
};