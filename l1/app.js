import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js";

/**
 * Requirements implemented:
 * - Static client-side app with 2 files: index.html + app.js
 * - fetch("reviews_test.tsv") + Papa Parse (header:true, delimiter:"\t")
 * - Transformers.js pipeline("text-classification", Xenova/...sst-2...) in browser
 * - Analyze random review, show label+confidence+icon, loading+error states
 * - UI settings: enter HF token and Apps Script URL through interface
 * - Log every model run to Google Sheets (HW 2) in the exact Apps Script format:
 *   ts, Review, Sentiment, Meta  (x-www-form-urlencoded; goes into e.parameter)
 */

// ==============================
// Config (static inputs)
// ==============================
const TSV_PATH = "reviews_test.tsv";
const TEXT_COLUMN = "text";
const MODEL_ID = "Xenova/distilbert-base-uncased-finetuned-sst-2-english";

// localStorage keys
const LS_KEYS = {
  appsScriptUrl: "hw2_appsScriptUrl",
  hfToken: "hw2_hfToken",
  enableLogging: "hw2_enableLogging",
};

// ==============================
// State
// ==============================
let reviews = [];
let sentimentPipe = null;

// Cached DOM
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
  el.analyzeBtn.disabled = on || !sentimentPipe || reviews.length === 0;
}

function setCounts(n) {
  el.countsText.textContent = `Reviews: ${n}`;
}

function setLogStatus(text) {
  el.logStatusText.textContent = text;
}

// ==============================
// Settings (UI <-> localStorage)
// ==============================
function loadSettingsFromStorage() {
  const appsScriptUrl = localStorage.getItem(LS_KEYS.appsScriptUrl) || "";
  const hfToken = localStorage.getItem(LS_KEYS.hfToken) || "";
  const enableLoggingRaw = localStorage.getItem(LS_KEYS.enableLogging);
  const enableLogging = enableLoggingRaw === "true";

  el.appsScriptUrlInput.value = appsScriptUrl;
  el.hfTokenInput.value = hfToken;
  el.enableLoggingChk.checked = enableLogging;

  updateLogStatusUI();
}

function saveSettingsToStorage() {
  const appsScriptUrl = (el.appsScriptUrlInput.value || "").trim();
  const hfToken = (el.hfTokenInput.value || "").trim();
  const enableLogging = !!el.enableLoggingChk.checked;

  localStorage.setItem(LS_KEYS.appsScriptUrl, appsScriptUrl);
  localStorage.setItem(LS_KEYS.hfToken, hfToken);
  localStorage.setItem(LS_KEYS.enableLogging, String(enableLogging));

  updateLogStatusUI();
}

function getSettings() {
  return {
    appsScriptUrl: (localStorage.getItem(LS_KEYS.appsScriptUrl) || "").trim(),
    hfToken: (localStorage.getItem(LS_KEYS.hfToken) || "").trim(),
    enableLogging: localStorage.getItem(LS_KEYS.enableLogging) === "true",
  };
}

function updateLogStatusUI() {
  const { appsScriptUrl, enableLogging } = getSettings();
  if (!enableLogging) {
    setLogStatus("Logging: off");
    return;
  }
  if (!appsScriptUrl) {
    setLogStatus("Logging: on (missing URL)");
    return;
  }
  setLogStatus("Logging: on");
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
    // Try with token if provided (for private repos). If unsupported by library, may throw.
    if (hfToken) {
      sentimentPipe = await pipeline("text-classification", MODEL_ID, { token: hfToken });
    } else {
      sentimentPipe = await pipeline("text-classification", MODEL_ID);
    }

    setStatus("Sentiment model ready.");
  } catch (err) {
    console.error("Model load error:", err);

    // Fallback: if token attempt failed, retry without token (useful if token option is unsupported)
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
  // expected: [{ label: "POSITIVE", score: 0.99 }]
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
  // Requirements:
  // Positive if label is "POSITIVE" and score > 0.5.
  // Negative if label is "NEGATIVE" and score > 0.5.
  // Neutral otherwise.
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

  // icon mapping
  el.resultIcon.innerHTML = "";
  const i = document.createElement("i");
  if (bucket === "positive") i.className = "fa-solid fa-thumbs-up";
  else if (bucket === "negative") i.className = "fa-solid fa-thumbs-down";
  else i.className = "fa-regular fa-circle-question";
  el.resultIcon.appendChild(i);
}

async function analyzeOnce() {
  clearError();

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

    // Log every successful run in the exact expected format
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
// EXACT FORMAT required by your script:
// { ts, Review, Sentiment, Meta } as x-www-form-urlencoded
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
  const { appsScriptUrl, enableLogging } = getSettings();
  updateLogStatusUI();

  if (!enableLogging) return;
  if (!appsScriptUrl) {
    console.warn("Logging enabled but Apps Script URL is missing.");
    return;
  }

  // Your Apps Script expects e.parameter keys: ts, Review, Sentiment, Meta
  const body = new URLSearchParams();
  body.set("ts", String(Date.now()));
  body.set("Review", review || "");
  body.set("Sentiment", sentiment || "");
  body.set("Meta", meta || "");

  // no-cors prevents browser from blocking if Apps Script doesn't set CORS headers.
  // You won't be able to read the response, but the row should append.
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
    "enableLoggingChk",
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
  el.enableLoggingChk = $("enableLoggingChk");
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
  });

  el.reloadModelBtn.addEventListener("click", async () => {
    await initModel();
    el.analyzeBtn.disabled = !sentimentPipe || reviews.length === 0;
    if (sentimentPipe && reviews.length) {
      setStatus(`Ready. Loaded ${reviews.length} reviews. Click “Analyze random review”.`);
    }
  });

  el.enableLoggingChk.addEventListener("change", () => {
    saveSettingsToStorage();
    updateLogStatusUI();
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

  // Final state
  setLoading(false, "");
  el.analyzeBtn.disabled = !sentimentPipe || reviews.length === 0;

  if (sentimentPipe && reviews.length) {
    setStatus(`Ready. Loaded ${reviews.length} reviews. Click “Analyze random review”.`);
  } else if (reviews.length && !sentimentPipe) {
    setStatus("TSV loaded, but model not ready. Check settings and click “Reload model”.");
  }

  updateLogStatusUI();
});
