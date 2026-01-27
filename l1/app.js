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

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    // Load the TSV file (Papa Parse 활성화)
    loadReviews();
    
    // Set up event listeners
    analyzeBtn.addEventListener('click', analyzeRandomReview);
    apiTokenInput.addEventListener('input', saveApiToken);
    apiTokenInput.addEventListener('change', updateTokenDisplay);
    
    // Load saved API token if exists
    const savedToken = localStorage.getItem('hfApiToken');
    if (savedToken) {
        apiTokenInput.value = savedToken;
        apiToken = savedToken;
    }
    
    // Initial token display update
    updateTokenDisplay();
});

// Load and parse the TSV file using Papa Parse
function loadReviews() {
    fetch('reviews_test.tsv')
        .then(response => {
            if (!response.ok) throw new Error('Failed to load TSV file');
            return response.text();
        })
        .then(tsvData => {
            Papa.parse(tsvData, {
                header: true,
                delimiter: '\t',
                complete: (results) => {
                    reviews = results.data
                        .map(row => row.text)
                        .filter(text => text && text.trim() !== '');
                    console.log('Loaded', reviews.length, 'reviews');
                },
                error: (error) => {
                    console.error('TSV parse error:', error);
                    showError('Failed to parse TSV file: ' + error.message);
                }
            });
        })
        .catch(error => {
            console.error('TSV load error:', error);
            showError('Failed to load TSV file: ' + error.message);
        });
}

// Save API token to localStorage
function saveApiToken() {
    apiToken = apiTokenInput.value.trim();
    if (apiToken) {
        localStorage.setItem('hfApiToken', apiToken);
    } else {
        localStorage.removeItem('hfApiToken');
    }
    updateTokenDisplay();
}

// Update token display information
function updateTokenDisplay() {
    const token = apiTokenInput.value.trim();
    
    if (!token) {
        tokenStatusElement.textContent = 'Токен не установлен';
        tokenStatusElement.className = 'token-status no-token';
        usedTokenElement.textContent = 'Используется: нет токена';
        usedTokenElement.className = 'used-token no-token';
        return;
    }
    
    // Mask token for security (show first 8 and last 4 characters)
    const maskedToken = maskToken(token);
    
    tokenStatusElement.textContent = `Токен установлен (${token.length} символов)`;
    tokenStatusElement.className = 'token-status has-token';
    usedTokenElement.textContent = `Используется: ${maskedToken}`;
    usedTokenElement.className = 'used-token has-token';
    
    console.log('Using token:', maskedToken);
}

// Mask token for display (security)
function maskToken(token) {
    if (token.length <= 12) {
        return '***' + token.slice(-4);
    }
    return token.slice(0, 4) + '***' + token.slice(-4);
}

// Analyze a random review
function analyzeRandomReview() {
    hideError();
    updateTokenDisplay(); // Update display before analysis
    
    if (reviews.length === 0) {
        showError('No reviews available. Please try again later.');
        return;
    }
    
    // Check if token is set
    if (!apiToken) {
        showError('Please enter your Hugging Face API token first');
        apiTokenInput.focus();
        return;
    }
    
    const selectedReview = reviews[Math.floor(Math.random() * reviews.length)];
    
    // Display the review
    reviewText.textContent = selectedReview;
    
    // Show loading state with token info
    loadingElement.style.display = 'block';
    loadingElement.innerHTML = `
        <div class="loading-content">
            <div class="spinner"></div>
            <div class="loading-text">
                <p>Анализ тональности...</p>
                <p class="token-info">Используется токен: ${maskToken(apiToken)}</p>
                <p class="api-info">Запрос к Hugging Face API...</p>
            </div>
        </div>
    `;
    
    analyzeBtn.disabled = true;
    sentimentResult.innerHTML = '';  // Reset previous result
    sentimentResult.className = 'sentiment-result';  // Reset classes
    
    // Call Hugging Face API
    analyzeSentiment(selectedReview)
        .then(result => displaySentiment(result))
        .catch(error => {
            console.error('Error:', error);
            
            // Check if it's a token-related error
            let errorMessage = 'Failed to analyze sentiment: ' + error.message;
            if (error.message.includes('401') || error.message.includes('Unauthorized')) {
                errorMessage = 'Invalid API token. Please check your token and try again.';
            } else if (error.message.includes('Failed to fetch')) {
                errorMessage = 'Network error. Please check your connection and try again.';
            }
            
            showError(errorMessage);
        })
        .finally(() => {
            loadingElement.style.display = 'none';
            loadingElement.innerHTML = '<div class="spinner"></div>'; // Reset to default
            analyzeBtn.disabled = false;
        });
}

// Call Hugging Face API for sentiment analysis
async function analyzeSentiment(text) {
    console.log('Making API request with token:', maskToken(apiToken));
    
    const response = await fetch(
        'https://api-inference.huggingface.co/models/siebert/sentiment-roberta-large-english',
        {
            headers: { 
                Authorization: `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            method: 'POST',
            body: JSON.stringify({ inputs: text }),
        }
    );
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, errorText);
        throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    return result;
}

// Display sentiment result
function displaySentiment(result) {
    // Default to neutral if we can't parse the result
    let sentiment = 'neutral';
    let score = 0.5;
    let label = 'NEUTRAL';
    
    // Parse the API response (format: [[{label: 'POSITIVE', score: 0.99}]])
    if (Array.isArray(result) && result.length > 0 && Array.isArray(result[0]) && result[0].length > 0) {
        const sentimentData = result[0][0];
        label = sentimentData.label?.toUpperCase() || 'NEUTRAL';
        score = sentimentData.score ?? 0.5;
        
        // Determine sentiment
        if (label === 'POSITIVE' && score > 0.5) {
            sentiment = 'positive';
        } else if (label === 'NEGATIVE' && score > 0.5) {
            sentiment = 'negative';
        }
    }
    
    // Update UI
    sentimentResult.classList.add(sentiment);
    sentimentResult.innerHTML = `
        <i class="fas ${getSentimentIcon(sentiment)} icon"></i>
        <span>${label} (${(score * 100).toFixed(1)}% confidence)</span>
        <div class="token-used-info">
            <small>Анализ выполнен с использованием вашего токена</small>
        </div>
    `;
}

// Get appropriate icon for sentiment
function getSentimentIcon(sentiment) {
    switch(sentiment) {
        case 'positive':
            return 'fa-thumbs-up';
        case 'negative':
            return 'fa-thumbs-down';
        default:
            return 'fa-question-circle';
    }
}

// Show error message
function showError(message) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
}

// Hide error message
function hideError() {
    errorElement.style.display = 'none';
}
