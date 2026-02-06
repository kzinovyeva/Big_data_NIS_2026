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
