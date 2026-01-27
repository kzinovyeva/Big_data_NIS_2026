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

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    // Load the TSV file
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
    
    // Update review count display
    if (reviewCountElement) {
        // Initial value will be updated when reviews are loaded
        reviewCountElement.textContent = '0';
    }
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
                        .filter(row => row && row.text)
                        .map(row => row.text.trim())
                        .filter(text => text && text !== '');
                    
                    console.log('Loaded', reviews.length, 'reviews');
                    
                    // Update review count display
                    if (reviewCountElement) {
                        reviewCountElement.textContent = reviews.length;
                    }
                    
                    // Load fake data if TSV is empty
                    if (reviews.length === 0) {
                        loadFakeData();
                    }
                },
                error: (error) => {
                    console.error('TSV parse error:', error);
                    showError('Failed to parse TSV file: ' + error.message);
                    loadFakeData();
                }
            });
        })
        .catch(error => {
            console.error('TSV load error:', error);
            showError('Failed to load TSV file: ' + error.message);
            loadFakeData();
        });
}

// Load fake reviews data if TSV fails
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
    
    console.log('Loaded fake data:', reviews.length, 'reviews');
    
    if (reviewCountElement) {
        reviewCountElement.textContent = reviews.length + ' (demo data)';
    }
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
        if (tokenStatusElement) {
            tokenStatusElement.textContent = 'Token not set (using public access)';
            tokenStatusElement.className = 'token-status no-token';
        }
        if (usedTokenElement) {
            usedTokenElement.textContent = 'Using: public access (rate limited)';
            usedTokenElement.className = 'used-token no-token';
        }
        return;
    }
    
    // Mask token for security
    const maskedToken = maskToken(token);
    
    if (tokenStatusElement) {
        tokenStatusElement.textContent = `Token set (${token.length} chars)`;
        tokenStatusElement.className = 'token-status has-token';
    }
    if (usedTokenElement) {
        usedTokenElement.textContent = `Using: ${maskedToken}`;
        usedTokenElement.className = 'used-token has-token';
    }
    
    console.log('Using token:', maskedToken);
}

// Mask token for display
function maskToken(token) {
    if (token.length <= 8) {
        return '***' + token.slice(-4);
    }
    return token.slice(0, 4) + '***' + token.slice(-4);
}

// Analyze a random review
function analyzeRandomReview() {
    hideError();
    updateTokenDisplay();
    
    if (reviews.length === 0) {
        showError('No reviews available. Please try again later.');
        return;
    }
    
    const selectedReview = reviews[Math.floor(Math.random() * reviews.length)];
    
    // Display the review
    reviewText.textContent = selectedReview;
    
    // Show loading state
    loadingElement.style.display = 'block';
    analyzeBtn.disabled = true;
    sentimentResult.innerHTML = '';  // Reset previous result
    sentimentResult.className = 'sentiment-result';  // Reset classes
    
    // Update UI to show which review was selected
    const pickNumberElement = document.querySelector('.pick-number');
    if (pickNumberElement) {
        pickNumberElement.textContent = `#${reviews.indexOf(selectedReview) + 1}`;
    }
    
    // Call Hugging Face API
    analyzeSentiment(selectedReview)
        .then(result => displaySentiment(result))
        .catch(error => {
            console.error('Error:', error);
            
            // More specific error messages
            let errorMessage = 'Analysis failed: ';
            
            if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
                errorMessage += 'Network error or CORS issue. ';
                errorMessage += 'Try using a different browser or check console for CORS errors.';
                
                // Try alternative API endpoint
                console.log('Trying alternative API endpoint...');
                analyzeWithAlternativeAPI(selectedReview)
                    .then(result => displaySentiment(result))
                    .catch(altError => {
                        console.error('Alternative API also failed:', altError);
                        showError(errorMessage);
                    });
            } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
                errorMessage += 'Invalid or expired API token. Please check your Hugging Face token.';
                showError(errorMessage);
            } else if (error.message.includes('429')) {
                errorMessage += 'Rate limit exceeded. Please wait or use your own API token.';
                showError(errorMessage);
            } else if (error.message.includes('503') || error.message.includes('Model')) {
                errorMessage += 'Model is loading or unavailable. Please try again in 30 seconds.';
                showError(errorMessage);
            } else {
                errorMessage += error.message;
                showError(errorMessage);
            }
        })
        .finally(() => {
            loadingElement.style.display = 'none';
            analyzeBtn.disabled = false;
        });
}

// Main Hugging Face API call with CORS handling
async function analyzeSentiment(text) {
    const apiUrl = 'https://api-inference.huggingface.co/models/siebert/sentiment-roberta-large-english';
    
    console.log('Making API request to:', apiUrl);
    console.log('Using token:', apiToken ? maskToken(apiToken) : 'none (public access)');
    
    const headers = {
        'Content-Type': 'application/json'
    };
    
    // Add Authorization header only if token is provided
    if (apiToken && apiToken.trim() !== '') {
        headers['Authorization'] = `Bearer ${apiToken}`;
    }
    
    const requestOptions = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ inputs: text }),
        // Add mode and credentials for CORS
        mode: 'cors',
        credentials: 'omit'
    };
    
    // Add timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    requestOptions.signal = controller.signal;
    
    try {
        const response = await fetch(apiUrl, requestOptions);
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error Response:', {
                status: response.status,
                statusText: response.statusText,
                body: errorText
            });
            
            throw new Error(`API error ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('API Success:', result);
        return result;
        
    } catch (error) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
            throw new Error('Request timeout (30s). The model might be loading.');
        }
        
        throw error;
    }
}

// Alternative API endpoint (proxy approach)
async function analyzeWithAlternativeAPI(text) {
    // Try a different approach - use a CORS proxy or alternative endpoint
    const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
    const apiUrl = 'https://api-inference.huggingface.co/models/siebert/sentiment-roberta-large-english';
    
    console.log('Trying with CORS proxy...');
    
    const response = await fetch(proxyUrl + apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': apiToken ? `Bearer ${apiToken}` : ''
        },
        body: JSON.stringify({ inputs: text }),
        mode: 'cors'
    });
    
    if (!response.ok) {
        throw new Error(`Proxy API error: ${response.status}`);
    }
    
    return await response.json();
}

// Display sentiment result
function displaySentiment(result) {
    // Default to neutral if we can't parse the result
    let sentiment = 'neutral';
    let score = 0.5;
    let label = 'NEUTRAL';
    
    // Parse the API response
    try {
        if (Array.isArray(result) && result.length > 0) {
            let sentimentData;
            
            // Handle different response formats
            if (Array.isArray(result[0])) {
                sentimentData = result[0][0];
            } else {
                sentimentData = result[0];
            }
            
            if (sentimentData && sentimentData.label) {
                label = sentimentData.label.toUpperCase();
                score = sentimentData.score || 0.5;
                
                if (label.includes('POSITIVE') && score > 0.5) {
                    sentiment = 'positive';
                } else if (label.includes('NEGATIVE') && score > 0.5) {
                    sentiment = 'negative';
                }
            }
        }
    } catch (error) {
        console.error('Error parsing API response:', error, result);
        label = 'ERROR';
        score = 0;
    }
    
    // Update UI
    sentimentResult.classList.add(sentiment);
    
    const scoreDisplay = score > 0 ? `${(score * 100).toFixed(1)}%` : '—';
    
    sentimentResult.innerHTML = `
        <div class="sentiment-header">
            <i class="fas ${getSentimentIcon(sentiment)} icon"></i>
            <span class="sentiment-label">${sentiment.toUpperCase()}</span>
        </div>
        <div class="sentiment-details">
            <div class="detail-item">
                <span class="detail-label">Label:</span>
                <span class="detail-value">${label}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Score:</span>
                <span class="detail-value">${scoreDisplay}</span>
            </div>
        </div>
        <div class="api-info">
            <small>Analyzed with Hugging Face API</small>
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
            return 'fa-meh';
    }
}

// Show error message
function showError(message) {
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        
        // Auto-hide error after 10 seconds
        setTimeout(() => {
            hideError();
        }, 10000);
    }
}

// Hide error message
function hideError() {
    if (errorElement) {
        errorElement.style.display = 'none';
    }
}
