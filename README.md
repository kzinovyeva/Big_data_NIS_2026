# Big_data_NIS_2026
HW: https://kzinovyeva.github.io/Big_data_NIS_2026/l1/

macros: https://script.google.com/macros/s/AKfycbw0u9u_BUtJJCtQaY8B13SkNLuIXxQcLi21uX_XeOKvXS7fi0FY5VNl0-HKdNw6w_30/exec

Logs: https://docs.google.com/spreadsheets/d/1JUpQUrnxMnoU1s4jxnvpMw2R6IeEOdz0a5ktWSJYG6Q/edit?gid=0#gid=0

1. A **fully static, client-side** web app (no backend) was created so it can be hosted on **GitHub Pages**.

2. The project was structured to contain **exactly two files**:

   * `index.html` (full HTML + inline CSS + CDN links)
   * `app.js` (all JavaScript logic)

3. In `index.html`, the required external libraries were included:

   * **Papa Parse** via CDN for parsing TSV in the browser
   * **Font Awesome** via CDN for sentiment icons
   * The app logic was loaded using:
     `<script type="module" src="app.js"></script>`
     to enable ES module imports in the browser.

4. In `app.js`, TSV loading and parsing were implemented:

   * The local TSV file was loaded using `fetch("reviews_test.tsv")`
   * It was parsed with Papa Parse configured with:

     * `header: true`
     * `delimiter: "\t"`
   * A clean array of review strings was extracted from the TSV column named **`text`**, filtering out empty/non-string values.

5. Model initialization was implemented using **Transformers.js** (running entirely in the browser):

   * Transformers.js was imported as an ES module:
     `import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js";`
   * On page load, a shared pipeline was created:
     `pipeline("text-classification", "Xenova/distilbert-base-uncased-finetuned-sst-2-english")`
   * Status messages were displayed while the model downloads/loads and when it becomes ready.

6. The user interaction flow was implemented:

   * A button labeled **“Analyze random review”** was added
   * On click:

     * It was verified that reviews were loaded
     * A review was selected randomly from the parsed list
     * The selected review text was displayed
     * The button was disabled and a loading indicator was shown during inference
     * The Transformers.js pipeline was executed on the selected review text

7. Model output normalization and sentiment bucketing were implemented:

   * The top prediction `{ label, score }` was selected from the pipeline output
   * It was mapped into three buckets:

     * **positive** if `label === "POSITIVE"` and `score > 0.5`
     * **negative** if `label === "NEGATIVE"` and `score > 0.5`
     * **neutral** otherwise
   * The UI was updated to show:

     * Label + confidence percentage (e.g., `POSITIVE (98.7% confidence)`)
     * The corresponding icon:

       * positive → thumbs up
       * negative → thumbs down
       * neutral → question mark
     * Distinct styling for each sentiment bucket

8. UI states and error handling were added:

   * Previous error messages were cleared when a new analysis started
   * User-friendly errors were shown for:

     * TSV load failures (404/network)
     * TSV parsing failures
     * Model loading failures
     * Inference failures or invalid model output
   * Technical details were logged to the browser console.

9. Google Sheets logging (HW 2) was implemented using the provided **Apps Script Web App**:

   * Each run sends a POST request in **x-www-form-urlencoded** format
   * The payload uses exactly the fields expected by `doPost(e)`:

     * `ts`
     * `Review`
     * `Sentiment`
     * `Meta`
   * `Meta` is generated as a JSON string containing “all client info” (page URL, user agent, language, timezone, etc.)

10. A UI-based configuration for logging was added:

* An input field was added to paste the **Apps Script Web App URL** (ending with `/exec`)
* The URL is stored in `localStorage` so it persists between page reloads

11. The requirement “logging is always enabled” was enforced:

* No on/off toggle for logging is used
* A valid Apps Script URL is required so every run is logged
* The log format aligns with the Google Sheet header:

  * `Timestamp (ts_iso)`, `Review`, `Sentiment (with confidence)`, `Meta (all client info)`

12. Logging was made best-effort so it does not break sentiment output display:

* The sentiment result is still shown even if logging fails
* Logging is attempted after inference and failures are handled gracefully without crashing the app



**Promt**
Role
You are an expert front-end web developer with deep knowledge of vanilla JavaScript, browser-based ML using Transformers.js, and static site deployment. You always follow the given specifications exactly and write clean, well-structured, production-ready code.

Context
We need a fully client-side web application that can be hosted as static files (for example on GitHub Pages or Hugging Face Spaces). The app should:

Load a local TSV file named reviews_test.tsv containing a text column with product reviews.
Use Papa Parse in the browser to parse the TSV into an array of review texts.
On button click, select a random review, display it, and classify its sentiment using Transformers.js with a supported sentiment model such as Xenova/distilbert-base-uncased-finetuned-sst-2-english. github
Run all inference directly in the browser (no Hugging Face Inference API calls) to avoid CORS issues and ensure the app remains purely static. huggingface
The UI should show:

A text area containing the randomly selected review.
A sentiment/emotion result with a label (e.g., POSITIVE/NEGATIVE/NEUTRAL) and confidence score.
An icon indicating positive (thumbs up), negative (thumbs down), or neutral (question mark).
Loading and error states (e.g., while the model is loading or when TSV parsing fails).
Instructions
Implement the web app with the following exact requirements:

File structure

Create exactly two files: index.html and app.js.
index.html must contain the full HTML structure, inline CSS for basic styling, and script tags for external libraries.
app.js must contain all JavaScript logic.
Load app.js from index.html with a <script type="module" src="app.js"></script> tag so ES module imports are allowed.
Libraries and CDNs
In index.html, include:

Papa Parse via CDN for TSV parsing:
<script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js"></script>
Font Awesome for sentiment icons:
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
Transformers.js will be imported as an ES module from within app.js using:
import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js"; huggingface
TSV loading and parsing (app.js)

Use fetch("reviews_test.tsv") to load the TSV file.
Use Papa Parse with header: true and delimiter: "\t" to parse it. papaparse
Extract an array of clean review texts from the text column, filtering out empty or non-string values.
Handle network and parsing errors gracefully and show a user-friendly message in the UI.
Model initialization with Transformers.js

In app.js, import pipeline from Transformers.js as an ES module.
On startup (DOMContentLoaded), create a single shared pipeline for sentiment analysis or text classification:
Example:
const sentimentPipeline = await pipeline("text-classification", "Xenova/distilbert-base-uncased-finetuned-sst-2-english"); huggingface
Display a status message while the model is downloading/loading (e.g., “Loading sentiment model…”), and another when it is ready (e.g., “Sentiment model ready”).
If model loading fails, log the error and show a readable error message in the UI.
User interaction and sentiment analysis flow

Add a button labeled “Analyze random review”.
When clicked:
If no reviews are loaded, show an error message and do nothing else.
Randomly select one review from the parsed list.
Display the selected review in a dedicated element.
Show a loading indicator and disable the button while analysis is running.
Call the Transformers.js pipeline with the review text.
The pipeline will return an array like [{ label: "POSITIVE", score: 0.99 }, ...]. huggingface
Normalize this output into a structure that your display function can easily consume (e.g., choose the top result, or wrap as [[{label, score}]] if helpful).
Map the label and score to one of three sentiment buckets: positive, negative, or neutral.
Positive if label is "POSITIVE" and score > 0.5.
Negative if label is "NEGATIVE" and score > 0.5.
Neutral in all other cases.
Update the UI with the label, confidence percentage, and the corresponding icon.
Re-enable the button and hide the loading indicator when done.
UI and styling details

The UI should include at minimum:
A title for the page.
A section showing the selected review text (use a <div> or <p>).
A result area that shows:
The sentiment label and confidence (e.g., “POSITIVE (98.7% confidence)”).
A Font Awesome icon:
Positive → fa-thumbs-up
Negative → fa-thumbs-down
Neutral → fa-question-circle
A status text area for model loading messages.
An error message area that is hidden by default and shown only when needed.
Add simple, clear CSS to make the layout readable and visually distinct (e.g., different colors for positive/negative/neutral).
Error handling

Handle and surface errors for:
TSV load failures (network, 404).
TSV parsing failures.
Model loading failures.
Inference failures (e.g., invalid output).
Do not crash silently; log errors to the console and update the error message area with a user-friendly explanation.
Always clear previous error messages when starting a new analysis.
Technical constraints

Use only vanilla JavaScript; no frameworks or bundlers (no React, Vue, etc.).
The app must run entirely in the browser with no server-side code or custom backend.
Do not call the Hugging Face Inference API or Router; all inference must go through Transformers.js running locally in the browser. github
Code quality

Organize app.js into small, well-named functions for loading reviews, initializing the model, running analysis, displaying results, and handling errors.
Use clear, concise comments in English explaining key logic, especially around model loading and sentiment mapping.
Avoid global leaks other than the minimal necessary variables.
Format
Return your answer in this exact structure:

A complete index.html file in a fenced code block labeled html.

Must include:
Full HTML skeleton (<!DOCTYPE html>, <html>, <head>, <body>).
CSS styling (inline in a <style> tag is acceptable).
Papa Parse and Font Awesome CDNs.
The UI elements described above.
<script type="module" src="app.js"></script> at the end of the body.
A complete app.js file in a separate fenced code block labeled javascript.

Must include:
The import { pipeline } from "https://cdn.jsdelivr.net/.../transformers.min.js"; statement.
All logic for TSV loading, model initialization, random review selection, sentiment analysis with Transformers.js, UI updates, and error handling.
Do not include any extra explanation or commentary outside these two code blocks.

To this, you need to add the following
 I need all the launches of the model to be collected in a Google Excel spreadsheet using macros, where the app script is already activated.
 The macros:
 
/**
 * Minimal Web App receiver for MVP logging.
 * Expects JSON: { event: "cta_click", variant: "B", userId: "...", ts: 1699999999999 }
 * Returns JSON { ok: true } on success.
 * Accepts x-www-form-urlencoded from e.parameter and appends to Sheet.

 */
` 
function doPost(e) {
  var p = e && e.parameter ? e.parameter : {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('logs') || ss.insertSheet('logs');
  if (sh.getLastRow() === 0) {
    sh.appendRow(['Timestamp (ts_iso)','Review','Sentiment (with confidence)','Meta (all client info)']);
  }
  var ts = p.ts ? new Date(Number(p.ts)) : new Date();
  sh.appendRow([
    ts.toISOString(),
    p.Review || '',
    p.Sentiment || '',
    p.Meta || ''
  ]);
  return ContentService.createTextOutput('OK');
} `
