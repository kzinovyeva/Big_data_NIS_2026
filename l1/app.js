// app.js
(() => {
  const TSV_PATH = "reviews_test.tsv";
  const MODEL_URL = "https://api-inference.huggingface.co/models/siebert/sentiment-roberta-large-english";

  const FAKE_TSV = `text
This product exceeded my expectations and works perfectly.
Terrible quality, broke after one day of use.
It's okay—does the job, but nothing special.
Amazing value for the price, highly recommended!
Not great, not awful. Just average overall.`;

  const tokenInput = document.getElementById("tokenInput");
  const analyzeBtn = document.getElementById("analyzeBtn");

  const fileStatus = document.getElementById("fileStatus");
  const countPill = document.getElementById("countPill");
  const pickPill = document.getElementById("pickPill");

  const reviewTextEl = document.getElementById("reviewText");
  const sentimentIcon = document.getElementById("sentimentIcon");
  const sentimentLabel = document.getElementById("sentimentLabel");
  const sentimentDetails = document.getElementById("sentimentDetails");

  const statusBar = document.getElementById("statusBar");
  const statusText = document.getElementById("statusText");

  let reviews = [];
  let pickCount = 0;

  function setBusy(isBusy) {
    statusBar.dataset.busy = isBusy ? "true" : "false";
    analyzeBtn.disabled = isBusy || reviews.length === 0;
  }

  function setStatus(message, kind = "") {
    statusText.className = "";
    if (kind) statusText.classList.add(kind);
    statusText.textContent = message;
  }

  function setFileStatus(text, kind = "") {
    fileStatus.querySelector("span").textContent = text;
    fileStatus.classList.remove("ok", "warn", "err");
    if (kind) fileStatus.classList.add(kind);
  }

  function setCountPill() {
    countPill.querySelector("span").textContent = `Reviews: ${reviews.length}`;
  }

  function resetResultUI() {
    sentimentIcon.innerHTML = `<i class="fa-solid fa-circle-question"></i>`;
    sentimentLabel.textContent = "Neutral";
    sentimentDetails.textContent = "Label: — | Score: —";
    sentimentLabel.className = "sentiment";
  }

  function setResultUI(sentiment, label, score) {
    let iconHtml = `<i class="fa-solid fa-circle-question"></i>`;
    let labelText = "Neutral";
    let kindClass = "warn";

    if (sentiment === "positive") {
      iconHtml = `<i class="fa-solid fa-thumbs-up"></i>`;
      labelText = "Positive";
      kindClass = "ok";
    } else if (sentiment === "negative") {
      iconHtml = `<i class="fa-solid fa-thumbs-down"></i>`;
      labelText = "Negative";
      kindClass = "err";
    }

    sentimentIcon.innerHTML = iconHtml;
    sentimentLabel.textContent = labelText;
    sentimentDetails.textContent = `Label: ${label ?? "—"} | Score: ${typeof score === "number" ? score.toFixed(4) : "—"}`;

    sentimentLabel.className = "sentiment " + kindClass;
  }

  function pickRandomReview() {
    if (!reviews.length) return "";
    const idx = Math.floor(Math.random() * reviews.length);
    pickCount += 1;
    pickPill.querySelector("span").textContent = `Pick: #${pickCount}`;
    return reviews[idx];
  }

  function parseTSVToReviews(tsvText) {
    const parsed = Papa.parse(tsvText, {
      header: true,
      delimiter: "\t",
      skipEmptyLines: true,
      dynamicTyping: false
    });

    if (parsed.errors && parsed.errors.length) {
      const first = parsed.errors[0];
      throw new Error(`TSV parse error: ${first.message || "Unknown error"}`);
    }

    const rows = Array.isArray(parsed.data) ? parsed.data : [];
    const texts = rows
      .map(r => {
        if (!r) return "";
        const v = r.text;
        if (typeof v === "string") return v.trim();
        if (v === null || v === undefined) return "";
        return String(v).trim();
      })
      .filter(t => t.length > 0);

    if (!texts.length) {
      throw new Error(`No review texts found. Ensure TSV has a 'text' column with non-empty values.`);
    }

    return texts;
  }

  async function loadTSV() {
    setBusy(true);
    setStatus("Loading TSV file…");
    setFileStatus("TSV: loading…", "");

    try {
      const res = await fetch(TSV_PATH, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed to fetch TSV (${res.status} ${res.statusText})`);
      }
      const tsvText = await res.text();
      reviews = parseTSVToReviews(tsvText);

      setFileStatus("TSV: loaded", "ok");
      setStatus("Ready.", "ok");
    } catch (err) {
      try {
        reviews = parseTSVToReviews(FAKE_TSV);
        setFileStatus("TSV: fake data", "warn");
        setStatus(
          `Не удалось загрузить reviews_test.tsv — использую fake data. (${err && err.message ? err.message : "unknown error"})`,
          "warn"
        );
      } catch (fallbackErr) {
        reviews = [];
        setFileStatus("TSV: error", "err");
        setStatus(fallbackErr && fallbackErr.message ? fallbackErr.message : "Failed to load data.", "err");
      }
    } finally {
      setCountPill();
      reviewTextEl.textContent = reviews.length ? "Click “Analyze random review” to begin." : "No reviews available.";
      resetResultUI();
      setBusy(false);
      analyzeBtn.disabled = reviews.length === 0;
    }
  }

  function extractTopResult(apiJson) {
    if (!Array.isArray(apiJson) || apiJson.length === 0) return null;
    const inner = apiJson[0];
    if (!Array.isArray(inner) || inner.length === 0) return null;

    const top = inner.reduce((best, cur) => {
      if (!cur || typeof cur.score !== "number") return best;
      if (!best) return cur;
      return cur.score > best.score ? cur : best;
    }, null);

    if (!top || typeof top.label !== "string" || typeof top.score !== "number") return null;
    return { label: top.label, score: top.score };
  }

  function classifySentiment(label, score) {
    if (label === "POSITIVE" && score > 0.5) return "positive";
    if (label === "NEGATIVE" && score > 0.5) return "negative";
    return "neutral";
  }

  async function analyzeReview(reviewText) {
    const token = (tokenInput.value || "").trim();

    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(MODEL_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ inputs: reviewText })
    });

    if (!res.ok) {
      let extra = "";
      try {
        const errJson = await res.json();
        if (errJson && (errJson.error || errJson.message)) extra = ` ${errJson.error || errJson.message}`;
      } catch (_) {}

      if (res.status === 401 || res.status === 403) throw new Error(`Authorization failed (${res.status}). Check token.${extra}`);
      if (res.status === 429) throw new Error(`Rate limit hit (${res.status}). Try later or add token.${extra}`);
      if (res.status >= 500) throw new Error(`Hugging Face server error (${res.status}). Try later.${extra}`);
      throw new Error(`Hugging Face API error (${res.status} ${res.statusText}).${extra}`);
    }

    const json = await res.json();
    const top = extractTopResult(json);
    if (!top) throw new Error("Unexpected API response format. Expected [[{label, score}]].");

    return { sentiment: classifySentiment(top.label, top.score), label: top.label, score: top.score };
  }

  async function onAnalyzeClick() {
    if (!reviews.length) return;

    setBusy(true);
    setStatus("Picking a random review…");
    resetResultUI();

    const reviewText = pickRandomReview();
    reviewTextEl.textContent = reviewText;

    try {
      setStatus("Calling Hugging Face Inference API…");
      const result = await analyzeReview(reviewText);
      setResultUI(result.sentiment, result.label, result.score);
      setStatus("Done.", "ok");
    } catch (err) {
      resetResultUI();
      setStatus(err && err.message ? err.message : "Analysis failed.", "err");
    } finally {
      setBusy(false);
    }
  }

  analyzeBtn.addEventListener("click", onAnalyzeClick);

  loadTSV();
})();
