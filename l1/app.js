import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js";

/**
 * Fully client-side sentiment demo with ALWAYS-ON logging:
 * - fetch reviews_test.tsv
 * - parse TSV via Papa Parse (header:true, delimiter:"\t")
 * - run Transformers.js pipeline in-browser
 * - analyze random review and render label/score/icon
 * - ALWAYS log each run to Google Sheets via Apps Script Web App doPost receiver
 *
 * IMPORTANT:
 * - Logging is always enabled; user must provide Apps Script Web App URL in UI (stored in localStorage).
 * - Log payload matches your Apps Script doPost(e) expectation:
 *   x-www-form-urlencoded fields: ts, Review, Sentiment, Meta
 */

// ==============================
// Config
// ==============================
const TSV_PATH = "reviews_test.tsv";
const TEXT_COLUMN = "text";
const MODEL_ID = "Xenova/distilbert-base-uncased-finetuned-sst-2-english";

// localStorage keys
const LS_KEYS = {
  appsScriptUrl: "hw2_appsScriptUrl",
  hfToken: "hw2_hfToken",
};

// ==============================
// State
// ==============================
let reviews = [];
let sentimentPipe = null;

// DOM cache
const el = {};

// ==============================
// DOM helpers / safety
// ==============================
function $(id) {
  return document.getElementById(id);
}

function requireElements(ids) {
  const missing = ids.filter((id) => !$(id));
  if (missing.length) {
    console.error("Missing required DOM elements:", missing);
    alert("Missing required elements in index.html: " + missing.join(", "));
    throw new Error("Missing DOM elements: " + missing.join(", "));
  }
}

function setStatus(msg) {
  el.statusText.textContent = msg || "";
}

function showError(msg) {
  el.errorBox.style.display = "block";
  el.errorBox.textContent = msg || "Unknown error.";
}

function clearError() {
  el.errorBox.style.display = "none";
  el.errorBox.textContent = "";
}

function setLoading(on, msg) {
  el.loadingRow.style.display = on ? "inline-flex" : "none";
  el.loadingText.textContent = msg || (on ? "Loading…" : "");
  el.analyzeBtn.disabled = on || !sentimentPipe || reviews.length === 0 || !isLoggingConfigured();
}

function setCounts(n) {
  el.countsText.textContent = `Reviews: ${n}`;
}

function setLogStatus(text) {
  el.logStatusText.textContent = text;
}

// ==============================
// Settings
// ==============================
function loadSettingsFromStorage() {
  el.appsScriptUrlInput.value = (localStorage.getItem(LS_KEYS.appsScriptUrl) || "").trim();
  el.hfTokenInput.value = (localStorage.getItem(LS_KEYS.hfToken) || "").trim();
  updateLogStatusUI();
}

function saveSettingsToStorage() {
  const appsScriptUrl = (el.appsScriptUrlInput.value || "").trim();
  const hfToken = (el.hfTokenInput.value || "").trim();

  localStorage.setItem(LS_KEYS.appsScriptUrl, appsScriptUrl);
  localStorage.setItem(LS_KEYS.hfToken, hfToken);

  updateLogStatusUI();
}

function getSettings() {
  return {
    appsScriptUrl: (localStorage.getItem(LS_KEYS.appsScriptUrl) || "").trim(),
    hfToken: (localStorage.getItem(LS_KEYS.hfToken) || "").trim(),
  };
}

function isLoggingConfigured() {
  const { appsScriptUrl } = getSettings();
  return !!appsScriptUrl;
}

function updateLogStatusUI() {
  const { appsScriptUrl } = getSettings();
  if (!appsScriptUrl) {
    setLogStatus("Logging: not configured (enter URL)");
    return;
  }
  setLogStatus("Logging: ON");
}

// ==============================
// TSV loading/parsing
// ==============================
async function loadReviews() {
  setStatus("Loading reviews TSV…");
  try {
    const res = await fetch(TSV_PATH, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} (${res.statusText}) while fetching ${TSV_PATH}`);
    }
    const tsv = await res.text();

    const rows = parseTSV(tsv);
    const texts = extractTexts(rows, TEXT_COLUMN);

    if (!texts.length) {
      throw new Error(`No valid strings found in TSV column "${TEXT_COLUMN}".`);
    }

    reviews = texts;
    setCounts(reviews.length);
    setStatus(`TSV loaded: ${reviews.length} reviews.`);
  } catch (err) {
    console.error("TSV load/parse error:", err);
    reviews = [];
    setCounts(0);
    setStatus("Failed to load TSV.");
    showError(
      "Failed to load or parse reviews_test.tsv.\n" +
      "Make sure the file exists next to index.html, is publicly accessible on GitHub Pages, and has a 'text' column.\n\n" +
      `Details: ${err.message || String(err)}`
    );
  }
}

function parseTSV(tsvText) {
  if (typeof Papa === "undefined" || !Papa.parse) {
    throw new Error("Papa Parse not available (CDN failed).");
  }

  const result = Papa.parse(tsvText, {
    header: true,
    delimiter: "\t",
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  if (result.errors && result.errors.length) {
    const e = result.errors[0];
    throw new Error(e.message || "Unknown TSV parse error.");
  }
  if (!Array.isArray(result.data)) {
    throw new Error("TSV parse produced no data rows.");
  }
  return result.data;
}

function extractTexts(rows, colName) {
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const v = row[colName];
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (s) out.push(s);
  }
  return out;
}

// ==============================
// Model init (Transformers.js)
// ==============================
async function initModel() {
  clearError();
  setStatus("Loading sentiment model… (first time can take a while)");
  setLoading(true, "Loading model…");

  const { hfToken } = getSettings();

  try {
    // If token provided, attempt to use it (private repo access). If unsupported, will throw and we retry.
    if (hfToken) {
      sentimentPipe = await pipeline("text-classification", MODEL_ID, { token: hfToken });
    } else {
      sentimentPipe = await pipeline("text-classification", MODEL_ID);
    }
    setStatus("Sentiment model ready.");
  } catch (err) {
    console.error("Model load error:", err);

    // Retry without token if token attempt failed (helps if 'token' option unsupported)
    if (hfToken) {
      try {
        console.warn("Retrying model load without token…");
        sentimentPipe = await pipeline("text-classification", MODEL_ID);
        setStatus("Sentiment model ready. (Loaded without token)");
      } catch (err2) {
        console.error("Model load error (retry):", err2);
        sentimentPipe = null;
        setStatus("Model failed to load.");
        showError(
          "Failed to load Transformers.js sentiment model.\n" +
          "If you use a token, ensure it is correct and that the model is accessible.\n\n" +
          `Details: ${err2.message || String(err2)}`
        );
      }
    } else {
      sentimentPipe = null;
      setStatus("Model failed to load.");
      showError(
        "Failed to load Transformers.js sentiment model.\n" +
        "Check your network / blockers and open Console for details.\n\n" +
        `Details: ${err.message || String(err)}`
      );
    }
  } finally {
    setLoading(false, "");
  }
}

// ==============================
// Analysis
// ==============================
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeOutput(output) {
  if (!Array.isArray(output) || !output.length || typeof output[0] !== "object") {
    throw new Error("Invalid inference output (expected array of objects).");
  }
  const top = output[0];
  if (typeof top.label !== "string" || typeof top.score !== "number") {
    throw new Error("Invalid inference output fields (missing label/score).");
  }
  return { label: top.label.toUpperCase(), score: top.score };
}

function sentimentBucket(label, score) {
  if (label === "POSITIVE" && score > 0.5) return "positive";
  if (label === "NEGATIVE" && score > 0.5) return "negative";
  return "neutral";
}

function percent(score) {
  const s = Number.isFinite(score) ? score : 0;
  return Math.max(0, Math.min(100, s * 100));
}

function renderReview(text) {
  el.reviewBox.textContent = text || "";
}

function renderResult(label, score, bucket) {
  const conf = percent(score).toFixed(1);
  el.resultLabel.textContent = `${label} (${conf}% confidence)`;

  el.bucketTag.textContent = bucket.toUpperCase();
  el.bucketTag.classList.remove("positive", "negative", "neutral");
  el.bucketTag.classList.add(bucket);

  el.resultMeta.textContent = `Model: ${MODEL_ID}`;

  el.resultIcon.innerHTML = "";
  const i = document.createElement("i");
  if (bucket === "positive") i.className = "fa-solid fa-thumbs-up";
  else if (bucket === "negative") i.className = "fa-solid fa-thumbs-down";
  else i.className = "fa-regular fa-circle-question";
  el.resultIcon.appendChild(i);
}

async function analyzeOnce() {
  clearError();

  if (!isLoggingConfigured()) {
    showError(
      "Logging is always ON, but Apps Script URL is not configured.\n" +
      "Enter your Apps Script Web App URL (ends with /exec) and click “Save settings”."
    );
    return;
  }

  if (!reviews.length) {
    showError("No reviews loaded. Check reviews_test.tsv and the 'text' column.");
    return;
  }
  if (!sentimentPipe) {
    showError("Model not ready. Click “Reload model” or wait for 'Sentiment model ready.'");
    return;
  }

  const review = pickRandom(reviews);
  renderReview(review);

  setLoading(true, "Analyzing sentiment…");
  try {
    const raw = await sentimentPipe(review);
    const { label, score } = normalizeOutput(raw);
    const bucket = sentimentBucket(label, score);

    renderResult(label, score, bucket);

    // ALWAYS log, in exact Apps Script doPost(e) format
    await logRunToGoogleSheet({
      review,
      sentiment: `${label} (${percent(score).toFixed(1)}%)`,
      meta: buildMeta({ bucket, label, score, model: MODEL_ID }),
    });
  } catch (err) {
    console.error("Inference error:", err);
    showError(
      "Inference failed.\n" +
      "Try again. If it keeps failing, open Console to see details.\n\n" +
      `Details: ${err.message || String(err)}`
    );

    // Still log attempts (counts as a run attempt)
    try {
      await logRunToGoogleSheet({
        review,
        sentiment: `ERROR: ${err.message || String(err)}`,
        meta: buildMeta({ error: err.message || String(err), model: MODEL_ID }),
      });
    } catch (logErr) {
      console.error("Logging failed after inference error:", logErr);
    }
  } finally {
    setLoading(false, "");
  }
}

// ==============================
// Google Sheets logging (Apps Script doPost receiver)
// EXACT FORMAT required:
// x-www-form-urlencoded fields: ts, Review, Sentiment, Meta
// ==============================
function buildMeta(extra = {}) {
  const meta = {
    pageUrl: location.href,
    referrer: document.referrer || "",
    userAgent: navigator.userAgent,
    language: navigator.language || "",
    languages: navigator.languages || [],
    platform: navigator.platform || "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    ts: Date.now(),
    ...extra,
  };
  return JSON.stringify(meta);
}

async function logRunToGoogleSheet({ review, sentiment, meta }) {
  const { appsScriptUrl } = getSettings();
  updateLogStatusUI();

  if (!appsScriptUrl) {
    // This shouldn't happen because analyzeOnce guards it, but keep it safe.
    throw new Error("Apps Script URL is missing (logging is required).");
  }

  const body = new URLSearchParams();
  body.set("ts", String(Date.now()));
  body.set("Review", review || "");
  body.set("Sentiment", sentiment || "");
  body.set("Meta", meta || "");

  // Use no-cors so the browser sends the request even if Apps Script lacks CORS headers.
  // We cannot read the response in no-cors mode, but the row should append.
  await fetch(appsScriptUrl, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: body.toString(),
  });
}

// ==============================
// Bootstrap
// ==============================
document.addEventListener("DOMContentLoaded", async () => {
  requireElements([
    "analyzeBtn",
    "countsText",
    "loadingRow",
    "loadingText",
    "statusText",
    "errorBox",
    "reviewBox",
    "resultIcon",
    "resultLabel",
    "resultMeta",
    "bucketTag",
    "appsScriptUrlInput",
    "hfTokenInput",
    "saveSettingsBtn",
    "reloadModelBtn",
    "logStatusText",
  ]);

  // Cache DOM
  el.analyzeBtn = $("analyzeBtn");
  el.countsText = $("countsText");
  el.loadingRow = $("loadingRow");
  el.loadingText = $("loadingText");
  el.statusText = $("statusText");
  el.errorBox = $("errorBox");
  el.reviewBox = $("reviewBox");
  el.resultIcon = $("resultIcon");
  el.resultLabel = $("resultLabel");
  el.resultMeta = $("resultMeta");
  el.bucketTag = $("bucketTag");

  el.appsScriptUrlInput = $("appsScriptUrlInput");
  el.hfTokenInput = $("hfTokenInput");
  el.saveSettingsBtn = $("saveSettingsBtn");
  el.reloadModelBtn = $("reloadModelBtn");
  el.logStatusText = $("logStatusText");

  // Initial UI
  setCounts(0);
  clearError();
  setLoading(true, "Initializing…");
  setStatus("App initialized.");

  // Load saved settings into UI
  loadSettingsFromStorage();

  // Bind events
  el.saveSettingsBtn.addEventListener("click", () => {
    clearError();
    saveSettingsToStorage();
    setStatus("Settings saved.");
    // reevaluate button availability
    el.analyzeBtn.disabled = !sentimentPipe || reviews.length === 0 || !isLoggingConfigured();
  });

  el.reloadModelBtn.addEventListener("click", async () => {
    await initModel();
    el.analyzeBtn.disabled = !sentimentPipe || reviews.length === 0 || !isLoggingConfigured();
    if (sentimentPipe && reviews.length && isLoggingConfigured()) {
      setStatus(`Ready. Loaded ${reviews.length} reviews. Click “Analyze random review”.`);
    }
  });

  el.analyzeBtn.addEventListener("click", () => {
    analyzeOnce().catch((err) => {
      console.error("Unexpected analyzeOnce error:", err);
      showError(`Unexpected error: ${err.message || String(err)}`);
      setLoading(false, "");
    });
  });

  // Load TSV then model
  await loadReviews();
  await initModel();

  // Final state: enable button only when TSV+model ready AND logging configured (always-on requirement)
  setLoading(false, "");
  el.analyzeBtn.disabled = !sentimentPipe || reviews.length === 0 || !isLoggingConfigured();

  if (!isLoggingConfigured()) {
    setStatus("Enter Apps Script Web App URL and click “Save settings” (logging is required).");
  } else if (sentimentPipe && reviews.length) {
    setStatus(`Ready. Loaded ${reviews.length} reviews. Click “Analyze random review”.`);
  } else if (reviews.length && !sentimentPipe) {
    setStatus("TSV loaded, but model not ready. Click “Reload model”.");
  }

  updateLogStatusUI();
});
