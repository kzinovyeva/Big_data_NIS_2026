import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js";

// ==============================
// Configuration
// ==============================

// TSV file must be placed alongside index.html and app.js
const TSV_PATH = "reviews_test.tsv";

// Expected text column name in TSV
const TEXT_COLUMN = "text";

// Sentiment model (runs fully in-browser via Transformers.js)
const MODEL_ID = "Xenova/distilbert-base-uncased-finetuned-sst-2-english";

// Google Apps Script Web App URL (deploy your script as a Web App and paste the URL here)
// Example format: https://script.google.com/macros/s/AKfycb.../exec
const GOOGLE_APPS_SCRIPT_URL = "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";

// ==============================
// Minimal state (avoid globals)
// ==============================
let reviews = [];
let sentimentPipeline = null;

// Cached DOM elements
const el = {};

// ==============================
// Utilities
// ==============================
function qs(id) {
  return document.getElementById(id);
}

function setStatus(message) {
  el.statusText.textContent = message || "";
}

function showError(message) {
  el.errorBox.style.display = "block";
  el.errorBox.textContent = message || "An unexpected error occurred.";
}

function clearError() {
  el.errorBox.style.display = "none";
  el.errorBox.textContent = "";
}

function setLoading(isLoading, message) {
  el.loadingRow.style.display = isLoading ? "inline-flex" : "none";
  el.loadingText.textContent = message || (isLoading ? "Loading…" : "");
  el.analyzeBtn.disabled = isLoading || !sentimentPipeline || reviews.length === 0;
}

function setCounts(count) {
  el.countsText.textContent = `Reviews: ${count}`;
}

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toConfidencePercent(score) {
  const n = typeof score === "number" && Number.isFinite(score) ? score : 0;
  return Math.max(0, Math.min(100, n * 100));
}

// ==============================
// TSV loading & parsing
// ==============================
async function loadReviewsFromTSV() {
  setStatus("Loading reviews TSV…");
  try {
    const res = await fetch(TSV_PATH, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`TSV load failed with HTTP ${res.status} (${res.statusText})`);
    }
    const tsvText = await res.text();
    const parsed = parseTSV(tsvText);
    const extracted = extractReviewTexts(parsed, TEXT_COLUMN);

    if (extracted.length === 0) {
      throw new Error(`No valid review texts found in column "${TEXT_COLUMN}".`);
    }

    reviews = extracted;
    setCounts(reviews.length);
    setStatus(`Reviews loaded: ${reviews.length}`);
  } catch (err) {
    console.error("TSV load/parse error:", err);
    showError(
      "Failed to load or parse reviews_test.tsv.\n" +
      "Make sure the file exists next to index.html, is accessible, and contains a 'text' column.\n\n" +
      `Details: ${err.message || String(err)}`
    );
    setStatus("Reviews not loaded.");
    reviews = [];
    setCounts(0);
  }
}

function parseTSV(tsvText) {
  if (typeof Papa === "undefined" || !Papa.parse) {
    throw new Error("Papa Parse is not available. Check the CDN script tag in index.html.");
  }

  const result = Papa.parse(tsvText, {
    header: true,
    delimiter: "\t",
    skipEmptyLines: true,
    dynamicTyping: false
  });

  if (result.errors && result.errors.length > 0) {
    const topErr = result.errors[0];
    throw new Error(`TSV parsing failed: ${topErr.message || "Unknown parse error"}`);
  }

  if (!Array.isArray(result.data)) {
    throw new Error("TSV parsing produced no rows.");
  }

  return result.data;
}

function extractReviewTexts(rows, textColumnName) {
  const texts = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const raw = row[textColumnName];
    const txt = safeString(raw);
    if (txt) texts.push(txt);
  }
  return texts;
}

// ==============================
// Model initialization
// ==============================
async function initSentimentModel() {
  setStatus("Loading sentiment model… (first load may take a while)");
  try {
    // Create a single shared pipeline for sentiment analysis (text classification)
    sentimentPipeline = await pipeline("text-classification", MODEL_ID);

    setStatus("Sentiment model ready.");
  } catch (err) {
    console.error("Model loading error:", err);
    showError(
      "Failed to load the sentiment model in the browser.\n" +
      "This can happen due to unsupported browser features, blocked network requests, or low memory.\n\n" +
      `Details: ${err.message || String(err)}`
    );
    setStatus("Sentiment model failed to load.");
    sentimentPipeline = null;
  }
}

// ==============================
// Analysis flow
// ==============================
function pickRandomReview(list) {
  if (!Array.isArray(list) || list.length === 0) return "";
  const idx = Math.floor(Math.random() * list.length);
  return list[idx];
}

function normalizePipelineOutput(output) {
  // Transformers.js returns an array like: [{ label: "POSITIVE", score: 0.99 }]
  if (!Array.isArray(output) || output.length === 0 || typeof output[0] !== "object") {
    throw new Error("Invalid inference output from model.");
  }
  const top = output[0];
  if (typeof top.label !== "string" || typeof top.score !== "number") {
    throw new Error("Inference output missing expected { label, score }.");
  }
  return { label: top.label, score: top.score };
}

function mapToBucket(label, score) {
  // Requirements:
  // Positive if label is "POSITIVE" and score > 0.5.
  // Negative if label is "NEGATIVE" and score > 0.5.
  // Neutral in all other cases.
  const L = (label || "").toUpperCase();
  const s = typeof score === "number" ? score : 0;

  if (L === "POSITIVE" && s > 0.5) return "positive";
  if (L === "NEGATIVE" && s > 0.5) return "negative";
  return "neutral";
}

function renderSelectedReview(text) {
  el.reviewBox.textContent = text || "";
}

function renderResult({ label, score, bucket }) {
  const conf = toConfidencePercent(score).toFixed(1);

  // Label line: e.g., "POSITIVE (98.7% confidence)"
  el.resultLabel.textContent = `${label} (${conf}% confidence)`;

  // Bucket tag
  el.bucketTag.textContent = bucket.toUpperCase();
  el.bucketTag.classList.remove("positive", "negative", "neutral");
  el.bucketTag.classList.add(bucket);

  // Meta line
  el.resultMeta.textContent = `Model: ${MODEL_ID}`;

  // Icon mapping
  const iconEl = el.resultIcon;
  iconEl.innerHTML = ""; // clear
  const i = document.createElement("i");

  if (bucket === "positive") i.className = "fa-solid fa-thumbs-up";
  else if (bucket === "negative") i.className = "fa-solid fa-thumbs-down";
  else i.className = "fa-regular fa-circle-question"; // neutral

  iconEl.appendChild(i);
}

async function analyzeRandomReview() {
  clearError();

  if (!reviews.length) {
    showError("No reviews loaded. Ensure reviews_test.tsv exists and contains a non-empty 'text' column.");
    return;
  }
  if (!sentimentPipeline) {
    showError("Sentiment model is not ready. Please wait for the model to load.");
    return;
  }

  const review = pickRandomReview(reviews);
  renderSelectedReview(review);

  setLoading(true, "Analyzing sentiment…");
  try {
    const rawOutput = await sentimentPipeline(review);
    const { label, score } = normalizePipelineOutput(rawOutput);
    const bucket = mapToBucket(label, score);

    renderResult({ label, score, bucket });

    // Log every successful run to Google Sheets
    await logToGoogleSheet({
      review,
      sentimentText: `${label} (${toConfidencePercent(score).toFixed(1)}%) -> ${bucket.toUpperCase()}`,
      meta: buildClientMeta({ label, score, bucket, model: MODEL_ID })
    });
  } catch (err) {
    console.error("Inference error:", err);
    showError(
      "Sentiment analysis failed.\n" +
      "Please try again. If the problem persists, check the console for details.\n\n" +
      `Details: ${err.message || String(err)}`
    );

    // Log failures too (counts as a model run attempt)
    try {
      await logToGoogleSheet({
        review,
        sentimentText: `ERROR: ${err.message || String(err)}`,
        meta: buildClientMeta({ error: err.message || String(err), model: MODEL_ID })
      });
    } catch (logErr) {
      // Logging failure should not crash the app
      console.error("Logging error after inference failure:", logErr);
    }
  } finally {
    setLoading(false, "");
  }
}

// ==============================
// Google Sheets logging (Apps Script Web App)
// ==============================
function buildClientMeta(extra = {}) {
  // Collect "all client info" in a compact JSON string
  const meta = {
    pageUrl: location.href,
    referrer: document.referrer || "",
    userAgent: navigator.userAgent,
    language: navigator.language || "",
    languages: navigator.languages || [],
    platform: navigator.platform || "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    ts: Date.now(),
    ...extra
  };
  return JSON.stringify(meta);
}

async function logToGoogleSheet({ review, sentimentText, meta }) {
  // The Apps Script receiver expects x-www-form-urlencoded with:
  // ts, Review, Sentiment, Meta
  // NOTE: Apps Script Web Apps often require CORS allowance. Using mode:'no-cors' avoids CORS blocking,
  // but you won't be able to read the response. This still sends the log in most deployments.
  if (!GOOGLE_APPS_SCRIPT_URL || GOOGLE_APPS_SCRIPT_URL.includes("PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE")) {
    // Logging is optional; don't error if URL isn't configured.
    console.warn("Google Apps Script URL not configured. Skipping logging.");
    return;
  }

  const payload = new URLSearchParams();
  payload.set("ts", String(Date.now()));
  payload.set("Review", review || "");
  payload.set("Sentiment", sentimentText || "");
  payload.set("Meta", meta || "");

  try {
    await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: payload.toString()
    });
  } catch (err) {
    // If the browser blocks the request entirely (network error), surface softly.
    console.error("Failed to send log to Google Sheets:", err);
    // Do not show UI error by default to avoid disrupting analysis UX.
  }
}

// ==============================
// Startup
// ==============================



document.addEventListener("DOMContentLoaded", async () => {
  // Cache elements
  el.analyzeBtn = qs("analyzeBtn");
  el.reviewBox = qs("reviewBox");
  el.resultIcon = qs("resultIcon");
  el.resultLabel = qs("resultLabel");
  el.resultMeta = qs("resultMeta");
  el.bucketTag = qs("bucketTag");
  el.statusText = qs("statusText");
  el.errorBox = qs("errorBox");
  el.loadingRow = qs("loadingRow");
  el.loadingText = qs("loadingText");
  el.countsText = qs("countsText");

  // Initial UI state
  setCounts(0);
  clearError();
  setLoading(true, "Initializing…");

  // Load TSV and model (sequential for clearer status messaging)
  await loadReviewsFromTSV();
  await initSentimentModel();

  // Enable button only if both are ready
  setLoading(false, "");
  el.analyzeBtn.disabled = !sentimentPipeline || reviews.length === 0;

  // Wire interactions
  const btn = document.getElementById("analyzeBtn");
  if (!btn) {
    console.error('Button with id="analyzeBtn" not found in index.html');
    // optionally show UI message if you have an error box
  } else {
    btn.addEventListener("click", analyzeRandomReview);
  }
  
  
  el.analyzeBtn.addEventListener("click", () => {
    analyzeRandomReview().catch((err) => {
      console.error("Unexpected analyze handler error:", err);
      showError(`Unexpected error: ${err.message || String(err)}`);
      setLoading(false, "");
    });
  });
});
