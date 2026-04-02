# 📚 WhatsApp Bot Customer Support & Customization Guide

Welcome! This guide is designed for users who want to understand how the bot works or make changes to it without needing a computer science degree. We will break down the project file by file.

## 1. `config.js` (The Settings Menu)

Think of this file as the bot’s main control panel. While it does not contain "functions" (actions), it contains the core variables (settings) that control where messages come from and where they go.

* **`SELLER_GROUP_IDS`**
  * **Description:** A list of WhatsApp group IDs where the bot "listens" for raw crop offers.
  * **How to Customize:** To add a new source group, add its ID inside the brackets `[` and `]`, surrounded by single quotes, with a comma separating it from the others. Example: `'120363403964644334@g.us'`, `'NEW_ID_HERE@g.us'`.
* **`BUYER_GROUP_MAPPING`**
  * **Description:** The routing table. It tells the bot which group should receive which category of crops in which language.
  * **How to Customize:** Find the category (e.g., `"PULSES"`), find the language code (`"en"` for English, `"te"` for Telugu), and paste the new WhatsApp group ID inside the quotes.
* **`ALL_UPDATES_GROUP_ID`**
  * **Description:** The single group ID where the bot sends a massive, combined message of all processed data.
  * **How to Customize:** Replace the ID inside the single quotes with your new master group ID.
* **`TARGET_LANGUAGES`**
  * **Description:** Tells the bot which languages to translate the messages into.
  * **How to Customize:** You can add new language codes here (e.g., `['en', 'te', 'hi']` for Hindi), but you must also instruct the AI to support it in `geminiProcessor.js`.

---

## 2. `index.js` (The Main Engine)

This file is the beating heart of the bot. It handles the actual WhatsApp connection and directs traffic.

### Functions & Event Listeners

* **`logFormat`**
  * **Description:** This function decides how the text looks when the bot prints an update to your computer screen (the terminal). It combines the time, the level of importance (INFO, ERROR), and the message itself.
  * **How to Customize:** If you want the logs to look different, change the text layout inside the backticks: `` `${timestamp} [${level.toUpperCase()}]: ${message}` ``.
* **`client.on('qr', ...)`**
  * **Description:** Triggers when the bot needs you to log in. It prints the QR code to your screen and sends it to the web dashboard.
  * **How to Customize:** Generally, you do not need to touch this.
* **`client.on('ready', ...)`**
  * **Description:** This runs the moment the bot successfully connects to WhatsApp. It announces "WhatsApp Bot is ready!" and automatically reads all your groups to print their IDs to the screen.
  * **How to Customize:** If you want to change the startup message, change the text inside `logger.info('✅ WhatsApp Bot is ready!');`.
* **`client.on('message', async (msg) => { ... })`**
  * **Description:** The most important function. It acts as a guard. Every time a message arrives, it checks if the bot is turned ON, if the message is from a group, and if that group is listed in your `SELLER_GROUP_IDS`. If yes, it sends it to the AI for processing, groups the results, and forwards them to the buyers.
  * **How to Customize:** If you want to change the visual separator between English messages, find `groupedMessages.en[category].join('\n\n-----------------\n\n')` and change the dashes to stars or emojis.
* **`saveMarketStats(stats)`**
  * **Description:** This function takes the processed pricing data and saves it into a file called `market_stats.json` for your records.
  * **How to Customize:** If you want to change how the data is categorized in the file, modify the key generation: `` const key = `${s.crop}-${s.date}-${s.sourceGroup}`; ``.

---

## 3. `geminiProcessor.js` (The AI Brain)

This file talks to Google's AI to clean up messy text and translate it.

### Functions

* **`applyFormattingRules(text)`**
  * **Description:** This is a hidden helper function inside the main AI block. It acts like a digital broom. It deletes bad lines (like "NO SALES"), converts old measurements (KATTA) into standard ones (BAG), removes phone numbers, and deletes emojis.
  * **How to Customize:** If you want the bot to stop deleting emojis, find the line `formatted = formatted.replace(/[\u{1F600}.../gu, '');` and simply delete that entire line. If you want to change the math for bags (e.g., making 1 Katta = 1 Bag instead of 2 Katta = 1 Bag), look for the math logic `Math.ceil(parseInt(p1) / 2)` and remove the `/ 2`.
* **`extractAndTranslateCropOffers(messageContent, targetLanguages)`**
  * **Description:** The primary AI function. It bundles up your messy WhatsApp message, attaches a massive set of strict instructions (the "Prompt"), and sends it to Gemini. It also handles the strict Telugu word replacements (like forcing "రాబడులు" instead of "రాక").
  * **How to Customize:** To change how the AI behaves, edit the English text inside the `initialPrompt` variable. Treat it like you are texting an employee. If you want it to ignore weather data, type "Ignore any mentions of the weather" inside those backticks. To add a new Telugu forced-translation, add it to the `PULSES_TELUGU_FALLBACK_MAPPING` dictionary at the top of the file.
* **`parseLeniently(text)`**
  * **Description:** The emergency backup function. If Gemini glitches and sends back broken data, this function manually scans the text to rescue whatever data it can find so the bot doesn't crash.
  * **How to Customize:** This is pure safety logic; it is highly recommended to leave this function exactly as it is.

---

## 4. `index.html` (The Web Dashboard)

This file contains the visual code (HTML/CSS) and the button logic for the webpage you open on `localhost:3000`.

### Functions

* **`updateButtonUI(isEnabled, automationState)`**
  * **Description:** Changes the color, text, and clickability of the big ON/OFF button based on what the backend server tells it.
  * **How to Customize:** If you want the button to say "Start Bot" instead of "Turn Automation ON", find `automationButton.textContent = 'Turn Automation ON';` and change the text inside the quotes.
* **Socket Listeners (`socket.on(...)`)**
  * **Description:** These are invisible listeners waiting for messages from the Node server (like `'connect'`, `'disconnect'`, `'status'`) to update the text on the webpage without refreshing the page.
  * **How to Customize:** To change the error message text, look for `statusParagraph.textContent = ...` inside `socket.on('connect_error')` and modify the sentence structure.
