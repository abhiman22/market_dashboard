const defaultState = {
    "Indices": {
        "Large Cap": ["^BSESN", "^NSEI"],
        "Mid Cap": ["BSE-MIDCAP.BO", "^NSEMDCP50"],
        "Small Cap": ["BSE-SMLCAP.BO"],
        "Sectorial Indices": ["^NSEBANK", "^CNXIT", "^CNXAUTO", "^CNXFMCG", "^CNXMETAL", "^CNXPHARMA", "^CNXREALTY"]
    },
    "Equities": {
        "Financials": ["HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "KOTAKBANK.NS", "AXISBANK.NS"],
        "IT": ["TCS.NS", "INFY.NS", "HCLTECH.NS", "WIPRO.NS", "TECHM.NS"],
        "Energy": ["RELIANCE.NS", "NTPC.NS", "POWERGRID.NS"],
        "Automobile": ["MARUTI.NS", "M&M.NS", "TMCV.NS", "TMPV.NS"]
    }
};

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

    // Add Tab Button
    const addTabBtn = document.createElement('button');
    addTabBtn.className = 'tab-btn';
    addTabBtn.innerHTML = '+ <span style="font-size: 0.85em;">New Tab</span>';
    addTabBtn.style.color = 'var(--accent)';
    addTabBtn.onclick = () => {
        const newTab = prompt(`Enter new sub-tab name in ${activeMainTab}:`);
        if (newTab && newTab.trim() !== "") {
            if (!appState[activeMainTab]) appState[activeMainTab] = {};
            if (appState[activeMainTab][newTab]) {
                alert("Tab already exists!");
                return;
            }
            appState[activeMainTab][newTab] = [];
            activeSubTab = newTab;
            saveState();
            renderTabs();
            fetchQuotes();
        }
    };
    subTabsContainer.appendChild(addTabBtn);
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

    // Show overlay only on initial load or manual refresh
    if (tableBody.innerHTML.includes('No symbols') || tableBody.innerHTML === '') {
        loadingOverlay.classList.add('active');
    }

    try {
        const queryParams = encodeURIComponent(symbols.join(','));
        const response = await fetch(`/api/quotes?symbols=${queryParams}`);
        if (!response.ok) throw new Error('Network error');
        let quotes = await response.json();

        // Sort quotes to match the original symbols order
        const symbolsMap = new Map(symbols.map((s, i) => [s, i]));
        quotes.sort((a, b) => (symbolsMap.get(a.symbol) ?? 999) - (symbolsMap.get(b.symbol) ?? 999));

        // Check if we need to do a structural update (rows added/removed/reordered)
        const currentRows = Array.from(tableBody.querySelectorAll('tr:not(.chart-row)'));
        const currentSymbols = currentRows.map(r => r.getAttribute('data-symbol'));
        const needsStructuralUpdate = JSON.stringify(currentSymbols) !== JSON.stringify(symbols);

        if (needsStructuralUpdate) {
            // Save which symbol was active to re-expand if possible
            const lastActiveSymbol = activeChartSymbol;
            tableBody.innerHTML = '';
            quotes.forEach((q) => {
                const tr = createRow(q);
                tableBody.appendChild(tr);
                // If it was expanded, re-trigger? No, let's just do structural updates sparingly.
            });
        } else {
            // Smart update: Only change text and classes in existing rows
            quotes.forEach((q) => {
                const tr = tableBody.querySelector(`tr[data-symbol="${q.symbol}"]`);
                if (tr) updateRow(tr, q);
            });
        }

    } catch (error) {
        console.error("Error fetching data:", error);
        if (tableBody.innerHTML === '') {
            tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#ef4444; padding: 2rem;">Error fetching live data. Ensure server is running.</td></tr>`;
        }
    } finally {
        loadingOverlay.classList.remove('active');
    }
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
        '<td style="color:#64748b; font-size:0.8rem; text-align:center;">Locked</td>' : 
        `<td><button class="remove-btn" onclick="removeSymbol('${q.symbol}')">×</button></td>`;

    if (q.name === "Fallback") {
        tr.innerHTML = `
            <td class="symbol-col">${q.symbol}</td>
            <td class="name-col val-red" colspan="7">Data Unavailable</td>
            ${removeBtnHtml}
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

async function updateChart(symbol, range, canvasId) {
    const loading = document.getElementById(`loading-${canvasId}`);
    const canvas = document.getElementById(canvasId);
    
    // Update active button state
    const container = loading.parentElement;
    container.querySelectorAll('.range-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase().includes(range.replace('mo', 'm').toLowerCase()));
    });

    loading.style.display = 'flex';
    loading.innerHTML = `<div class="spinner" style="width:24px; height:24px; margin-right:10px; margin-bottom:0;"></div> Loading ${range} History...`;
    canvas.style.display = 'none';

    try {
        const response = await fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`);
        const chartData = await response.json();
        
        if (chartData.chart && chartData.chart.result && chartData.chart.result[0]) {
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

            // Filter out null prices and get trend
            const validPrices = prices.filter(p => p !== null && p !== undefined);
            const isUp = validPrices.length >= 2 ? validPrices[validPrices.length - 1] >= validPrices[0] : true;

            renderChart(canvasId, labels, prices, symbol, range, isUp);
            loading.style.display = 'none';
            canvas.style.display = 'block';
        }
    } catch (error) {
        loading.innerHTML = `<span style="color:var(--val-red)">Error loading chart data.</span>`;
    }
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
                <a href="${item.link}" target="_blank" class="news-item">
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
    const ctx = document.getElementById(canvasId).getContext('2d');
    
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
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#64748b',
                        callback: function(value) {
                            return value.toLocaleString('en-IN');
                        }
                    }
                }
            }
        }
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

const REFRESH_INTERVAL = 30000; // 30 seconds

// Boot
renderTabs();
fetchQuotes();
setInterval(fetchQuotes, REFRESH_INTERVAL);
