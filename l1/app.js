// Simplified JavaScript code that works with your HTML

// DOM elements
let reviews = [];
let apiToken = '';

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    console.log('App initialized');
    
    // Load reviews
    loadReviews();
    
    // Setup button click
    document.getElementById('analyze-btn').addEventListener('click', analyzeRandomReview);
    
    // Setup token input
    const apiTokenInput = document.getElementById('api-token');
    apiTokenInput.addEventListener('input', function() {
        apiToken = this.value.trim();
        updateTokenDisplay();
    });
    
    // Load saved token
    const savedToken = localStorage.getItem('hfApiToken');
    if (savedToken) {
        apiTokenInput.value = savedToken;
        apiToken = savedToken;
    }
    
    updateTokenDisplay();
});

// Update token display
function updateTokenDisplay() {
    const tokenStatus = document.getElementById('token-status');
    const usedToken = document.getElementById('used-token');
    
    if (apiToken) {
        const maskedToken = apiToken.substring(0, 6) + '...' + apiToken.substring(apiToken.length - 4);
        tokenStatus.textContent = 'Token: ' + maskedToken;
        tokenStatus.className = 'token-status has-token';
        usedToken.textContent = 'Using: your token';
    } else {
        tokenStatus.textContent = 'No token (using public access)';
        tokenStatus.className = 'token-status no-token';
        usedToken.textContent = 'Using: public access (rate limited)';
    }
}

// Load reviews from TSV or use demo data
function loadReviews() {
    console.log('Loading reviews...');
    
    // Try to load from TSV file
    fetch('reviews_test.tsv')
        .then(response => {
            if (!response.ok) throw new Error('TSV not found');
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
                            .filter(text => text && text.length > 0);
                        
                        console.log('Loaded ' + reviews.length + ' reviews from TSV');
                        updateReviewCount(reviews.length);
                    },
                    error: (error) => {
                        console.error('TSV parse error:', error);
                        loadDemoReviews();
                    }
                });
            } else {
                loadDemoReviews();
            }
        })
        .catch(error => {
            console.log('TSV not available, loading demo reviews:', error);
            loadDemoReviews();
        });
}

// Load demo reviews
function loadDemoReviews() {
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
    
    console.log('Loaded ' + reviews.length + ' demo reviews');
    updateReviewCount(reviews.length + ' (demo)');
}

// Update review count display
function updateReviewCount(count) {
    const reviewCountElement = document.getElementById('review-count');
    if (reviewCountElement) {
        reviewCountElement.textContent = count;
    }
}

// Analyze random review
async function analyzeRandomReview() {
    console.log('Analyzing random review...');
    
    // Hide any previous error
    hideError();
    
    // Check if we have reviews
    if (reviews.length === 0) {
        showError('No reviews loaded. Please refresh the page.');
        return;
    }
    
    // Select random review
    const randomIndex = Math.floor(Math.random() * reviews.length);
    const selectedReview = reviews[randomIndex];
    
    // Update UI
    document.getElementById('review-text').textContent = selectedReview;
    
    // Update pick number
    const pickNumberElement = document.querySelector('.pick-number');
    if (pickNumberElement) {
        pickNumberElement.textContent = '#' + (randomIndex + 1);
    }
    
    // Show loading
    const loadingElement = document.querySelector('.loading');
    const analyzeBtn = document.getElementById('analyze-btn');
    const sentimentResult = document.getElementById('sentiment-result');
    
    loadingElement.style.display = 'block';
    analyzeBtn.disabled = true;
    sentimentResult.innerHTML = '<i class="fas fa-spinner fa-spin icon"></i><span>Analyzing...</span>';
    sentimentResult.className = 'sentiment-result';
    
    try {
        // Call Hugging Face API
        const result = await callHuggingFaceAPI(selectedReview);
        displaySentimentResult(result);
    } catch (error) {
        console.error('Analysis error:', error);
        showError('Failed to analyze: ' + error.message);
        sentimentResult.innerHTML = '<i class="fas fa-exclamation-triangle icon"></i><span>Analysis failed</span>';
    } finally {
        loadingElement.style.display = 'none';
        analyzeBtn.disabled = false;
    }
}

// Call Hugging Face API with CORS proxy
async function callHuggingFaceAPI(text) {
    console.log('Calling Hugging Face API...');
    
    const apiUrl = 'https://api-inference.huggingface.co/models/siebert/sentiment-roberta-large-english';
    const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(apiUrl);
    
    const headers = {
        'Content-Type': 'application/json'
    };
    
    if (apiToken) {
        headers['Authorization'] = 'Bearer ' + apiToken;
    }
    
    const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            inputs: text,
            options: {
                wait_for_model: true
            }
        })
    });
    
    if (!response.ok) {
        throw new Error('API error: ' + response.status);
    }
    
    return await response.json();
}

// Display sentiment result
function displaySentimentResult(result) {
    const sentimentResult = document.getElementById('sentiment-result');
    
    // Default values
    let sentiment = 'neutral';
    let label = 'NEUTRAL';
    let score = 0.5;
    let icon = 'fa-meh';
    
    // Parse API response
    try {
        if (result && Array.isArray(result) && result[0]) {
            const data = Array.isArray(result[0]) ? result[0][0] : result[0];
            
            if (data && data.label) {
                label = data.label.toUpperCase();
                score = data.score || 0.5;
                
                if (label.includes('POSITIVE') && score > 0.5) {
                    sentiment = 'positive';
                    icon = 'fa-smile';
                } else if (label.includes('NEGATIVE') && score > 0.5) {
                    sentiment = 'negative';
                    icon = 'fa-frown';
                }
            }
        }
    } catch (error) {
        console.warn('Error parsing result:', error);
    }
    
    // Update UI
    sentimentResult.className = 'sentiment-result ' + sentiment;
    sentimentResult.innerHTML = `
        <i class="fas ${icon} icon"></i>
        <span>${sentiment.toUpperCase()} (${(score * 100).toFixed(1)}% confidence)</span>
    `;
}

// Show error message
function showError(message) {
    const errorElement = document.getElementById('error-message');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(hideError, 5000);
}

// Hide error message
function hideError() {
    const errorElement = document.getElementById('error-message');
    errorElement.style.display = 'none';
}
