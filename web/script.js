const defaultState = {
    "Indices": {
        "Large Cap": ["^BSESN", "^NSEI", "^BSESN50"],
        "Mid Cap": ["^NSEMDCP50", "BSE-MIDCAP.BO"],
        "Small Cap": ["BSE-SMLCAP.BO", "^CNXSMLCAP"]
    },
    "Equities": {
        "Financials": ["HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "KOTAKBANK.NS", "AXISBANK.NS"],
        "IT": ["TCS.NS", "INFY.NS", "HCLTECH.NS", "WIPRO.NS", "TECHM.NS"],
        "Energy": ["RELIANCE.NS", "NTPC.NS", "POWERGRID.NS"],
        "Automobile": ["MARUTI.NS", "M&M.NS", "TATAMOTORS.NS"]
    }
};

let appState = JSON.parse(localStorage.getItem('vanguardState')) || defaultState;
let activeMainTab = Object.keys(appState)[0];
let activeSubTab = Object.keys(appState[activeMainTab])[0];

const mainTabsContainer = document.getElementById('main-tabs-container');
const subTabsContainer = document.getElementById('sub-tabs-container');
const tableBody = document.getElementById('table-body');
const loadingOverlay = document.getElementById('loading-overlay');
const refreshBtn = document.getElementById('refresh-btn');
const searchInput = document.getElementById('symbol-search');
const searchResults = document.getElementById('search-results');

function saveState() {
    localStorage.setItem('vanguardState', JSON.stringify(appState));
}

function renderTabs() {
    // Render Main Tabs
    mainTabsContainer.innerHTML = '';
    Object.keys(appState).forEach(mainTab => {
        const btn = document.createElement('button');
        btn.className = `main-tab-btn ${mainTab === activeMainTab ? 'active' : ''}`;
        btn.textContent = mainTab;
        btn.onclick = () => {
            activeMainTab = mainTab;
            const subTabs = Object.keys(appState[activeMainTab]);
            if (subTabs.length > 0 && !appState[activeMainTab][activeSubTab]) {
                activeSubTab = subTabs[0];
            }
            renderTabs();
            fetchQuotes();
        };
        mainTabsContainer.appendChild(btn);
    });

    // Render Sub Tabs
    subTabsContainer.innerHTML = '';
    const subTabs = Object.keys(appState[activeMainTab] || {});
    subTabs.forEach(subTab => {
        const btn = document.createElement('button');
        btn.className = `tab-btn ${subTab === activeSubTab ? 'active' : ''}`;
        btn.textContent = subTab;
        btn.onclick = () => {
            activeSubTab = subTab;
            renderTabs();
            fetchQuotes();
        };
        subTabsContainer.appendChild(btn);
    });
}

function formatVal(val) {
    return Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getColorClass(val) {
    if (val > 0) return 'val-green';
    if (val < 0) return 'val-red';
    return 'val-neutral';
}

async function fetchQuotes() {
    const symbols = appState[activeMainTab]?.[activeSubTab] || [];
    if (symbols.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 2rem; color: var(--text-secondary);">No symbols in this tab. Use the search bar to add some!</td></tr>`;
        return;
    }

    loadingOverlay.classList.add('active');
    try {
        const queryParams = encodeURIComponent(symbols.join(','));
        const response = await fetch(`/api/quotes?symbols=${queryParams}`);
        if (!response.ok) throw new Error('Network error');
        const quotes = await response.json();
        
        tableBody.innerHTML = '';
        quotes.forEach((q, index) => {
            const tr = document.createElement('tr');
            
            const changeClass = getColorClass(q.change);
            const deltaHigh = q.fiftyTwoWeekHigh !== 0 ? ((q.currentPrice - q.fiftyTwoWeekHigh) / q.fiftyTwoWeekHigh) * 100 : 0;
            const deltaClass = getColorClass(deltaHigh);
            const signStr = q.change > 0 ? '+' : '';
            const deltaSignStr = deltaHigh > 0 ? '+' : '';

            if (q.name === "Fallback") {
                tr.innerHTML = `
                    <td class="symbol-col">${q.symbol}</td>
                    <td class="name-col val-red" colspan="7">Data Unavailable</td>
                    <td><button class="remove-btn" onclick="removeSymbol('${q.symbol}')">×</button></td>
                `;
            } else {
                tr.innerHTML = `
                    <td class="symbol-col">${q.symbol}</td>
                    <td class="name-col">${q.name}</td>
                    <td class="right-align price-col">${formatVal(q.currentPrice)}</td>
                    <td class="right-align price-col ${changeClass}">${signStr}${formatVal(q.change)}</td>
                    <td class="right-align price-col ${changeClass}">${signStr}${formatVal(q.percentChange)}%</td>
                    <td class="right-align name-col">${formatVal(q.fiftyTwoWeekHigh)}</td>
                    <td class="right-align name-col">${formatVal(q.fiftyTwoWeekLow)}</td>
                    <td class="right-align price-col ${deltaClass}">${deltaSignStr}${formatVal(deltaHigh)}%</td>
                    <td><button class="remove-btn" onclick="removeSymbol('${q.symbol}')">×</button></td>
                `;
            }
            tableBody.appendChild(tr);
        });

    } catch (error) {
        console.error("Error fetching data:", error);
        tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#ef4444; padding: 2rem;">Error fetching live data. Ensure server is running.</td></tr>`;
    } finally {
        loadingOverlay.classList.remove('active');
    }
}

window.removeSymbol = function(symbol) {
    const arr = appState[activeMainTab][activeSubTab];
    const index = arr.indexOf(symbol);
    if (index > -1) {
        arr.splice(index, 1);
        saveState();
        fetchQuotes();
    }
}

// Search Functionality
let searchTimeout;
searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (query.length < 2) {
        searchResults.classList.remove('active');
        return;
    }
    
    searchTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            
            if (data && data.quotes && data.quotes.length > 0) {
                searchResults.innerHTML = '';
                data.quotes.forEach(quote => {
                    const div = document.createElement('div');
                    div.className = 'search-item';
                    div.innerHTML = `<span class="sym">${quote.symbol}</span> <span class="name">${quote.shortname || quote.longname || ''}</span>`;
                    div.onclick = () => {
                        const arr = appState[activeMainTab][activeSubTab];
                        if (!arr.includes(quote.symbol)) {
                            arr.push(quote.symbol);
                            saveState();
                            fetchQuotes();
                        }
                        searchInput.value = '';
                        searchResults.classList.remove('active');
                    };
                    searchResults.appendChild(div);
                });
                searchResults.classList.add('active');
            } else {
                searchResults.classList.remove('active');
            }
        } catch (e) {
            console.error("Search failed", e);
        }
    }, 500);
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
        searchResults.classList.remove('active');
    }
});

refreshBtn.addEventListener('click', fetchQuotes);

// Boot
renderTabs();
fetchQuotes();
setInterval(fetchQuotes, 60000);
