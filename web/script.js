const defaultState = {
    "Overview": {
        "Market": ["^BSESN", "^NSEI", "^DJI", "^IXIC", "^GSPC", "^N225", "^FTSE"]
    },
    "Commodities": {
        "Metals": ["GOLDBEES.NS", "SILVERBEES.NS", "PL=F"],
        "Energy": ["CL=F", "NG=F", "BZ=F"],
        "Currency": ["USDINR=X", "EURINR=X", "GBPINR=X"]
    },
    "Indices": {
        "Large Cap": ["^BSESN", "^NSEI"],
        "Mid Cap": ["BSE-MIDCAP.BO", "^NSEMDCP50"],
        "Small Cap": ["BSE-SMLCAP.BO"],
        "Sectorial Indices": ["^NSEBANK", "^CNXIT", "^CNXAUTO", "^CNXFMCG", "^CNXMETAL", "^CNXPHARMA", "^CNXREALTY"]
    },
    "Indian Equities": {
        "Financials": ["HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "KOTAKBANK.NS", "AXISBANK.NS"],
        "IT": ["TCS.NS", "INFY.NS", "HCLTECH.NS", "WIPRO.NS", "TECHM.NS"],
        "Energy": ["RELIANCE.NS", "NTPC.NS", "POWERGRID.NS"],
        "Automobile": ["MARUTI.NS", "M&M.NS", "TMCV.NS", "TMPV.NS"]
    },
    "Cryptocurrencies": {
        "Crypto": ["BTC-USD", "ETH-USD", "XRP-USD"]
    },
    "Mutual Funds": {
        "Large Cap": [],
        "Mid Cap": [],
        "Small Cap": [],
        "Flexi Cap": [],
        "Fund House": []
    }
};

// Table header HTML for stock tabs vs MF tab
const STOCK_TABLE_HEAD = `<tr>
    <th>Sym</th><th>Company</th>
    <th class="right-align">Price</th><th class="right-align">Change</th>
    <th class="right-align">52W H</th>
    <th class="right-align">52W L</th><th class="right-align">Δ 52W H</th>
    <th></th></tr>`;

const MF_TABLE_HEAD = `<tr>
    <th class="mf-cb-cell"></th>
    <th>Code</th><th>Scheme</th>
    <th class="right-align">NAV (₹)</th>
    <th class="right-align">Change</th>
    <th class="right-align">1Y CAGR</th><th class="right-align">3Y CAGR</th>
    <th class="right-align">52W H</th><th class="right-align">52W L</th><th class="right-align">Δ 52W H</th>
    <th></th></tr>`;

// Deep merge local storage with default state to ensure we always have the defaults
let savedState = JSON.parse(localStorage.getItem('vanguardState')) || {};
let appState = {};

Object.keys(defaultState).forEach(mainTab => {
    appState[mainTab] = {};
    const savedSubTabs = savedState[mainTab] || {};
    const defaultSubTabs = defaultState[mainTab];

    // Load all saved tabs first
    Object.keys(savedSubTabs).forEach(subTab => {
        appState[mainTab][subTab] = [...savedSubTabs[subTab]];
    });

    // Ensure default tabs and default symbols are completely present
    Object.keys(defaultSubTabs).forEach(subTab => {
        if (!appState[mainTab][subTab]) {
            appState[mainTab][subTab] = [];
        }
        // inject missing defaults
        defaultSubTabs[subTab].forEach(sym => {
            if (!appState[mainTab][subTab].includes(sym)) {
                appState[mainTab][subTab].push(sym);
            }
        });
    });
});

let activeMainTab = "Overview";
let activeSubTab = Object.keys(appState[activeMainTab])[0];

const mainTabsContainer = document.getElementById('main-tabs-container');
const subTabsContainer = document.getElementById('sub-tabs-container');
const tableBody = document.getElementById('table-body');
const tableHead = document.getElementById('table-head');
const mfControls = document.getElementById('mf-controls');
const amcSelect = document.getElementById('amc-select');
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
            if (mainTab === 'Overview') {
                activeSubTab = 'Market';
            } else if (subTabs.length > 0 && !appState[activeMainTab][activeSubTab]) {
                activeSubTab = subTabs[0];
            }
            renderTabs();
            fetchQuotes();
        };
        mainTabsContainer.appendChild(btn);
    });

    // Render Sub Tabs
    subTabsContainer.innerHTML = '';
    if (activeMainTab === 'Overview') return;
    const subTabs = Object.keys(appState[activeMainTab] || {});
    subTabs.forEach(subTab => {
        const btn = document.createElement('button');
        btn.className = `tab-btn ${subTab === activeSubTab ? 'active' : ''}`;
        btn.textContent = subTab;
        btn.title = "Double click to rename custom tabs";

        btn.onclick = () => {
            activeSubTab = subTab;
            renderTabs();
            fetchQuotes();
        };

        const isDefaultTab = defaultState[activeMainTab] && defaultState[activeMainTab].hasOwnProperty(subTab);
        if (!isDefaultTab) {
            btn.ondblclick = () => {
                const newName = prompt("Rename sub-tab:", subTab);
                if (newName && newName.trim() !== "" && newName !== subTab) {
                    if (appState[activeMainTab][newName]) {
                        alert("Tab already exists!");
                        return;
                    }
                    appState[activeMainTab][newName] = appState[activeMainTab][subTab];
                    delete appState[activeMainTab][subTab];
                    activeSubTab = newName;
                    saveState();
                    renderTabs();
                    fetchQuotes();
                }
            };
        }
        subTabsContainer.appendChild(btn);
    });

}

function formatVal(val, currency = 'INR') {
    const locale = currency === 'INR' ? 'en-IN' : 'en-US';
    const formatter = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    // Remove the currency symbol if we just want the number, 
    // but the user might prefer seeing it? Actually, the table header 
    // usually has it. But with multi-currency, we should probably 
    // show it in the cell.
    return formatter.format(val);
}

function getColorClass(val) {
    if (val > 0) return 'val-green';
    if (val < 0) return 'val-red';
    return 'val-neutral';
}

async function fetchQuotes() {
    if (activeMainTab === 'Mutual Funds') {
        await fetchMFData();
        return;
    }

    // Restore stock table headers when switching away from MF tab
    tableHead.innerHTML = STOCK_TABLE_HEAD;
    mfControls.style.display = 'none';

    let symbols = appState[activeMainTab]?.[activeSubTab] || [];

    // Manage Overview extras visibility
    const overviewExtras = document.getElementById('overview-extras');
    if (activeMainTab === 'Overview') {
        overviewExtras.classList.add('active');
        fetchGeneralNews();

    } else {
        overviewExtras.classList.remove('active');
    }

    if (symbols.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 2rem; color: var(--text-secondary);">No symbols in this tab.</td></tr>`;
        return;
    }

    loadingOverlay.classList.add('active');

    try {
        const queryParams = encodeURIComponent(symbols.join(','));
        const response = await fetch(`/api/quotes?symbols=${queryParams}`);
        if (!response.ok) throw new Error('Network error');
        let quotes = await response.json();


        // 2. Filter quotes for the actual table (only show what's in the sub-tab)
        const tableSymbols = appState[activeMainTab]?.[activeSubTab] || [];
        const tableQuotes = quotes.filter(q => tableSymbols.includes(q.symbol));

        // Sort table quotes
        const symbolsMap = new Map(tableSymbols.map((s, i) => [s, i]));
        tableQuotes.sort((a, b) => (symbolsMap.get(a.symbol) ?? 999) - (symbolsMap.get(b.symbol) ?? 999));

        const currentRows = Array.from(tableBody.querySelectorAll('tr:not(.chart-row)'));
        const currentSymbols = currentRows.map(r => r.getAttribute('data-symbol'));
        const needsStructuralUpdate = JSON.stringify(currentSymbols) !== JSON.stringify(tableSymbols);

        if (needsStructuralUpdate) {
            tableBody.innerHTML = '';
            tableQuotes.forEach((q) => {
                tableBody.appendChild(createRow(q));
            });
        } else {
            tableQuotes.forEach((q) => {
                const tr = tableBody.querySelector(`tr[data-symbol="${q.symbol}"]`);
                if (tr) updateRow(tr, q);
            });
        }
    } catch (error) {
        console.error("Error fetching data:", error);
    } finally {
        loadingOverlay.classList.remove('active');
    }
}

function escapeAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderGeneralNews(news) {
    const content = document.getElementById('breaking-news-content');
    if (news.length === 0) {
        content.innerHTML = '<p style="color:var(--text-secondary); padding:1rem;">No news found.</p>';
        return;
    }

    content.innerHTML = news.map(item => `
        <a href="${item.link}" target="_blank" class="news-sidebar-item"
           data-full-title="${escapeAttr(item.title)}"
>
            <div class="news-sidebar-headline">${item.title}</div>
            <div class="news-sidebar-meta">
                <span class="publisher">${item.publisher}</span>
                <span>${item.date || 'Just now'}</span>
            </div>
        </a>
    `).join('');
}

function createRow(q) {
    const tr = document.createElement('tr');
    tr.setAttribute('data-symbol', q.symbol);
    updateRow(tr, q);
    tr.addEventListener('click', (e) => {
        if (e.target.closest('.remove-btn')) return;
        toggleChart(q.symbol, tr);
    });
    return tr;
}

function updateRow(tr, q) {
    const changeClass = getColorClass(q.change);
    const deltaHigh = q.fiftyTwoWeekHigh !== 0 ? ((q.currentPrice - q.fiftyTwoWeekHigh) / q.fiftyTwoWeekHigh) * 100 : 0;
    const deltaClass = getColorClass(deltaHigh);
    const signStr = q.change > 0 ? '+' : '';
    const deltaSignStr = deltaHigh > 0 ? '+' : '';

    const isDefaultSymbol = defaultState[activeMainTab]?.[activeSubTab]?.includes(q.symbol);
    const removeBtnHtml = isDefaultSymbol ?
        '<td></td>' :
        `<td><button class="remove-btn" onclick="removeSymbol('${q.symbol}')">×</button></td>`;

    const dotHtml = activeMainTab === 'Overview'
        ? `<span class="market-dot market-dot-${getExchangeStatus(getSymbolExchange(q.symbol))}"></span>`
        : '';

    if (q.name === "Fallback") {
        tr.innerHTML = `
            <td class="symbol-col">${dotHtml}${q.symbol}</td>
            <td class="name-col val-red" colspan="6">Data Unavailable</td>
            ${removeBtnHtml}
        `;
    } else {
        tr.innerHTML = `
            <td class="symbol-col">${dotHtml}${q.symbol}</td>
            <td class="name-col">${q.name}</td>
            <td class="right-align price-col">${formatVal(q.currentPrice, q.currency)}</td>
            <td class="right-align price-col ${changeClass}">${signStr}${formatVal(q.change, q.currency)} <span style="opacity:0.7">${signStr}${q.percentChange.toFixed(2)}%</span></td>
            <td class="right-align name-col">${formatVal(q.fiftyTwoWeekHigh, q.currency)}</td>
            <td class="right-align name-col">${formatVal(q.fiftyTwoWeekLow, q.currency)}</td>
            <td class="right-align price-col ${deltaClass}">${deltaSignStr}${deltaHigh.toFixed(2)}%</td>
            ${removeBtnHtml}
        `;
    }
}

let activeChartSymbol = null;

async function toggleChart(symbol, tr) {
    const existingChartRow = tr.nextElementSibling;
    if (existingChartRow && existingChartRow.classList.contains('chart-row')) {
        existingChartRow.remove();
        activeChartSymbol = null;
        return;
    }

    // Remove any other active chart rows
    document.querySelectorAll('.chart-row').forEach(row => row.remove());

    const chartRow = document.createElement('tr');
    chartRow.className = 'chart-row';
    const canvasId = `chart-${symbol.replace(/[^a-zA-Z0-9]/g, '-')}`;

    chartRow.innerHTML = `
        <td colspan="9">
            <div class="details-grid">
                <div class="chart-container">
                    <div class="range-selector">
                        <button class="range-btn" onclick="updateChart('${symbol}', '1d', '${canvasId}')">1D</button>
                        <button class="range-btn" onclick="updateChart('${symbol}', '5d', '${canvasId}')">5D</button>
                        <button class="range-btn" onclick="updateChart('${symbol}', '1mo', '${canvasId}')">1M</button>
                        <button class="range-btn" onclick="updateChart('${symbol}', '3mo', '${canvasId}')">3M</button>
                        <button class="range-btn active" onclick="updateChart('${symbol}', '1y', '${canvasId}')">1Y</button>
                    </div>
                    <div id="loading-${canvasId}" class="chart-loading">
                        <div class="spinner" style="width:24px; height:24px; margin-right:10px; margin-bottom:0;"></div>
                        Loading 1-Year History...
                    </div>
                    <canvas id="${canvasId}" style="display:none;"></canvas>
                </div>
                <div class="news-section" id="news-${canvasId}">
                    <div class="news-title">Related News</div>
                    <div class="chart-loading">
                        <div class="spinner" style="width:20px; height:20px; margin-right:10px; margin-bottom:0;"></div>
                        Fetching News...
                    </div>
                </div>
            </div>
        </td>
    `;
    tr.after(chartRow);
    activeChartSymbol = symbol;

    // Initial Chart and News Fetch
    updateChart(symbol, '1y', canvasId);

    // Fetch News Data (passing name for Google News search)
    const companyName = tr.querySelector('.name-col').textContent.trim();
    fetch(`/api/news?symbol=${encodeURIComponent(symbol)}&name=${encodeURIComponent(companyName)}`)
        .then(r => r.json())
        .then(newsData => renderNews(newsData, canvasId));
}

const chartCache = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function updateChart(symbol, range, canvasId) {
    const loading = document.getElementById(`loading-${canvasId}`);
    const canvas = document.getElementById(canvasId);

    // Update active button state
    const container = loading.parentElement;
    container.querySelectorAll('.range-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase().includes(range.replace('mo', 'm').toLowerCase()));
    });

    // Check Cache
    const cacheKey = `${symbol}-${range}`;
    const cachedEntry = chartCache[cacheKey];
    const now = Date.now();

    if (cachedEntry && (now - cachedEntry.timestamp < CACHE_DURATION)) {
        console.log(`Using cached data for ${cacheKey}`);
        processAndRenderChart(cachedEntry.data, symbol, range, canvasId);
        return;
    }

    loading.style.display = 'flex';
    loading.innerHTML = `<div class="spinner" style="width:24px; height:24px; margin-right:10px; margin-bottom:0;"></div> Loading ${range} History...`;
    canvas.style.display = 'none';

    try {
        const response = await fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`);
        const chartData = await response.json();

        if (chartData.chart && chartData.chart.result && chartData.chart.result[0]) {
            // Save to Cache
            chartCache[cacheKey] = {
                timestamp: now,
                data: chartData
            };
            processAndRenderChart(chartData, symbol, range, canvasId);
        }
    } catch (error) {
        loading.innerHTML = `<span style="color:var(--val-red)">Error loading chart data.</span>`;
    }
}

function processAndRenderChart(chartData, symbol, range, canvasId) {
    const loading = document.getElementById(`loading-${canvasId}`);
    const canvas = document.getElementById(canvasId);
    const result = chartData.chart.result[0];
    const timestamps = result.timestamp;
    const prices = result.indicators.quote[0].close;

    const labels = timestamps.map(ts => {
        const date = new Date(ts * 1000);
        if (range === '1d' || range === '5d') {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: range === '1y' ? '2-digit' : undefined });
    });

    // Robust trend detection for Indicies and Stocks
    const validPrices = prices.filter(p => p !== null && p !== undefined);
    let isUp = true;
    if (validPrices.length >= 2) {
        const firstPrice = validPrices[0];
        const lastPrice = validPrices[validPrices.length - 1];
        isUp = lastPrice >= firstPrice;
    }

    renderChart(canvasId, labels, prices, symbol, range, isUp);
    loading.style.display = 'none';
}

function renderNews(newsData, canvasId) {
    const newsContainer = document.getElementById(`news-${canvasId}`);
    let sentimentHtml = '';
    if (newsData && newsData.lexicon) {
        const l = newsData.lexicon;
        const badgeClass = `badge-${l.recommendation.toLowerCase()}`;
        sentimentHtml = `
            <div class="sentiment-card">
                <div class="sentiment-header">
                    <span class="sentiment-title">AI Market Insights (Beta)</span>
                    <span class="sentiment-badge ${badgeClass}">${l.recommendation}</span>
                </div>
                <div class="sentiment-summary">${l.summary}</div>
            </div>
        `;
    }

    if (newsData && newsData.news && newsData.news.length > 0) {
        let newsHtml = sentimentHtml + '<div class="news-title">Related News</div>';
        newsData.news.forEach(item => {
            newsHtml += `
                <a href="${item.link}" target="_blank" class="news-item"
                   data-full-title="${escapeAttr(item.title)}"
        >
                    <div class="news-headline">${item.title}</div>
                    <div class="news-meta">
                        <span>${item.publisher}</span>
                        <span>${item.date}</span>
                    </div>
                </a>
            `;
        });
        newsContainer.innerHTML = newsHtml;
    } else {
        newsContainer.innerHTML = sentimentHtml + '<div class="news-title">Related News</div><div style="color:var(--text-secondary); font-size:0.85rem; padding:1rem;">No news available for this symbol.</div>';
    }
}

function renderChart(canvasId, labels, prices, symbol, range, isUp) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Ensure canvas is visible FIRST so Chart.js can calculate dimensions
    canvas.style.display = 'block';

    // Wait for the next paint cycle to ensure visibility is acknowledged
    requestAnimationFrame(() => {
        const ctx = canvas.getContext('2d');

        // Destroy existing chart if any
        const existingChart = Chart.getChart(canvasId);
        if (existingChart) existingChart.destroy();

        const trendColor = isUp ? '#10b981' : '#ef4444';
        const fillAlpha = '33'; // 0.2 roughly in hex

        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, trendColor + fillAlpha);
        gradient.addColorStop(1, trendColor + '00');

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `${symbol} Price`,
                    data: prices,
                    borderColor: trendColor,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: true,
                    backgroundColor: gradient,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#94a3b8',
                        bodyColor: '#f1f5f9',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: { display: false },
                        ticks: {
                            color: '#64748b',
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: (range === '1d' || range === '5d') ? 12 : 8
                        }
                    },
                    y: {
                        display: true,
                        beginAtZero: false,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: '#64748b',
                            callback: function (value) {
                                if (value >= 1000) return (value / 1000).toFixed(1) + 'k';
                                return value.toLocaleString('en-IN');
                            }
                        }
                    }
                }
            }
        });
    });
}

window.removeSymbol = function (symbol) {
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

            if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
            const textResponse = await res.text();

            let data;
            try {
                data = JSON.parse(textResponse);
            } catch (e) {
                if (textResponse.includes("Too Many Requests")) {
                    searchResults.innerHTML = '<div class="search-item" style="color:red; text-align:center;">Yahoo API Rate Limited. Try again later.</div>';
                    searchResults.classList.add('active');
                } else {
                    console.error("Invalid response format:", textResponse);
                }
                return;
            }

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

const REFRESH_INTERVAL = 60000; // 60 seconds

function fetchGeneralNews() {
    const content = document.getElementById('breaking-news-content');
    content.innerHTML = `
        <div class="chart-loading">
            <div class="spinner" style="width:20px; height:20px; margin-right:10px; margin-bottom:0;"></div>
            Syncing Global Feeds...
        </div>
    `;

    fetch('/api/news')
        .then(r => r.json())
        .then(data => renderGeneralNews(data.news || []))
        .catch(() => {
            content.innerHTML = '<p style="color:var(--val-red); padding:1rem;">Sync Error.</p>';
        });

}

// Exchange open/closed helpers used for market dots
const EXCHANGE_HOURS = {
    'NSE':   { tz: 'Asia/Kolkata',       open: 9.25, close: 15.5 },
    'BSE':   { tz: 'Asia/Kolkata',       open: 9.25, close: 15.5 },
    'NYSE':  { tz: 'America/New_York',   open: 9.5,  close: 16   },
    'NASDAQ':{ tz: 'America/New_York',   open: 9.5,  close: 16   },
    'LSE':   { tz: 'Europe/London',      open: 8,    close: 16.5 },
    'TSE':   { tz: 'Asia/Tokyo',         open: 9,    close: 15   },
    'CRYPTO':{ tz: 'UTC',               open: 0,    close: 24   },
};

const SYMBOL_EXCHANGE_MAP = {
    '^BSESN': 'BSE', '^NSEI': 'NSE', '^NSEBANK': 'NSE', '^NSEMDCP50': 'NSE',
    '^CNXIT': 'NSE', '^CNXAUTO': 'NSE', '^CNXFMCG': 'NSE', '^CNXMETAL': 'NSE',
    '^CNXPHARMA': 'NSE', '^CNXREALTY': 'NSE', 'BSE-MIDCAP.BO': 'BSE', 'BSE-SMLCAP.BO': 'BSE',
    '^DJI': 'NYSE', '^GSPC': 'NYSE', '^IXIC': 'NASDAQ',
    '^FTSE': 'LSE', '^N225': 'TSE',
    'BTC-USD': 'CRYPTO', 'ETH-USD': 'CRYPTO', 'XRP-USD': 'CRYPTO',
};

function getExchangeStatus(exchange) {
    const ex = EXCHANGE_HOURS[exchange];
    if (!ex) return 'closed';
    if (exchange === 'CRYPTO') return 'open';
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { timeZone: ex.tz, hour12: false, hour: 'numeric', minute: 'numeric' });
    const [h, m] = timeStr.split(':').map(Number);
    const t = h + m / 60;
    // Weekend check
    const dayStr = now.toLocaleDateString('en-US', { timeZone: ex.tz, weekday: 'short' });
    if (dayStr === 'Sat' || dayStr === 'Sun') return 'closed';
    if (t >= ex.open && t <= ex.close) return 'open';
    if (t >= ex.open - 1 && t < ex.open) return 'pre';
    return 'closed';
}

function getSymbolExchange(symbol) {
    if (SYMBOL_EXCHANGE_MAP[symbol]) return SYMBOL_EXCHANGE_MAP[symbol];
    if (symbol.endsWith('.NS')) return 'NSE';
    if (symbol.endsWith('.BO')) return 'BSE';
    if (symbol.endsWith('-USD') || symbol.endsWith('-USDT')) return 'CRYPTO';
    if (symbol.endsWith('=X') || symbol.endsWith('=F')) return 'CRYPTO'; // FX/Commodities always available
    return 'NYSE';
}

// Ticker strip symbols and their display labels
const TICKER_SYMBOLS = ['^BSESN', '^NSEI', 'USDINR=X', 'CL=F', 'BTC-USD'];
const TICKER_LABELS  = { 'USDINR=X': 'USD/INR', 'CL=F': 'Crude', 'BTC-USD': 'Bitcoin', '^BSESN': 'Sensex', '^NSEI': 'Nifty' };

async function updateMarketStatus() {
    const bar = document.getElementById('market-status-bar');
    try {
        const res = await fetch('/api/quotes?symbols=' + encodeURIComponent(TICKER_SYMBOLS.join(',')));
        const rawQuotes = await res.json();
        const quoteMap = Object.fromEntries(rawQuotes.map(q => [q.symbol, q]));
        const quotes = TICKER_SYMBOLS.map(s => quoteMap[s]).filter(Boolean);
        bar.innerHTML = quotes.map(q => {
            if (q.name === 'Fallback') return '';
            const label = TICKER_LABELS[q.symbol] || q.symbol;
            const cls = q.change >= 0 ? 'positive' : 'negative';
            const arrow = q.change >= 0 ? '▲' : '▼';
            const sign = q.change >= 0 ? '+' : '';
            return `<div class="ticker-item">
                <span class="ticker-name">${label}</span>
                <span class="ticker-price">${formatVal(q.currentPrice, q.currency)}</span>
                <span class="ticker-change ${cls}">${arrow} ${sign}${q.percentChange.toFixed(2)}%</span>
            </div>`;
        }).join('');
    } catch (e) {
        bar.innerHTML = '';
    }
}



// Collapsible toggle for News & Events sections
window.toggleSection = function (sectionId) {
    const body = document.getElementById(sectionId);
    const chevron = document.getElementById('chevron-' + sectionId);
    if (body.classList.contains('open')) {
        body.classList.remove('open');
        chevron.classList.add('collapsed');
    } else {
        body.classList.add('open');
        chevron.classList.remove('collapsed');
    }
}

// =============================================================================
// Mutual Funds
// =============================================================================

let amcListLoaded = false;

async function fetchMFData() {
    tableHead.innerHTML = MF_TABLE_HEAD;
    document.getElementById('overview-extras').classList.remove('active');

    if (activeSubTab === 'Fund House') {
        mfControls.style.display = 'flex';
        if (!amcListLoaded) await loadAmcList();
        const selected = amcSelect.value;
        if (selected) {
            await fetchMFHouseData(selected);
        } else {
            tableBody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:2rem; color:var(--text-secondary);">Select a fund house from the dropdown above.</td></tr>`;
        }
        loadingOverlay.classList.remove('active');
        return;
    }

    mfControls.style.display = 'none';
    loadingOverlay.classList.add('active');
    try {
        const cat = activeSubTab.toLowerCase().replace(' ', '-');
        const resp = await fetch(`/api/mf/category?cat=${cat}`);
        if (!resp.ok) throw new Error('Network error');
        const funds = await resp.json();
        renderMFTable(funds);
    } catch (e) {
        console.error('MF fetch error:', e);
        tableBody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:2rem; color:var(--val-red);">Failed to load fund data. Check server connection.</td></tr>`;
    } finally {
        loadingOverlay.classList.remove('active');
    }
}

async function fetchMFHouseData(amc) {
    loadingOverlay.classList.add('active');
    try {
        const resp = await fetch(`/api/mf/house?amc=${encodeURIComponent(amc)}`);
        if (!resp.ok) throw new Error('Network error');
        const funds = await resp.json();
        renderMFTable(funds);
    } catch (e) {
        console.error('MF house fetch error:', e);
        tableBody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:2rem; color:var(--val-red);">Failed to load fund data.</td></tr>`;
    } finally {
        loadingOverlay.classList.remove('active');
    }
}

async function loadAmcList() {
    try {
        const resp = await fetch('/api/mf/houses');
        if (!resp.ok) return;
        const houses = await resp.json();
        amcSelect.innerHTML = '<option value="">Select a fund house...</option>';
        houses.forEach(h => {
            const opt = document.createElement('option');
            opt.value = h;
            opt.textContent = h;
            amcSelect.appendChild(opt);
        });
        amcListLoaded = true;
    } catch (e) {
        console.error('Failed to load AMC list:', e);
    }
}

function renderMFTable(funds) {
    selectedMFunds.clear();
    updateCompareBar();
    tableBody.innerHTML = '';
    if (!funds || funds.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:2rem; color:var(--text-secondary);">No funds found.</td></tr>`;
        return;
    }
    funds.forEach(mf => tableBody.appendChild(createMFRow(mf)));
}

function fmtCagr(v) {
    if (!v) return '<span style="color:var(--text-secondary)">—</span>';
    const cls = v > 0 ? 'val-green' : 'val-red';
    return `<span class="${cls}">${v > 0 ? '+' : ''}${v.toFixed(2)}%</span>`;
}

function createMFRow(mf) {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    const changeClass = getColorClass(mf.change);
    const sign = mf.change > 0 ? '+' : '';

    const navFmt = new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 4, maximumFractionDigits: 4
    }).format(mf.latestNav);

    const changeFmt = mf.change !== 0
        ? `${sign}${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(mf.change)}`
        : '—';
    const pctFmt = mf.percentChange !== 0 ? `${sign}${mf.percentChange.toFixed(2)}%` : '—';

    const navFmtShort = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const high52Fmt = mf.high52w ? `₹${navFmtShort.format(mf.high52w)}` : '—';
    const low52Fmt  = mf.low52w  ? `₹${navFmtShort.format(mf.low52w)}`  : '—';
    const deltaHighVal = mf.deltaHigh != null ? mf.deltaHigh : 0;
    const deltaHighFmt = mf.high52w ? `${deltaHighVal.toFixed(2)}%` : '—';
    const deltaHighClass = deltaHighVal >= 0 ? 'val-green' : 'val-red';

    // Strip plan/option suffix for cleaner display
    const displayName = mf.schemeName
        .replace(/\s*-\s*(Direct Plan|Regular Plan|Growth Option|Growth|IDCW|Dividend)\s*/gi, ' ')
        .replace(/\s+/g, ' ').trim();

    tr.innerHTML = `
        <td class="symbol-col" style="font-size:0.8rem; color:var(--text-secondary);">${mf.schemeCode}</td>
        <td class="mf-scheme-name" title="${escapeAttr(mf.schemeName)}">${displayName}</td>
        <td class="right-align price-col">₹${navFmt}</td>
        <td class="right-align price-col ${changeClass}">${changeFmt} <span style="opacity:0.7">${pctFmt}</span></td>
        <td class="right-align price-col">${fmtCagr(mf.cagr1y)}</td>
        <td class="right-align price-col">${fmtCagr(mf.cagr3y)}</td>
        <td class="right-align price-col">${high52Fmt}</td>
        <td class="right-align price-col">${low52Fmt}</td>
        <td class="right-align price-col ${deltaHighClass}">${deltaHighFmt}</td>
        <td></td>
    `;

    // Prepend checkbox cell
    const cbTd = document.createElement('td');
    cbTd.className = 'mf-cb-cell';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selectedMFunds.has(String(mf.schemeCode));
    cb.addEventListener('change', () => handleMFCheckboxChange(mf, cb));
    cbTd.appendChild(cb);
    tr.insertBefore(cbTd, tr.firstChild);

    tr.addEventListener('click', (e) => {
        if (e.target.closest('.mf-cb-cell')) return;
        toggleMFDetails(mf, tr);
    });
    return tr;
}

amcSelect.addEventListener('change', async (e) => {
    if (e.target.value) {
        await fetchMFHouseData(e.target.value);
    } else {
        tableBody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:2rem; color:var(--text-secondary);">Select a fund house from the dropdown above.</td></tr>`;
    }
});

document.getElementById('mf-compare-btn').addEventListener('click', openCompareModal);
document.getElementById('mf-compare-clear').addEventListener('click', () => {
    selectedMFunds.clear();
    document.querySelectorAll('.mf-cb-cell input[type="checkbox"]').forEach(cb => cb.checked = false);
    updateCompareBar();
});
document.getElementById('mf-compare-close').addEventListener('click', closeCompareModal);

// ── MF row expansion ─────────────────────────────────────────────────

const MF_COL_COUNT = 11;

// Fund comparison state
const selectedMFunds = new Map(); // schemeCode (string) → mf object
const COMPARE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ef4444'];
const COMPARE_MAX = 5;
let compareFundsData = []; // holds { mf, chartData } for the open modal
let compareRange = '1y';
let handleCompareEsc = null;

function toggleMFDetails(mf, tr) {
    const existing = tr.nextElementSibling;
    if (existing && existing.classList.contains('chart-row')) {
        existing.remove();
        return;
    }
    document.querySelectorAll('.chart-row').forEach(r => r.remove());

    const canvasId = `mf-chart-${mf.schemeCode}`;
    const detailRow = document.createElement('tr');
    detailRow.className = 'chart-row';
    detailRow.innerHTML = `
        <td colspan="${MF_COL_COUNT}">
            <div class="mf-detail-panel">
                <div class="mf-chart-section">
                    <div class="range-selector">
                        <button class="range-btn" onclick="updateMFChart(${mf.schemeCode},'1d','${canvasId}')">1D</button>
                        <button class="range-btn" onclick="updateMFChart(${mf.schemeCode},'5d','${canvasId}')">5D</button>
                        <button class="range-btn" onclick="updateMFChart(${mf.schemeCode},'3mo','${canvasId}')">3M</button>
                        <button class="range-btn" onclick="updateMFChart(${mf.schemeCode},'6mo','${canvasId}')">6M</button>
                        <button class="range-btn active" onclick="updateMFChart(${mf.schemeCode},'1y','${canvasId}')">1Y</button>
                    </div>
                    <div id="loading-${canvasId}" class="chart-loading">
                        <div class="spinner" style="width:22px;height:22px;margin-right:10px;margin-bottom:0;"></div>
                        Loading NAV History...
                    </div>
                    <canvas id="${canvasId}" style="display:none; height:260px;"></canvas>
                </div>
                <div class="mf-metrics-section">
                    ${renderMFReturnsTable(mf)}
                    ${renderMFRiskTable(mf)}
                </div>
            </div>
        </td>
    `;
    tr.after(detailRow);
    fetchMFChart(mf.schemeCode, canvasId, mf.schemeName);
}

function renderMFReturnsTable(mf) {
    const f = (v) => v
        ? `<span class="${v > 0 ? 'val-green' : 'val-red'}">${v > 0 ? '+' : ''}${v.toFixed(2)}%</span>`
        : '<span class="mf-na">—</span>';
    const rows = [
        ['1 Week',          f(mf.ret1w)],
        ['1 Month',         f(mf.ret1m)],
        ['3 Months',        f(mf.ret3m)],
        ['6 Months',        f(mf.ret6m)],
        ['1Y CAGR',         f(mf.cagr1y)],
        ['3Y CAGR',         f(mf.cagr3y)],
        ['5Y CAGR',         f(mf.cagr5y)],
        ['Since Inception', f(mf.cagrSinceInception)],
    ];
    return `
        <div class="mf-metrics-block">
            <div class="mf-metrics-title">Returns</div>
            <table class="mf-metrics-table">
                ${rows.map(([label, val]) =>
                    `<tr><td class="mf-metric-label">${label}</td><td class="mf-metric-value">${val}</td></tr>`
                ).join('')}
            </table>
        </div>`;
}

function renderMFRiskTable(mf) {
    const fp = (v) => v ? `${v.toFixed(2)}%` : '<span class="mf-na">—</span>';
    const fr = (v) => v
        ? `<span class="${v >= 1 ? 'val-green' : v > 0 ? '' : 'val-red'}">${v.toFixed(2)}</span>`
        : '<span class="mf-na">—</span>';
    const dd = mf.maxDrawdown
        ? `<span class="val-red">${mf.maxDrawdown.toFixed(2)}%</span>`
        : '<span class="mf-na">—</span>';
    const rows = [
        ['Volatility',     fp(mf.volatility)],
        ['Max Drawdown',   dd],
        ['Downside Dev.',  fp(mf.downsideDeviation)],
        ['Sharpe',         fr(mf.sharpe)],
        ['Sortino',        fr(mf.sortino)],
    ];
    return `
        <div class="mf-metrics-block">
            <div class="mf-metrics-title">Risk</div>
            <table class="mf-metrics-table">
                ${rows.map(([label, val]) =>
                    `<tr><td class="mf-metric-label">${label}</td><td class="mf-metric-value">${val}</td></tr>`
                ).join('')}
            </table>
        </div>`;
}

const mfChartCache = {};
const MF_RANGE_RECORDS = { '1d': 2, '5d': 5, '3mo': 63, '6mo': 126, '1y': 252 };
const MF_RANGE_LABEL   = { '1d': '1D', '5d': '5D', '3mo': '3M', '6mo': '6M', '1y': '1Y' };

async function fetchMFChart(schemeCode, canvasId, schemeName) {
    const loading = document.getElementById(`loading-${canvasId}`);
    const cacheKey = `mf-${schemeCode}`;
    if (mfChartCache[cacheKey]) {
        updateMFChart(schemeCode, '1y', canvasId);
        return;
    }
    try {
        const resp = await fetch(`/api/mf/chart?code=${schemeCode}`);
        if (!resp.ok) throw new Error('Network error');
        const data = await resp.json();
        if (!data.dates || data.dates.length === 0) {
            if (loading) loading.innerHTML = '<span style="color:var(--val-red)">No chart data.</span>';
            return;
        }
        // Store schemeName alongside data for use by updateMFChart
        mfChartCache[cacheKey] = { ...data, schemeName };
        updateMFChart(schemeCode, '1y', canvasId);
    } catch (e) {
        if (loading) loading.innerHTML = '<span style="color:var(--val-red)">Error loading chart.</span>';
    }
}

function updateMFChart(schemeCode, range, canvasId) {
    const cacheKey = `mf-${schemeCode}`;
    const cached = mfChartCache[cacheKey];
    if (!cached) return; // still loading — fetchMFChart will call updateMFChart when ready

    // Update active button
    const canvas = document.getElementById(canvasId);
    if (canvas) {
        const section = canvas.closest('.mf-chart-section');
        if (section) {
            const label = MF_RANGE_LABEL[range];
            section.querySelectorAll('.range-btn').forEach(btn => {
                btn.classList.toggle('active', btn.textContent === label);
            });
        }
    }

    // Slice data (newest-first) then reverse to oldest→newest for chart
    const count = MF_RANGE_RECORDS[range] || 252;
    const dates = cached.dates.slice(0, count).reverse();
    const navs  = cached.navs.slice(0, count).reverse();

    const labels = dates.map(d => {
        const [day, month, year] = d.split('-');
        return new Date(+year, +month - 1, +day)
            .toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
    });

    const isUp = navs[navs.length - 1] >= navs[0];
    renderChart(canvasId, labels, navs, cached.schemeName || '', range, isUp);
    const loading = document.getElementById(`loading-${canvasId}`);
    if (loading) loading.style.display = 'none';
}

// News hover tooltip
const newsTooltip = document.createElement('div');
newsTooltip.className = 'news-tooltip';
document.body.appendChild(newsTooltip);

function positionTooltip(clientX, clientY) {
    const margin = 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tw = newsTooltip.offsetWidth;
    const th = newsTooltip.offsetHeight;

    let left = clientX + margin;
    let top = clientY + margin;

    if (left + tw > vw - margin) left = clientX - tw - margin;
    if (top + th > vh - margin) top = clientY - th - margin;

    newsTooltip.style.left = Math.max(margin, left) + 'px';
    newsTooltip.style.top = Math.max(margin, top) + 'px';
}

document.addEventListener('mouseover', (e) => {
    const item = e.target.closest('.news-item, .news-sidebar-item');
    if (!item) return;
    const from = e.relatedTarget;
    if (from && item.contains(from)) return; // still inside, ignore child transitions

    const title = item.dataset.fullTitle || '';
    if (!title) return;

    newsTooltip.innerHTML = `<div class="news-tooltip-title">${title}</div>`;
    newsTooltip.classList.add('visible');
    positionTooltip(e.clientX, e.clientY);
});

document.addEventListener('mousemove', (e) => {
    if (newsTooltip.classList.contains('visible')) {
        positionTooltip(e.clientX, e.clientY);
    }
});

document.addEventListener('mouseout', (e) => {
    const item = e.target.closest('.news-item, .news-sidebar-item');
    if (!item) return;
    const to = e.relatedTarget;
    if (to && item.contains(to)) return; // still inside, ignore child transitions
    newsTooltip.classList.remove('visible');
});

// =============================================================================
// MF Fund Comparison
// =============================================================================

function handleMFCheckboxChange(mf, cb) {
    const code = String(mf.schemeCode);
    if (cb.checked) {
        if (selectedMFunds.size >= COMPARE_MAX) {
            cb.checked = false;
            return;
        }
        selectedMFunds.set(code, mf);
    } else {
        selectedMFunds.delete(code);
    }
    updateCompareBar();
}

function updateCompareBar() {
    const bar = document.getElementById('mf-compare-bar');
    const countEl = document.getElementById('mf-compare-count');
    const n = selectedMFunds.size;
    if (n >= 2) {
        bar.style.display = 'flex';
        countEl.textContent = `${n} fund${n > 1 ? 's' : ''} selected`;
    } else {
        bar.style.display = 'none';
    }
}

async function openCompareModal() {
    const modal = document.getElementById('mf-compare-modal');
    const body = document.getElementById('mf-compare-dialog-body');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    body.innerHTML = `<div class="chart-loading" style="height:200px"><div class="spinner"></div></div>`;

    const funds = Array.from(selectedMFunds.values());
    compareRange = '1y';

    // Fetch all chart histories (uses cache when available)
    try {
        await Promise.all(funds.map(mf => fetchMFChartData(mf.schemeCode, mf.schemeName)));
    } catch (e) {
        body.innerHTML = `<p style="color:var(--red);padding:2rem;">Failed to load chart data.</p>`;
        return;
    }

    compareFundsData = funds.map(mf => ({
        mf,
        chartData: mfChartCache[`mf-${mf.schemeCode}`] || null
    }));

    renderCompareModalContent(body);

    // Close on backdrop click
    document.querySelector('.mf-compare-backdrop').onclick = closeCompareModal;

    // Close on ESC
    handleCompareEsc = (e) => { if (e.key === 'Escape') closeCompareModal(); };
    document.addEventListener('keydown', handleCompareEsc);
}

function closeCompareModal() {
    document.getElementById('mf-compare-modal').style.display = 'none';
    document.body.style.overflow = '';
    const existing = Chart.getChart('mf-compare-canvas');
    if (existing) existing.destroy();
    if (handleCompareEsc) {
        document.removeEventListener('keydown', handleCompareEsc);
        handleCompareEsc = null;
    }
}

async function fetchMFChartData(schemeCode, schemeName) {
    const key = `mf-${schemeCode}`;
    if (mfChartCache[key]) return mfChartCache[key];
    const resp = await fetch(`/api/mf/chart?code=${schemeCode}`);
    if (!resp.ok) throw new Error('Network error');
    const data = await resp.json();
    mfChartCache[key] = { ...data, schemeName };
    return mfChartCache[key];
}

function renderCompareModalContent(body) {
    const rangeButtons = ['3mo', '6mo', '1y'].map(r =>
        `<button class="range-btn${r === compareRange ? ' active' : ''}" onclick="switchCompareRange('${r}')">${MF_RANGE_LABEL[r]}</button>`
    ).join('');

    body.innerHTML = `
        <div class="mf-compare-range-row">
            <div class="range-selector">${rangeButtons}</div>
            <span class="mf-compare-range-note">Normalized to 100 at start of period</span>
        </div>
        <div class="mf-compare-chart-wrap">
            <div id="mf-compare-chart-loading" class="chart-loading">
                <div class="spinner" style="width:22px;height:22px;margin-right:10px;margin-bottom:0;"></div>
                Building comparison...
            </div>
            <canvas id="mf-compare-canvas" style="display:none;"></canvas>
        </div>
        <div class="mf-compare-metrics-section">
            ${buildCompareMetricsTable(compareFundsData)}
        </div>
    `;

    renderCompareChart(compareFundsData, compareRange);
}

window.switchCompareRange = function (range) {
    compareRange = range;
    document.querySelectorAll('#mf-compare-dialog-body .range-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent === MF_RANGE_LABEL[range]);
    });
    renderCompareChart(compareFundsData, range);
};

function renderCompareChart(fundsData, range) {
    const loading = document.getElementById('mf-compare-chart-loading');
    const canvas = document.getElementById('mf-compare-canvas');
    if (!loading || !canvas) return;

    const count = MF_RANGE_RECORDS[range] || 252;
    const datasets = [];
    let sharedLabels = null;

    fundsData.forEach(({ mf, chartData }, i) => {
        if (!chartData || !chartData.dates || chartData.dates.length === 0) return;

        const slicedDates = chartData.dates.slice(0, count).reverse();
        const slicedNavs  = chartData.navs.slice(0, count).reverse();

        if (!sharedLabels) {
            sharedLabels = slicedDates.map(d => {
                const [day, month, year] = d.split('-');
                return new Date(+year, +month - 1, +day)
                    .toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
            });
        }

        const base = slicedNavs[0] || 1;
        const normalized = slicedNavs.map(v => parseFloat(((v / base) * 100).toFixed(2)));
        const color = COMPARE_COLORS[i % COMPARE_COLORS.length];
        const shortName = mf.schemeName
            .replace(/\s*-\s*(Direct Plan|Regular Plan|Growth Option|Growth|IDCW|Dividend)\s*/gi, ' ')
            .replace(/\s+/g, ' ').trim();

        datasets.push({
            label: shortName,
            data: normalized,
            borderColor: color,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: false,
            tension: 0.1
        });
    });

    if (datasets.length === 0) {
        loading.innerHTML = '<span style="color:var(--val-red)">Chart data unavailable.</span>';
        return;
    }

    loading.style.display = 'none';
    canvas.style.display = 'block';

    requestAnimationFrame(() => {
        const existing = Chart.getChart('mf-compare-canvas');
        if (existing) existing.destroy();

        new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { labels: sharedLabels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 600, easing: 'easeOutQuart' },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#94a3b8',
                            font: { size: 11, family: 'Inter' },
                            boxWidth: 20,
                            padding: 14
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#94a3b8',
                        bodyColor: '#f1f5f9',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            label: ctx => {
                                const val = ctx.parsed.y;
                                const gain = val - 100;
                                const sign = gain >= 0 ? '+' : '';
                                return `${ctx.dataset.label}: ${val.toFixed(2)} (${sign}${gain.toFixed(2)}%)`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: { display: false },
                        ticks: { color: '#64748b', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }
                    },
                    y: {
                        display: true,
                        beginAtZero: false,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: {
                            color: '#64748b',
                            callback: v => v.toFixed(0)
                        }
                    }
                }
            }
        });
    });
}

function buildCompareMetricsTable(fundsData) {
    const funds = fundsData.map(d => d.mf);

    const METRICS = [
        { section: 'Current' },
        { label: 'NAV (₹)',       field: 'latestNav',           lowerBetter: false, fmt: v => `₹${v.toFixed(4)}` },
        { label: 'Day Change %',  field: 'percentChange',       lowerBetter: false, fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(2)}%` },
        { section: 'Returns' },
        { label: '1 Week',        field: 'ret1w',               lowerBetter: false, fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(2)}%` },
        { label: '1 Month',       field: 'ret1m',               lowerBetter: false, fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(2)}%` },
        { label: '3 Months',      field: 'ret3m',               lowerBetter: false, fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(2)}%` },
        { label: '6 Months',      field: 'ret6m',               lowerBetter: false, fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(2)}%` },
        { label: '1Y CAGR',       field: 'cagr1y',              lowerBetter: false, fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(2)}%` },
        { label: '3Y CAGR',       field: 'cagr3y',              lowerBetter: false, fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(2)}%` },
        { label: '5Y CAGR',       field: 'cagr5y',              lowerBetter: false, fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(2)}%` },
        { section: 'Risk' },
        { label: 'Volatility',    field: 'volatility',          lowerBetter: true,  fmt: v => `${v.toFixed(2)}%` },
        { label: 'Max Drawdown',  field: 'maxDrawdown',         lowerBetter: true,  fmt: v => `${v.toFixed(2)}%` },
        { label: 'Downside Dev.', field: 'downsideDeviation',   lowerBetter: true,  fmt: v => `${v.toFixed(2)}%` },
        { label: 'Sharpe',        field: 'sharpe',              lowerBetter: false, fmt: v => v.toFixed(2) },
        { label: 'Sortino',       field: 'sortino',             lowerBetter: false, fmt: v => v.toFixed(2) },
    ];

    const colCount = funds.length + 1;

    const headerCols = funds.map((mf, i) => {
        const color = COMPARE_COLORS[i % COMPARE_COLORS.length];
        const short = mf.schemeName
            .replace(/\s*-\s*(Direct Plan|Regular Plan|Growth Option|Growth|IDCW|Dividend)\s*/gi, ' ')
            .replace(/\s+/g, ' ').trim();
        return `<th class="fund-col" style="color:${color};" title="${escapeAttr(mf.schemeName)}">${short}</th>`;
    }).join('');

    const rows = METRICS.map(m => {
        if (m.section) {
            return `<tr class="mf-compare-section-row"><td colspan="${colCount}">${m.section}</td></tr>`;
        }

        const rawVals = funds.map(f => {
            const v = f[m.field];
            return (v != null && !isNaN(v)) ? v : null;
        });
        const nonNull = rawVals.filter(v => v !== null);
        let bestVal = null;
        if (nonNull.length >= 2) {
            bestVal = m.lowerBetter ? Math.min(...nonNull) : Math.max(...nonNull);
        }

        const cells = funds.map((_, i) => {
            const v = rawVals[i];
            if (v === null) return `<td><span class="mf-na">—</span></td>`;
            const isBest = bestVal !== null && v === bestVal;
            const colorCls = (m.field !== 'latestNav' && m.field !== 'volatility' &&
                              m.field !== 'maxDrawdown' && m.field !== 'downsideDeviation')
                ? (v > 0 ? 'val-green' : v < 0 ? 'val-red' : '')
                : '';
            return `<td${isBest ? ' class="mf-compare-best"' : ''}><span class="${colorCls}">${m.fmt(v)}</span></td>`;
        }).join('');

        return `<tr><td>${m.label}</td>${cells}</tr>`;
    }).join('');

    return `
        <table class="mf-compare-metrics-table mf-compare-metrics-head">
            <thead><tr><th>Metric</th>${headerCols}</tr></thead>
        </table>
        <table class="mf-compare-metrics-table">
            <tbody>${rows}</tbody>
        </table>
    `;
}

// =============================================================================
// Live TV
// =============================================================================

const LIVE_CHANNELS = [
    { name: 'Bloomberg', embedUrl: 'https://www.youtube.com/embed/live_stream?channel=UCIALMKvObZNtJ6AmdCLP7Lg&autoplay=1&mute=1&rel=0' },
    { name: 'CNBC',      embedUrl: 'https://www.youtube.com/embed/live_stream?channel=UCvJJ_dzjViJCoLf5uKUTwoA&autoplay=1&mute=1&rel=0' },
];

function initLiveTV() {
    const container = document.getElementById('live-tv-channel-pills');
    container.innerHTML = LIVE_CHANNELS
        .map((ch, i) => `<button class="live-tv-channel-pill" onclick="setLiveTVChannel(${i}, this)">${ch.name}</button>`)
        .join('');
    setLiveTVChannel(0, container.firstElementChild);
}

window.setLiveTVChannel = function (idx, btn) {
    document.querySelectorAll('.live-tv-channel-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('live-tv-placeholder').style.display = 'none';
    const iframe = document.getElementById('live-tv-iframe');
    iframe.style.display = 'block';
    iframe.src = LIVE_CHANNELS[idx].embedUrl;
};

// Boot
updateMarketStatus();
renderTabs();
fetchQuotes();
initLiveTV();
setInterval(fetchQuotes, REFRESH_INTERVAL);
setInterval(updateMarketStatus, 60000);

