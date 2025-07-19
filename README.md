# WhatsApp Market Intelligence Bot

A powerful Node.js bot designed to automate the extraction, translation, and distribution of crop market offers received via WhatsApp. It includes a user-friendly local web interface for easy control and monitoring.

## ✨ Features

* **WhatsApp Integration**: Connects to WhatsApp Web to monitor designated seller groups.
* **AI-Powered Extraction**: Leverages Google Gemini to intelligently extract crop offer details from raw messages.
* **Multi-language Translation**: Automatically translates extracted offers into multiple target languages (e.g., English, Telugu).
* **Intelligent Distribution**: Routes translated offers to specific buyer groups based on crop type and language, and also broadcasts updates to a general "All Updates" group.
* **Robust Message Queue**: Processes incoming messages sequentially with a built-in queue to prevent API rate limits and ensure reliable delivery.
* **Comprehensive Logging**: Detailed activity and error logs are maintained for troubleshooting and auditing.
* **Local Web UI**: A simple, intuitive web interface accessible locally to:
    * Monitor bot connection status.
    * Toggle automation ON/OFF.
    * View real-time and historical bot logs.
* **Email Notifications**: Sends automated email alerts for failed message processing, providing crucial details for quick intervention.
* **Market Statistics Storage**: Saves processed market data for future analysis or display.
* **Graceful Error Handling**: Implements error capture and reporting for critical operational failures.

## 🚀 Getting Started

Follow these steps to set up and run the bot on your local machine.

### Prerequisites

Ensure you have the following installed on your system:

* **Node.js**: [Download & Install Node.js](https://nodejs.org/en/download/) (LTS version recommended).
* **npm**: Comes bundled with Node.js.
* A **WhatsApp account** dedicated solely to the bot's operations.
* A **Google Gemini API Key**: Obtain one from [Google AI Studio](https://aistudio.google.com/app/apikey).
* An **Email Account (Gmail recommended)**: For sending error notifications. If using Gmail, you *must* generate an [App Password](https://support.google.com/accounts/answer/185833) as direct password usage is deprecated for security reasons.

### Installation

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/avin-cyborg/RAW-Read-Analyze-Write-bot-for-crop-dealers-in-whatsapp]
    cd YOUR_REPO_NAME
    ```

2.  **Install project dependencies:**
    ```bash
    npm install
    ```

### Configuration

The bot requires specific configurations for API keys, email details, and WhatsApp group mappings.

1.  **Set up Environment Variables (`.env` file):**
    Copy the provided `.env.example` file to `.env` in the root of your project:
    ```bash
    cp .env.example .env
    ```
    Then, open the newly created `.env` file and fill in your actual credentials:
    ```
    GEMINI_API_KEY=YOUR_GOOGLE_GEMINI_API_KEY_HERE
    NODEMAILER_EMAIL=your_sending_email@gmail.com
    NODEMAILER_PASSWORD=your_email_app_password_here
    ERROR_RECIPIENT_EMAIL=admin_notification_email@example.com
    LOCAL_UI_PORT=3000 # Optional: Customize the port for the local web UI
    ```
    **Remember: Keep your `.env` file secret and never commit it to Git!**

2.  **Configure WhatsApp Groups and Crop Mappings (`config.js`):**
    Open `config.js` and update the following variables with your specific WhatsApp group IDs and crop mapping logic:

    * `SELLER_GROUP_IDS`: An array of serialized WhatsApp group IDs from which the bot will receive crop offers.
    * `BUYER_GROUP_MAPPING`: An object that maps standardized crop names to specific buyer group IDs for each target language.
    * `TARGET_LANGUAGES`: An array defining the language codes for translation (e.g., `['en', 'te']`).
    * `ALL_UPDATES_GROUP_ID`: The serialized WhatsApp group ID where all English translated offers will be broadcasted.

    **How to obtain WhatsApp Group IDs:**
    You can get a group's serialized ID by either inspecting elements in WhatsApp Web or by logging `msg.from` or `chat.id._serialized` from a message received within that group using a simple test script.

    Example `config.js` structure:
    ```javascript
    // config.js
    module.exports = {
        SELLER_GROUP_IDS: [
            '000000000000000000@g.us', // Example: "Gurunanak agro source 3"
            // Add more seller group IDs here
        ],
        BUYER_GROUP_MAPPING: {
            "TOOR DAL": {
                "en": "000000000000000000@g.us", // Example: "Pulses-English"
                "te": "000000000000000000@g.us"  // Example: "Pulses-Telugu"
            },
            "CHANA DAL": {
                "en": "000000000000000000@g.us",
                "te": "120363419197240816@g.us"
            },
            "MASUR DAL": {
                "en": "000000000000000000@g.us",
                "te": "000000000000000000@g.us"
            },
            "MATAR": {
                "en": "000000000000000000@g.us",
                "te": "000000000000000000@g.us"
            }
            // Add more standardized crop mappings as needed
        },
        TARGET_LANGUAGES: ['en', 'te'], // You can add more languages here (e.g., 'hi' for Hindi)
        ALL_UPDATES_GROUP_ID: '000000000000000000@g.us', // Example: "All Updates" general group
    };
    ```

### Running the Bot

1.  **Start the bot from your project root:**
    ```bash
    node index.js
    ```
2.  **Scan the QR Code:**
    A QR code will appear in your terminal. Using your dedicated WhatsApp account, open WhatsApp on your phone, go to `Settings` > `Linked Devices` > `Link a Device`, and scan the QR code.
3.  **WhatsApp Window Appears:**
    Upon successful authentication, a browser window (Chromium/Chrome) showing WhatsApp Web will launch. Do not close this window, as it's required for the bot's operation.
4.  **Bot Ready:**
    The bot will log "WhatsApp Client is ready!" in your terminal. Automation is initially `OFF`.

### Local Web UI

* Once the bot starts, the local web UI server will launch.
* Open your web browser and navigate to: `http://localhost:3000` (or the port you specified in your `.env` file).
* On this UI, you can:
    * See the bot's connection status.
    * Toggle the automation `ON` or `OFF`.
    * View real-time logs from the bot.

## 📁 Project Structure

This outlines the key files and directories within your bot's project:

- `whatsapp-logger/` (Your project's root directory)
  - `.env.example` - Template for environment variables; copy this to `.env` and fill in your details.
  - `.gitignore` - Specifies files and folders that Git should ignore (e.g., `node_modules/`, `.env`, session data).
  - `config.js` - Centralized configuration file for WhatsApp group IDs, crop mappings, and target languages.
  - `index.js` - The main entry point for the bot, handling WhatsApp client, message queue, and local UI server.
  - `geminiProcessor.js` - Contains the logic for AI-powered text extraction and translation using the Gemini API.
  - `market_stats.json` - (Generated by bot) A file used to store the latest market data for processed crops.
  - `package.json` - Defines project metadata, scripts, and lists all npm dependencies.
  - `package-lock.json` - Records the exact versions of dependencies installed, ensuring consistent builds.
  - `public/` - Directory containing static assets for the local web user interface.
    - `index.html` - The main HTML file for your local bot control and monitoring UI.
  - `logs/` - (Auto-created directory) Stores daily log files generated by the Winston logger.
    - `bot_activity-YYYY-MM-DD.log` - Example format of a daily log file (e.g., `bot_activity-2025-07-19.log`).
  - `LICENSE.md` - Details the licensing terms for your project (e.g., MIT License).

## Troubleshooting

* **No WhatsApp Window / QR Code Issue**:
    * Ensure `headless: false` is set in `puppeteer` options within `index.js`.
    * Check your internet connection.
    * If QR code doesn't appear or scan, try deleting the `.wwebjs_auth` folder and restarting `node index.js` to force a fresh authentication.
* **Bot not processing messages**:
    * Verify `botAutomationEnabled` is `true` via the local UI.
    * Double-check that the `SELLER_GROUP_IDS` in `config.js` exactly match the serialized IDs of your seller WhatsApp groups.
    * Review the bot's logs in the terminal or local UI for any errors or warnings.
* **Gemini API Errors**:
    * Ensure your `GEMINI_API_KEY` in `.env` is correct and active.
    * Check if you've enabled the necessary Gemini API services in your Google Cloud Project.
* **Email Notifications Failing**:
    * Confirm `NODEMAILER_EMAIL`, `NODEMAILER_PASSWORD`, and `ERROR_RECIPIENT_EMAIL` are correctly set in `.env`.
    * If using Gmail, ensure you're using an [App Password](https://support.google.com/accounts/answer/185833), not your regular Gmail password.

## Contributing

Contributions, issues, and feature requests are welcome! Feel free to fork the repository and submit pull requests.

## License

This project is licensed under the MIT License. See the `LICENSE.md` file for details.
