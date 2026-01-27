// Global variables
let reviews = [];
let apiToken = '';

// DOM elements
const analyzeBtn = document.getElementById('analyze-btn');
const reviewText = document.getElementById('review-text');
const sentimentResult = document.getElementById('sentiment-result');
const loadingElement = document.querySelector('.loading');
const errorElement = document.getElementById('error-message');
const apiTokenInput = document.getElementById('api-token');
const tokenStatusElement = document.getElementById('token-status');
const usedTokenElement = document.getElementById('used-token');
const reviewCountElement = document.getElementById('review-count');

// CORS Proxy URLs (несколько вариантов на случай, если один не работает)
const CORS_PROXIES = [
    'https://api.allorigins.win/raw?url=',  // Primary
    'https://corsproxy.io/?',               // Backup 1
    'https://api.codetabs.com/v1/proxy?quest=', // Backup 2
    'https://cors-anywhere.herokuapp.com/'  // Backup 3
];

let currentProxyIndex = 0;

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    console.log('App initialized on:', window.location.hostname);
    
    // Load the TSV file
    loadReviews();
    
    // Set up event listeners
    analyzeBtn.addEventListener('click', analyzeRandomReview);
    apiTokenInput.addEventListener('input', saveApiToken);
    apiTokenInput.addEventListener('change', updateTokenDisplay);
    
    // Try to load saved API token
    try {
        const savedToken = localStorage.getItem('hfApiToken');
        if (savedToken) {
            apiTokenInput.value = savedToken;
            apiToken = savedToken;
        }
    } catch (e) {
        console.warn('Cannot access localStorage:', e.message);
        showError('Local storage blocked. API token will not be saved.');
    }
    
    updateTokenDisplay();
});

// Load and parse the TSV file
function loadReviews() {
    // Use proxy for TSV file too if needed
    const tsvUrl = 'https://raw.githubusercontent.com/kzinovyeva/kzinovyeva.github.io/main/reviews_test.tsv';
    
    fetchWithProxy(tsvUrl)
        .then(response => {
            if (!response.ok) throw new Error('Failed to load TSV file');
            return response.text();
        })
        .then(tsvData => {
            if (typeof Papa !== 'undefined') {
                Papa.parse(tsvData, {
                    header: true,
                    delimiter: '\t',
                    complete: (results) => {
                        reviews = results.data
                            .filter(row => row && row.text)
                            .map(row => row.text.trim())
                            .filter(text => text && text !== '');
                        
                        console.log('Loaded', reviews.length, 'reviews');
                        updateReviewCount();
                    },
                    error: (error) => {
                        console.error('TSV parse error:', error);
                        loadFakeData();
                    }
                });
            } else {
                console.warn('PapaParse not loaded, using fake data');
                loadFakeData();
            }
        })
        .catch(error => {
            console.error('TSV load error:', error);
            loadFakeData();
        });
}

// Load fake reviews data
function loadFakeData() {
    reviews = [
        "I absolutely love this product! It has changed my life for the better.",
        "The worst purchase I've ever made. Complete waste of money.",
        "It's okay, does the job but nothing special.",
        "Excellent quality and fast delivery. Highly recommend!",
        "Poor customer service and the product broke after 2 days.",
        "Good value for the price. Would buy again.",
        "Terrible experience from start to finish.",
        "Five stars! Exceeded all my expectations.",
        "Mediocre at best. There are better alternatives.",
        "Simple and effective. Does exactly what it promises."
    ];
    
    console.log('Loaded', reviews.length, 'demo reviews');
    updateReviewCount(' (demo data)');
}

function updateReviewCount(suffix = '') {
    if (reviewCountElement) {
        reviewCountElement.textContent = reviews.length + suffix;
    }
}

// Save API token (with error handling)
function saveApiToken() {
    apiToken = apiTokenInput.value.trim();
    try {
        if (apiToken) {
            localStorage.setItem('hfApiToken', apiToken);
        } else {
            localStorage.removeItem('hfApiToken');
        }
    } catch (e) {
        console.warn('Cannot save to localStorage:', e.message);
    }
    updateTokenDisplay();
}

// Update token display
function updateTokenDisplay() {
    const token = apiTokenInput.value.trim();
    const masked = token ? maskToken(token) : 'none';
    
    if (tokenStatusElement) {
        tokenStatusElement.textContent = token ? `Token set (${masked})` : 'No token (using proxy)';
        tokenStatusElement.className = token ? 'token-status has-token' : 'token-status no-token';
    }
    
    if (usedTokenElement) {
        usedTokenElement.textContent = `Using: ${masked}`;
    }
    
    console.log('Current token:', masked);
}

function maskToken(token) {
    if (token.length <= 8) return '••••';
    return token.slice(0, 4) + '••••' + token.slice(-4);
}

// Fetch with CORS proxy
async function fetchWithProxy(url, options = {}) {
    const proxyUrl = CORS_PROXIES[currentProxyIndex] + encodeURIComponent(url);
    
    console.log(`Using proxy ${currentProxyIndex + 1}/${CORS_PROXIES.length} for:`, url);
    
    const proxyOptions = {
        ...options,
        headers: {
            ...options.headers,
            'X-Requested-With': 'XMLHttpRequest'
        }
    };
    
    try {
        const response = await fetch(proxyUrl, proxyOptions);
        
        if (response.ok) {
            return response;
        }
        
        throw new Error(`Proxy ${currentProxyIndex + 1} failed: ${response.status}`);
        
    } catch (error) {
        console.warn(`Proxy ${currentProxyIndex + 1} error:`, error.message);
        
        // Try next proxy
        currentProxyIndex = (currentProxyIndex + 1) % CORS_PROXIES.length;
        
        if (currentProxyIndex === 0) {
            throw new Error('All proxies failed. Please try again later.');
        }
        
        console.log(`Trying next proxy (${currentProxyIndex + 1})...`);
        return fetchWithProxy(url, options);
    }
}

// Analyze a random review
async function analyzeRandomReview() {
    hideError();
    
    if (reviews.length === 0) {
        showError('Loading reviews... Please try again.');
        return;
    }
    
    const selectedReview = reviews[Math.floor(Math.random() * reviews.length)];
    reviewText.textContent = selectedReview;
    
    // Update pick number
    const pickNumberElement = document.querySelector('.pick-number');
    if (pickNumberElement) {
        pickNumberElement.textContent = `#${reviews.indexOf(selectedReview) + 1}`;
    }
    
    // Show loading
    loadingElement.style.display = 'block';
    analyzeBtn.disabled = true;
    sentimentResult.innerHTML = '';
    sentimentResult.className = 'sentiment-result';
    
    try {
        const result = await analyzeSentiment(selectedReview);
        displaySentiment(result);
    } catch (error) {
        console.error('Analysis error:', error);
        
        let errorMessage = 'Analysis failed. ';
        if (error.message.includes('proxy')) {
            errorMessage += 'CORS proxy issue. ';
        } else if (error.message.includes('token')) {
            errorMessage += 'Invalid API token. ';
        }
        errorMessage += 'Try again or check console for details.';
        
        showError(errorMessage);
        sentimentResult.innerHTML = `<div class="error">${error.message}</div>`;
    } finally {
        loadingElement.style.display = 'none';
        analyzeBtn.disabled = false;
    }
}

// Call Hugging Face API through proxy
async function analyzeSentiment(text) {
    const apiUrl = 'https://api-inference.huggingface.co/models/siebert/sentiment-roberta-large-english';
    
    console.log('Analyzing:', text.substring(0, 50) + '...');
    console.log('API URL:', apiUrl);
    console.log('Using token?', !!apiToken);
    
    const headers = {
        'Content-Type': 'application/json'
    };
    
    if (apiToken) {
        headers['Authorization'] = `Bearer ${apiToken}`;
    }
    
    const requestBody = JSON.stringify({
        inputs: text,
        options: {
            wait_for_model: true,
            use_cache: true
        }
    });
    
    const response = await fetchWithProxy(apiUrl, {
        method: 'POST',
        headers: headers,
        body: requestBody
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, errorText);
        
        if (response.status === 401) {
            throw new Error('Invalid API token');
        } else if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please wait.');
        } else if (response.status === 503) {
            throw new Error('Model is loading. Try again in 30 seconds.');
        } else {
            throw new Error(`API error: ${response.status}`);
        }
    }
    
    return await response.json();
}

// Display sentiment result
function displaySentiment(result) {
    let sentiment = 'neutral';
    let score = 0.5;
    let label = 'NEUTRAL';
    
    try {
        if (result && Array.isArray(result) && result[0]) {
            const data = Array.isArray(result[0]) ? result[0][0] : result[0];
            
            if (data && data.label) {
                label = data.label.toUpperCase();
                score = data.score || 0.5;
                
                if (label.includes('POSITIVE') && score > 0.5) {
                    sentiment = 'positive';
                } else if (label.includes('NEGATIVE') && score > 0.5) {
                    sentiment = 'negative';
                }
            }
        }
    } catch (e) {
        console.warn('Error parsing result:', e, result);
    }
    
    sentimentResult.classList.add(sentiment);
    sentimentResult.innerHTML = `
        <div class="sentiment-header">
            <i class="fas ${getSentimentIcon(sentiment)}"></i>
            <span class="sentiment-label">${sentiment.toUpperCase()}</span>
        </div>
        <div class="sentiment-details">
            <div>Label: <strong>${label}</strong></div>
            <div>Score: <strong>${(score * 100).toFixed(1)}%</strong></div>
        </div>
        <div class="proxy-info">
            <small>Via CORS proxy (${currentProxyIndex + 1}/${CORS_PROXIES.length})</small>
        </div>
    `;
}

function getSentimentIcon(sentiment) {
    switch(sentiment) {
        case 'positive': return 'fa-smile';
        case 'negative': return 'fa-frown';
        default: return 'fa-meh';
    }
}

function showError(message) {
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

function hideError() {
    if (errorElement) {
        errorElement.style.display = 'none';
    }
}

// Add this to check environment
console.log('Hostname:', window.location.hostname);
console.log('Protocol:', window.location.protocol);
console.log('User Agent:', navigator.userAgent);
