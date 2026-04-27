const defaultState = {
    "Overview": {
        "Market": ["^BSESN", "^NSEI", "^DJI", "^IXIC", "^GSPC", "^N225", "^FTSE", "^HSI", "399001.SZ"]
    },
    "Commodities": {
        "Metals": ["GC=F", "SI=F"],
        "Base Metals": ["HG=F", "ALI=F", "PL=F", "PA=F"],
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
    "Crypto": {
        "Crypto": ["BTC-USD", "ETH-USD", "XRP-USD"]
    },
    "US Stocks": {
        "Technology": ["AAPL", "MSFT", "GOOGL", "META", "NVDA", "AMZN", "TSLA", "ORCL", "CRM", "ADBE"],
        "Financials": ["JPM", "BAC", "GS", "WFC", "MS", "V", "MA", "BRK-B", "C", "AXP"],
        "Healthcare": ["JNJ", "UNH", "PFE", "ABBV", "MRK", "TMO", "ABT", "LLY", "AMGN", "MDT"],
        "Energy": ["XOM", "CVX", "COP", "SLB", "EOG", "PSX", "VLO", "MPC", "OXY", "HAL"],
        "Consumer": ["HD", "MCD", "NKE", "SBUX", "WMT", "TGT", "COST", "PG", "KO", "PEP"],
        "Industrials": ["CAT", "BA", "GE", "HON", "UPS", "RTX", "LMT", "MMM", "DE", "FDX"]
    },
    "US ETFs": {
        "Broad Market": ["SPY", "QQQ", "VTI", "IWM", "DIA"],
        "Sectors": ["XLK", "XLF", "XLE", "XLV", "XLI", "XLU", "XLRE"],
        "Bonds": ["TLT", "BND", "AGG", "HYG", "SHY"],
        "International": ["EEM", "VEA", "EWJ", "FXI", "INDA"]
    },
    "Mutual Funds": {
        "Large Cap": [],
        "Mid Cap": [],
        "Small Cap": [],
        "Flexi Cap": [],
        "Fund House": []
    },
    "Portfolio": {}
};

// Table header HTML for stock tabs vs MF tab
const STOCK_TABLE_HEAD = `<tr>
    <th>Sym</th><th class="hide-mobile">Company</th>
    <th class="right-align">Price</th><th class="right-align">Change</th>
    <th class="right-align hide-mobile">52W H</th>
    <th class="right-align hide-mobile">52W L</th><th class="right-align hide-mobile">Δ 52W H</th>
    <th class="right-align hide-mobile">Δ 52W L</th>
    <th class="right-align hide-mobile">Δ YTD</th>
    <th class="right-align hide-mobile">CAGR 1Y</th>
    <th></th></tr>`;

const ETF_TABLE_HEAD = `<tr>
    <th class="mf-cb-cell"></th>
    <th>Sym</th><th class="hide-mobile">Name</th>
    <th class="right-align">Price</th><th class="right-align">Change</th>
    <th class="right-align hide-mobile">52W H</th>
    <th class="right-align hide-mobile">52W L</th><th class="right-align hide-mobile">Δ 52W H</th>
    <th class="right-align hide-mobile">Δ 52W L</th>
    <th class="right-align hide-mobile">Δ YTD</th>
    <th class="right-align hide-mobile">CAGR 1Y</th>
    <th></th></tr>`;

const MF_TABLE_HEAD = `<tr>
    <th class="mf-cb-cell"></th>
    <th class="hide-mobile">Code</th><th>Scheme</th>
    <th class="right-align">NAV (₹)</th>
    <th class="right-align">Change</th>
    <th class="right-align">1Y CAGR</th><th class="right-align hide-mobile">3Y CAGR</th>
    <th class="right-align hide-mobile">52W H</th><th class="right-align hide-mobile">52W L</th><th class="right-align hide-mobile">Δ 52W H</th>
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
            if (activeMainTab === 'US ETFs' && mainTab !== 'US ETFs') {
                selectedETFs.clear();
                updateETFCompareBar();
            }
            if (activeMainTab === 'Mutual Funds' && mainTab !== 'Mutual Funds') {
                selectedMFunds.clear();
                updateCompareBar();
            }
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
    if (activeMainTab === 'Overview' || activeMainTab === 'Portfolio') return;
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

// =============================================================================
// Portfolio Tab (CAS Import)
// =============================================================================
let casData = null;
let portfolioCharts = [];

// Demo data — real fund/stock names, values scaled to <₹10k each for testing
const PORTFOLIO_DEMO_DATA = {
    investor: "DEMO INVESTOR", pan: "XXXXX****X", casId: "XXXXXXXXXX",
    period: "01-Feb-2026 to 28-Feb-2026",
    mfFolios: [
        { scheme: "ABSL Corporate Bond Fund - Direct Growth",            amc: "Aditya Birla Sun Life", category: "Debt",            units: 15.590, nav: 118.91, invested: 1000, value: 1854 },
        { scheme: "ABSL Flexi Cap Fund - Direct Growth",                 amc: "Aditya Birla Sun Life", category: "Flexi Cap",        units:  0.853, nav: 2076.86,invested:  630, value: 1772 },
        { scheme: "ABSL Large & Mid Cap Fund - Direct Growth",           amc: "Aditya Birla Sun Life", category: "Large & Mid Cap",  units:  0.083, nav: 1022.35,invested:   30, value:   85 },
        { scheme: "Axis Large Cap Fund - Direct Growth",                 amc: "Axis",                  category: "Large Cap",        units: 43.801, nav:  70.07, invested: 2500, value: 3069 },
        { scheme: "Axis Mid Cap Fund - Direct Growth",                   amc: "Axis",                  category: "Mid Cap",          units: 26.163, nav: 133.22, invested: 2750, value: 3485 },
        { scheme: "Axis Small Cap Fund - Direct Growth",                 amc: "Axis",                  category: "Small Cap",        units: 52.064, nav: 118.52, invested: 5350, value: 6171 },
        { scheme: "ICICI Pru BSE Sensex Index Fund - Direct Growth",     amc: "ICICI Prudential",      category: "Large Cap",        units:302.153, nav:  26.98, invested: 6200, value: 8151 },
        { scheme: "ICICI Pru Banking & PSU Debt Fund - Direct Growth",   amc: "ICICI Prudential",      category: "Debt",             units: 65.449, nav:  35.50, invested: 1250, value: 2324 },
        { scheme: "ICICI Pru Energy Opportunities Fund - Direct Growth", amc: "ICICI Prudential",      category: "Thematic",         units: 24.999, nav:  11.21, invested:  250, value:  280 },
        { scheme: "ICICI Pru Gold ETF FoF - Direct Growth",             amc: "ICICI Prudential",      category: "Gold",             units: 29.242, nav:  50.86, invested:  600, value: 1487 },
        { scheme: "ICICI Pru NASDAQ 100 Index Fund - Direct Growth",     amc: "ICICI Prudential",      category: "International",    units: 12.481, nav:  19.76, invested:  100, value:  247 },
        { scheme: "ICICI Pru Nifty IT Index Fund - Direct Growth",       amc: "ICICI Prudential",      category: "Thematic",         units:179.609, nav:  10.80, invested: 1900, value: 1940 },
        { scheme: "ICICI Pru Nifty Next 50 Index Fund - Direct Growth",  amc: "ICICI Prudential",      category: "Mid Cap",          units: 47.622, nav:  64.66, invested: 2900, value: 3079 },
        { scheme: "Mirae Asset Aggressive Hybrid Fund - Direct Plan",    amc: "Mirae Asset",           category: "Hybrid",           units:  3.393, nav:  39.21, invested:   50, value:  133 },
        { scheme: "Mirae Asset ELSS Tax Saver Fund - Direct Plan",       amc: "Mirae Asset",           category: "ELSS",             units: 47.466, nav:  56.49, invested: 1750, value: 2681 },
        { scheme: "Mirae Asset Focused Fund - Direct Plan",              amc: "Mirae Asset",           category: "Flexi Cap",        units: 88.958, nav:  26.23, invested: 2100, value: 2334 },
        { scheme: "Mirae Asset Large Cap Fund - Direct Plan",            amc: "Mirae Asset",           category: "Large Cap",        units:  7.704, nav: 128.43, invested:  560, value:  989 },
        { scheme: "Mirae Asset Large & Midcap Fund - Direct Plan",       amc: "Mirae Asset",           category: "Large & Mid Cap",  units:  9.954, nav: 174.06, invested: 1250, value: 1733 },
        { scheme: "Mirae Asset Nifty MidSmallcap400 MQ 100 ETF FoF",    amc: "Mirae Asset",           category: "Mid & Small Cap",  units:202.683, nav:   9.51, invested: 2000, value: 1928 },
        { scheme: "Mirae Asset S&P 500 Top 50 ETF FoF - Direct Plan",   amc: "Mirae Asset",           category: "International",    units: 26.249, nav:  25.10, invested:  300, value:  659 },
        { scheme: "Parag Parikh Flexi Cap Fund - Direct Growth",         amc: "PPFAS",                 category: "Flexi Cap",        units:105.386, nav:  91.95, invested: 8400, value: 9691 },
        { scheme: "SBI Large Cap Fund - Direct Growth",                  amc: "SBI",                   category: "Large Cap",        units: 26.781, nav: 105.57, invested:  920, value: 2827 },
        { scheme: "UTI Large Cap Fund - Direct Plan",                    amc: "UTI",                   category: "Large Cap",        units:  3.135, nav: 299.05, invested:  674, value:  937 },
        { scheme: "UTI Flexi Cap Fund - Direct Plan (Folio 1)",          amc: "UTI",                   category: "Flexi Cap",        units: 10.021, nav: 322.33, invested: 1000, value: 3230 },
        { scheme: "UTI Flexi Cap Fund - Direct Plan (Folio 2)",          amc: "UTI",                   category: "Flexi Cap",        units:  8.713, nav: 322.33, invested: 2500, value: 2809 },
        { scheme: "UTI MNC Fund - Direct Plan",                          amc: "UTI",                   category: "Thematic",         units:  2.084, nav: 434.65, invested:  320, value:  906 }
    ],
    dematMF: [
        { scheme: "HDFC Mid Cap Fund - Direct Growth",           amc: "HDFC",           category: "Mid Cap",    isin: "INF179K01XQ0", units: 20.02, price: 223.96, value: 4484 },
        { scheme: "Quant Mid Cap Fund - Direct Growth",          amc: "Quant",          category: "Mid Cap",    isin: "INF966L01887", units: 10.24, price: 221.21, value: 2266 },
        { scheme: "Quant Small Cap Fund - Direct Growth",        amc: "Quant",          category: "Small Cap",  isin: "INF966L01689", units: 19.37, price: 258.43, value: 5005 },
        { scheme: "Groww Nifty EV & New Age Auto ETF",           amc: "Groww AM",       category: "Thematic",   isin: "INF666M01IH2", units:  7.77, price:  30.88, value:  240 },
        { scheme: "ICICI Pru Nifty Next 50 ETF",                 amc: "ICICI Prudential",category: "Mid Cap",   isin: "INF109KC1NS5", units:  4.00, price:  73.42, value:  294 },
        { scheme: "ICICI Pru Gold ETF",                          amc: "ICICI Prudential",category: "Gold",      isin: "INF109KC1NT3", units:  5.00, price: 136.28, value:  681 },
        { scheme: "Nippon India ETF Nifty Bank BeES",            amc: "Nippon",         category: "Thematic",   isin: "INF204KB15I9", units:  0.22, price: 623.38, value:  137 },
        { scheme: "Nippon India ETF Nifty IT",                   amc: "Nippon",         category: "Thematic",   isin: "INF204KB15V2", units:  6.06, price:  33.81, value:  205 }
    ],
    equity: [
        { name: "Aadhar Housing Finance",      isin: "INE883F01010", qty:   4, price:  460.35, value: 1841 },
        { name: "Avenue Supermarts (DMart)",   isin: "INE192R01011", qty:   1, price: 3845.50, value: 3846 },
        { name: "Bajaj Finance",               isin: "INE296A01032", qty:   5, price:  996.50, value: 4983 },
        { name: "Bajaj Housing Finance",       isin: "INE377Y01014", qty:  21, price:   87.03, value: 1828 },
        { name: "Bank of Baroda",              isin: "INE028A01039", qty:   4, price:  321.85, value: 1287 },
        { name: "Bansal Wire Industries",      isin: "INE0B9K01025", qty:   5, price:  262.50, value: 1313 },
        { name: "Emcure Pharmaceuticals",      isin: "INE168P01015", qty:   1, price: 1454.55, value: 1455 },
        { name: "HDFC Bank",                   isin: "INE040A01034", qty:  10, price:  887.40, value: 8874 },
        { name: "Hindustan Zinc",              isin: "INE267A01025", qty:   2, price:  603.85, value: 1208 },
        { name: "Infosys",                     isin: "INE009A01021", qty:   4, price: 1299.95, value: 5200 },
        { name: "INOX India",                  isin: "INE616N01034", qty:   2, price: 1163.70, value: 2327 },
        { name: "IRCTC",                       isin: "INE335Y01020", qty:   7, price:  571.25, value: 3999 },
        { name: "ITC Hotels",                  isin: "INE379A01028", qty:   5, price:  176.15, value:  881 },
        { name: "ITC",                         isin: "INE154A01025", qty:   5, price:  313.60, value: 1568 },
        { name: "Jio Financial Services",      isin: "INE758E01017", qty:  11, price:  255.35, value: 2809 },
        { name: "JSW Infrastructure",          isin: "INE880J01026", qty:  12, price:  254.85, value: 3058 },
        { name: "LIC",                         isin: "INE0J1Y01017", qty:   1, price:  849.35, value:  849 },
        { name: "NTPC",                        isin: "INE733E01010", qty:   7, price:  381.85, value: 2673 },
        { name: "Power Finance Corporation",   isin: "INE134E01011", qty:   2, price:  412.75, value:  826 },
        { name: "Power Grid Corporation",      isin: "INE752E01010", qty:   4, price:  298.75, value: 1195 },
        { name: "Protean eGov Technologies",   isin: "INE004A01022", qty:   1, price:  590.20, value:  590 },
        { name: "Reliance Industries",         isin: "INE002A01018", qty:   6, price: 1394.30, value: 8366 },
        { name: "State Bank of India",         isin: "INE062A01020", qty:   5, price: 1202.00, value: 6010 },
        { name: "Suzlon Energy",               isin: "INE040H01021", qty: 200, price:   42.70, value: 8540 },
        { name: "Tata Motors",                 isin: "INE1TAE01010", qty:   5, price:  504.90, value: 2525 }
    ]
};

function renderPortfolioUpload() {
    document.getElementById('portfolio-content').innerHTML = `
        <div class="portfolio-upload-card">
            <div class="portfolio-upload-icon">📄</div>
            <h3>Import CAS Statement</h3>
            <p class="portfolio-upload-hint">Upload your Consolidated Account Statement PDF from CDSL/CAMS/KFintech.<br>Password is usually your PAN in uppercase.</p>
            <div class="portfolio-upload-form">
                <label class="portfolio-file-label" for="cas-file-input">
                    <span id="cas-file-name">Choose PDF file…</span>
                </label>
                <input type="file" id="cas-file-input" accept=".pdf" style="display:none" onchange="document.getElementById('cas-file-name').textContent = this.files[0]?.name || 'Choose PDF file…'">
                <input type="password" id="cas-password" class="glass-input" placeholder="PDF Password (your PAN)" style="width:100%; box-sizing:border-box;">
                <button class="glass-btn portfolio-upload-btn" onclick="uploadCAS()">Parse Statement</button>
            </div>
            <div class="portfolio-upload-divider"><span>or</span></div>
            <button class="glass-btn portfolio-upload-btn portfolio-demo-btn" onclick="loadDemoPortfolio()">Load Demo Portfolio</button>
            <p class="portfolio-setup-hint" style="margin-top:0.75rem;">Demo uses real fund/stock names with test values</p>
        </div>
    `;
}

// ── CAS response adapter ──────────────────────────────────────────────────────
// Converts the backend CASParser JSON shape → the shape renderPortfolioData expects.

function inferFundCategory(name) {
    const n = name.toLowerCase();
    if (n.includes('overnight'))                                    return 'Overnight';
    if (n.includes('liquid'))                                       return 'Liquid';
    if (n.includes('money market'))                                 return 'Money Market';
    if (n.includes('ultra short'))                                  return 'Ultra Short Duration';
    if (n.includes('low duration'))                                 return 'Low Duration';
    if (n.includes('short duration'))                               return 'Short Duration';
    if (n.includes('medium duration') || n.includes('medium term')) return 'Medium Duration';
    if (n.includes('long duration'))                                return 'Long Duration';
    if (n.includes('dynamic bond'))                                 return 'Dynamic Bond';
    if (n.includes('corporate bond'))                               return 'Corporate Bond';
    if (n.includes('credit risk'))                                  return 'Credit Risk';
    if (n.includes('banking & psu') || n.includes('banking and psu')) return 'Banking & PSU';
    if (n.includes('gilt'))                                         return 'Gilt';
    if (n.includes('floater'))                                      return 'Floater';
    if (n.includes('elss') || n.includes('tax saver') || n.includes('tax saving')) return 'ELSS';
    if (n.includes('large & mid') || n.includes('large and mid'))   return 'Large & Mid Cap';
    if (n.includes('large cap'))                                    return 'Large Cap';
    if (n.includes('mid cap'))                                      return 'Mid Cap';
    if (n.includes('small cap'))                                    return 'Small Cap';
    if (n.includes('flexi cap'))                                    return 'Flexi Cap';
    if (n.includes('multi cap'))                                    return 'Multi Cap';
    if (n.includes('focused'))                                      return 'Focused';
    if (n.includes('dividend yield'))                               return 'Dividend Yield';
    if (n.includes('value') || n.includes('contra'))                return 'Value/Contra';
    if (n.includes('arbitrage'))                                    return 'Arbitrage';
    if (n.includes('equity savings'))                               return 'Equity Savings';
    if (n.includes('aggressive hybrid'))                            return 'Aggressive Hybrid';
    if (n.includes('conservative hybrid'))                          return 'Conservative Hybrid';
    if (n.includes('balanced advantage') || n.includes('dynamic asset')) return 'Balanced Advantage';
    if (n.includes('hybrid') || n.includes('balanced'))             return 'Hybrid';
    if (n.includes('index') || n.includes('nifty') || n.includes('sensex') || n.includes('etf')) return 'Index/ETF';
    if (n.includes('international') || n.includes('overseas') || n.includes('global') || n.includes('nasdaq') || n.includes(' us ')) return 'International';
    if (n.includes('pharma') || n.includes('infra') || n.includes('consumption') || n.includes('thematic') || n.includes('sectoral')) return 'Sectoral/Thematic';
    if (n.includes('fof') || n.includes('fund of fund'))            return 'FoF';
    return 'Equity';
}

function inferAMC(name) {
    const n = name.toLowerCase();
    if (n.includes('hdfc'))                                   return 'HDFC Mutual Fund';
    if (n.includes('sbi'))                                    return 'SBI Mutual Fund';
    if (n.includes('icici'))                                  return 'ICICI Prudential';
    if (n.includes('axis'))                                   return 'Axis Mutual Fund';
    if (n.includes('kotak'))                                  return 'Kotak Mutual Fund';
    if (n.includes('nippon'))                                 return 'Nippon India';
    if (n.includes('mirae'))                                  return 'Mirae Asset';
    if (n.includes('parag parikh') || n.includes('ppfas'))    return 'PPFAS';
    if (n.includes('dsp'))                                    return 'DSP Mutual Fund';
    if (n.includes('franklin'))                               return 'Franklin Templeton';
    if (n.includes('tata'))                                   return 'Tata Mutual Fund';
    if (n.includes('uti'))                                    return 'UTI Mutual Fund';
    if (n.includes('aditya') || n.includes('absl') || n.includes('birla')) return 'Aditya Birla Sun Life';
    if (n.includes('invesco'))                                return 'Invesco';
    if (n.includes('sundaram'))                               return 'Sundaram';
    if (n.includes('canara'))                                 return 'Canara Robeco';
    if (n.includes('idfc') || n.includes('bandhan'))          return 'Bandhan';
    if (n.includes('whiteoak'))                               return 'WhiteOak Capital';
    if (n.includes('motilal'))                                return 'Motilal Oswal';
    if (n.includes('pgim'))                                   return 'PGIM India';
    if (n.includes('quant'))                                  return 'Quant';
    if (n.includes('groww'))                                  return 'Groww';
    return 'Other';
}

function normalizeCASResponse(raw) {
    // raw = CASParser output: { investor, summary, monthlyHistory, mfHoldings, activeSips, dematHoldings }
    const inv = raw.investor || {};

    const mfFolios = (raw.mfHoldings || []).map(h => ({
        scheme:   h.name,
        amc:      h.amc || inferAMC(h.name),
        category: inferFundCategory(h.name),
        units:    h.units,
        nav:      h.nav,
        invested: h.invested,
        value:    h.value,
    }));

    const dematAll = raw.dematHoldings || [];
    const dematMF = dematAll
        .filter(h => h.type === 'MF-Demat')
        .map(h => ({
            scheme:   h.name,
            amc:      inferAMC(h.name),
            category: inferFundCategory(h.name),
            units:    h.qty,
            price:    h.price,
            value:    h.value,
        }));

    const equity = dematAll
        .filter(h => h.type === 'Equity')
        .map(h => ({
            name:  h.name,
            qty:   h.qty,
            price: h.price,
            value: h.value,
        }));

    const periodFrom = inv.periodFrom || '';
    const periodTo   = inv.periodTo   || '';
    const period = (periodFrom && periodTo) ? `${periodFrom} to ${periodTo}` : (periodFrom || '');

    return {
        investor: inv.name || 'My Portfolio',
        period,
        mfFolios,
        dematMF,
        equity,
    };
}

function loadDemoPortfolio() {
    casData = PORTFOLIO_DEMO_DATA;
    renderPortfolioData(casData);
}

async function uploadCAS() {
    const fileInput = document.getElementById('cas-file-input');
    const password  = document.getElementById('cas-password').value.trim();
    if (!fileInput.files[0]) { alert('Please select a PDF file.'); return; }

    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64 = e.target.result.split(',')[1];
        document.getElementById('portfolio-content').innerHTML = `
            <div style="display:flex; align-items:center; justify-content:center; padding:5rem; gap:1rem; color:var(--text-secondary);">
                <div class="spinner" style="width:24px; height:24px; margin:0;"></div>
                Parsing statement, please wait…
            </div>`;
        try {
            const res  = await fetch('/api/cas/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pdf: base64, password })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            casData = normalizeCASResponse(data);
            renderPortfolioData(casData);
        } catch (err) {
            document.getElementById('portfolio-content').innerHTML = `
                <div class="portfolio-upload-card">
                    <p style="color:var(--val-red); margin-bottom:1.25rem; font-size:0.9rem;">${err.message}</p>
                    <button class="glass-btn" onclick="renderPortfolioUpload()">← Try Again</button>
                </div>`;
        }
    };
    reader.readAsDataURL(fileInput.files[0]);
}

function renderPortfolioData(data) {
    // Legacy casparser format fallback
    if (!data.mfFolios) { renderPortfolioLegacy(data); return; }

    portfolioCharts.forEach(c => c.destroy());
    portfolioCharts = [];

    const fmtINR = n => '₹' + Math.round(n).toLocaleString('en-IN');

    const mfValue    = data.mfFolios.reduce((s, f) => s + f.value, 0);
    const mfInvested = data.mfFolios.reduce((s, f) => s + f.invested, 0);
    const dematValue = data.dematMF.reduce((s, f) => s + f.value, 0);
    const eqValue    = data.equity.reduce((s, e) => s + e.value, 0);
    const total      = mfValue + dematValue + eqValue;
    const gain       = mfValue - mfInvested;
    const gainPct    = mfInvested > 0 ? (gain / mfInvested) * 100 : 0;
    const gc         = gain >= 0 ? 'val-green' : 'val-red';
    const sign       = gain >= 0 ? '+' : '';

    // Category & AMC aggregation
    const catMap = {}, amcMap = {};
    [...data.mfFolios, ...data.dematMF].forEach(f => {
        catMap[f.category] = (catMap[f.category] || 0) + f.value;
        amcMap[f.amc]      = (amcMap[f.amc]      || 0) + f.value;
    });
    const catEntries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    const amcEntries = Object.entries(amcMap).sort((a, b) => b[1] - a[1]);

    const warnings = computePortfolioWarnings(data);

    const pct = (v) => ((v / total) * 100).toFixed(1);

    const mfRows = [...data.mfFolios].sort((a, b) => b.value - a.value).map(f => {
        const g = f.value - f.invested;
        const gPct = f.invested > 0 ? (g / f.invested) * 100 : 0;
        const hgc = g >= 0 ? 'val-green' : 'val-red';
        const hs  = g >= 0 ? '+' : '';
        return `<tr>
            <td class="portfolio-scheme-name">
                <div>${f.scheme}</div>
                <div class="portfolio-scheme-cat">${f.category}</div>
            </td>
            <td class="hide-mobile" style="color:var(--text-secondary);font-size:0.78rem;white-space:nowrap;">${f.amc}</td>
            <td class="right-align hide-mobile" style="font-size:0.82rem;font-variant-numeric:tabular-nums;">${f.units.toLocaleString('en-IN',{maximumFractionDigits:3})}</td>
            <td class="right-align hide-mobile">₹${f.nav.toLocaleString('en-IN',{maximumFractionDigits:2})}</td>
            <td class="right-align" style="font-weight:600;">${fmtINR(f.value)}</td>
            <td class="right-align ${hgc}">${hs}${gPct.toFixed(1)}%</td>
        </tr>`;
    }).join('');

    const dematRows = [...data.dematMF].sort((a, b) => b.value - a.value).map(f => `<tr>
        <td class="portfolio-scheme-name">${f.scheme}</td>
        <td class="hide-mobile" style="color:var(--text-secondary);font-size:0.78rem;">${f.amc}</td>
        <td class="right-align hide-mobile" style="font-size:0.82rem;">${f.units.toLocaleString('en-IN',{maximumFractionDigits:3})}</td>
        <td class="right-align hide-mobile">₹${f.price.toLocaleString('en-IN',{maximumFractionDigits:2})}</td>
        <td class="right-align" style="font-weight:600;">${fmtINR(f.value)}</td>
        <td class="hide-mobile"><span class="portfolio-cat-badge">${f.category}</span></td>
    </tr>`).join('');

    const eqRows = [...data.equity].sort((a, b) => b.value - a.value).map(e => `<tr>
        <td style="font-weight:600;font-size:0.88rem;">${e.name}</td>
        <td class="right-align hide-mobile" style="font-size:0.82rem;">${e.qty}</td>
        <td class="right-align hide-mobile">₹${e.price.toLocaleString('en-IN',{maximumFractionDigits:2})}</td>
        <td class="right-align" style="font-weight:600;">${fmtINR(e.value)}</td>
    </tr>`).join('');

    document.getElementById('portfolio-content').innerHTML = `
        <div class="portfolio-header">
            <div>
                <div class="portfolio-investor-name">${data.investor}</div>
                <div class="portfolio-period">${data.period}</div>
            </div>
            <button class="glass-btn" style="font-size:0.75rem;" onclick="casData=null; renderPortfolioUpload()">↑ Upload New</button>
        </div>

        <div class="portfolio-summary-cards">
            <div class="portfolio-summary-card">
                <div class="portfolio-summary-label">Total Portfolio</div>
                <div class="portfolio-summary-value">${fmtINR(total)}</div>
            </div>
            <div class="portfolio-summary-card">
                <div class="portfolio-summary-label">MF Invested</div>
                <div class="portfolio-summary-value">${fmtINR(mfInvested)}</div>
            </div>
            <div class="portfolio-summary-card">
                <div class="portfolio-summary-label">MF Gain / Loss</div>
                <div class="portfolio-summary-value ${gc}">${sign}${fmtINR(gain)}</div>
            </div>
            <div class="portfolio-summary-card">
                <div class="portfolio-summary-label">MF Return</div>
                <div class="portfolio-summary-value ${gc}">${sign}${gainPct.toFixed(1)}%</div>
            </div>
        </div>

        <div class="portfolio-asset-bar-section">
            <div class="portfolio-asset-labels">
                <span class="portfolio-asset-label"><span class="portfolio-asset-dot" style="background:#3b82f6"></span>MF Folios &nbsp;${fmtINR(mfValue)} (${pct(mfValue)}%)</span>
                <span class="portfolio-asset-label"><span class="portfolio-asset-dot" style="background:#8b5cf6"></span>Demat MF/ETF &nbsp;${fmtINR(dematValue)} (${pct(dematValue)}%)</span>
                <span class="portfolio-asset-label"><span class="portfolio-asset-dot" style="background:#10b981"></span>Direct Equity &nbsp;${fmtINR(eqValue)} (${pct(eqValue)}%)</span>
            </div>
            <div class="portfolio-asset-bar">
                <div style="width:${pct(mfValue)}%;background:#3b82f6;border-radius:4px 0 0 4px;"></div>
                <div style="width:${pct(dematValue)}%;background:#8b5cf6;"></div>
                <div style="width:${pct(eqValue)}%;background:#10b981;border-radius:0 4px 4px 0;"></div>
            </div>
        </div>

        <div class="portfolio-charts-row">
            <div class="portfolio-chart-card">
                <div class="portfolio-chart-title">Category Allocation</div>
                <div class="portfolio-chart-wrap"><canvas id="portfolio-category-chart"></canvas></div>
            </div>
            <div class="portfolio-chart-card">
                <div class="portfolio-chart-title">AMC Distribution</div>
                <div class="portfolio-chart-wrap"><canvas id="portfolio-amc-chart"></canvas></div>
            </div>
        </div>

        ${warnings.length ? `<div class="portfolio-observations">
            <div class="portfolio-section-title">Observations</div>
            ${warnings.map(w => `<div class="portfolio-obs-item portfolio-obs-${w.type}">${w.text}</div>`).join('')}
        </div>` : ''}

        <div class="portfolio-section collapsible-section">
            <div class="collapsible-header portfolio-section-header" onclick="toggleSection('pf-mf-folios')">
                <div class="portfolio-section-title">Mutual Fund Folios <span class="portfolio-section-count">${data.mfFolios.length} schemes</span></div>
                <span class="chevron" id="chevron-pf-mf-folios">▾</span>
            </div>
            <div class="collapsible-body" id="pf-mf-folios">
                <div class="portfolio-table-wrapper">
                    <table class="market-table">
                        <thead><tr>
                            <th>Scheme</th>
                            <th class="hide-mobile">AMC</th>
                            <th class="right-align hide-mobile">Units</th>
                            <th class="right-align hide-mobile">NAV</th>
                            <th class="right-align">Value</th>
                            <th class="right-align">Return</th>
                        </tr></thead>
                        <tbody>${mfRows}</tbody>
                    </table>
                </div>
            </div>
        </div>

        <div class="portfolio-section collapsible-section">
            <div class="collapsible-header portfolio-section-header" onclick="toggleSection('pf-demat')">
                <div class="portfolio-section-title">MF / ETF Units in Demat <span class="portfolio-section-count">${data.dematMF.length} holdings</span></div>
                <span class="chevron" id="chevron-pf-demat">▾</span>
            </div>
            <div class="collapsible-body" id="pf-demat">
                <div class="portfolio-table-wrapper">
                    <table class="market-table">
                        <thead><tr>
                            <th>Scheme</th>
                            <th class="hide-mobile">AMC</th>
                            <th class="right-align hide-mobile">Units</th>
                            <th class="right-align hide-mobile">Price</th>
                            <th class="right-align">Value</th>
                            <th class="hide-mobile">Category</th>
                        </tr></thead>
                        <tbody>${dematRows}</tbody>
                    </table>
                </div>
            </div>
        </div>

        <div class="portfolio-section collapsible-section">
            <div class="collapsible-header portfolio-section-header" onclick="toggleSection('pf-equity')">
                <div class="portfolio-section-title">Direct Equity <span class="portfolio-section-count">${data.equity.length} stocks</span></div>
                <span class="chevron" id="chevron-pf-equity">▾</span>
            </div>
            <div class="collapsible-body" id="pf-equity">
                <div class="portfolio-chart-card" style="margin-bottom:1rem;">
                    <div class="portfolio-chart-title">Stock Allocation</div>
                    <div class="portfolio-chart-wrap portfolio-equity-chart-wrap"><canvas id="portfolio-equity-chart"></canvas></div>
                </div>
                <div class="portfolio-table-wrapper">
                    <table class="market-table">
                        <thead><tr>
                            <th>Stock</th>
                            <th class="right-align hide-mobile">Qty</th>
                            <th class="right-align hide-mobile">Price</th>
                            <th class="right-align">Value</th>
                        </tr></thead>
                        <tbody>${eqRows}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    setTimeout(() => renderPortfolioCharts(catEntries, amcEntries, data.equity), 0);
}

function computePortfolioWarnings(data) {
    const w = [];
    const flexiFunds = data.mfFolios.filter(f => f.category === 'Flexi Cap');
    if (flexiFunds.length >= 3)
        w.push({ type: 'warn', text: `⚠ ${flexiFunds.length} Flexi Cap funds — high overlap. Consider consolidating to 1–2 funds.` });

    const lcFunds = [...data.mfFolios, ...data.dematMF].filter(f => f.category === 'Large Cap');
    if (lcFunds.length >= 4)
        w.push({ type: 'warn', text: `⚠ ${lcFunds.length} Large Cap funds — a single index fund can replace most of these.` });

    const schemeCount = {};
    data.mfFolios.forEach(f => {
        const key = f.scheme.replace(/\s*\(Folio \d+\)\s*/, '').trim();
        schemeCount[key] = (schemeCount[key] || 0) + 1;
    });
    Object.entries(schemeCount).forEach(([name, count]) => {
        if (count > 1) w.push({ type: 'info', text: `ℹ "${name}" is split across ${count} folios — can be consolidated into one.` });
    });

    const negFunds = data.mfFolios.filter(f => f.value < f.invested);
    if (negFunds.length)
        w.push({ type: 'info', text: `ℹ ${negFunds.length} fund${negFunds.length > 1 ? 's' : ''} in negative: ${negFunds.map(f => f.scheme.split(' ').slice(0,3).join(' ')).join(', ')}.` });

    return w;
}

function renderPortfolioCharts(catEntries, amcEntries, equity) {
    const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#f97316','#84cc16','#6366f1','#a78bfa','#34d399'];
    const catTotal = catEntries.reduce((s, [,v]) => s + v, 0);

    const dpr = window.devicePixelRatio || 2;

    const catCanvas = document.getElementById('portfolio-category-chart');
    if (catCanvas) {
        portfolioCharts.push(new Chart(catCanvas, {
            type: 'doughnut',
            data: {
                labels: catEntries.map(([k]) => k),
                datasets: [{ data: catEntries.map(([,v]) => v), backgroundColor: COLORS, borderWidth: 0, hoverOffset: 6 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                devicePixelRatio: dpr,
                cutout: '62%',
                plugins: {
                    legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11, family: 'Inter' }, boxWidth: 11, padding: 10 } },
                    tooltip: { callbacks: { label: ctx => ` ₹${Math.round(ctx.raw).toLocaleString('en-IN')} (${((ctx.raw/catTotal)*100).toFixed(1)}%)` } }
                }
            }
        }));
    }

    const amcCanvas = document.getElementById('portfolio-amc-chart');
    if (amcCanvas) {
        portfolioCharts.push(new Chart(amcCanvas, {
            type: 'bar',
            data: {
                labels: amcEntries.map(([k]) => k),
                datasets: [{ data: amcEntries.map(([,v]) => v), backgroundColor: COLORS, borderWidth: 0, borderRadius: 4 }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                devicePixelRatio: dpr,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => ` ₹${Math.round(ctx.raw).toLocaleString('en-IN')}` } }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8', font: { size: 10, family: 'Inter' }, callback: v => '₹' + Math.round(v/1000) + 'k' }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { ticks: { color: '#94a3b8', font: { size: 11, family: 'Inter' } }, grid: { display: false } }
                }
            }
        }));
    }

    const eqCanvas = document.getElementById('portfolio-equity-chart');
    if (eqCanvas && equity?.length) {
        const eqSorted = [...equity].sort((a, b) => b.value - a.value);
        const eqTotal  = eqSorted.reduce((s, e) => s + e.value, 0);
        const EQ_COLORS = [...COLORS, '#f43f5e','#0ea5e9','#d946ef','#fb923c','#4ade80','#facc15','#38bdf8','#c084fc'];
        portfolioCharts.push(new Chart(eqCanvas, {
            type: 'doughnut',
            data: {
                labels: eqSorted.map(e => e.name),
                datasets: [{ data: eqSorted.map(e => e.value), backgroundColor: EQ_COLORS, borderWidth: 0, hoverOffset: 6 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                devicePixelRatio: dpr,
                cutout: '55%',
                plugins: {
                    legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 10, family: 'Inter' }, boxWidth: 10, padding: 8 } },
                    tooltip: { callbacks: { label: ctx => ` ₹${Math.round(ctx.raw).toLocaleString('en-IN')} (${((ctx.raw/eqTotal)*100).toFixed(1)}%)` } }
                }
            }
        }));
    }
}

function renderPortfolioLegacy(data) {
    const folios = data.folios || [];
    let totalValue = 0, totalInvested = 0;
    const holdings = [];
    folios.forEach(folio => {
        (folio.schemes || []).forEach(scheme => {
            const val = scheme.valuation?.value || 0;
            totalValue += val;
            let invested = 0;
            (scheme.transactions || []).forEach(tx => { if ((tx.amount || 0) > 0) invested += tx.amount; });
            totalInvested += invested;
            holdings.push({ amc: folio.amc, scheme: scheme.scheme, units: scheme.close_units || 0, nav: scheme.valuation?.nav || 0, value: val, invested });
        });
    });
    holdings.sort((a, b) => b.value - a.value);
    const gain = totalValue - totalInvested;
    const gainPct = totalInvested > 0 ? (gain / totalInvested) * 100 : 0;
    const gc = gain >= 0 ? 'val-green' : 'val-red';
    const sign = gain >= 0 ? '+' : '';
    const fmtINR = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
    document.getElementById('portfolio-content').innerHTML = `
        <div class="portfolio-header">
            <div><div class="portfolio-investor-name">${data.investor_info?.name || 'My Portfolio'}</div></div>
            <button class="glass-btn" style="font-size:0.75rem;" onclick="casData=null; renderPortfolioUpload()">↑ Upload New</button>
        </div>
        <div class="portfolio-summary-cards">
            <div class="portfolio-summary-card"><div class="portfolio-summary-label">Current Value</div><div class="portfolio-summary-value">${fmtINR(totalValue)}</div></div>
            <div class="portfolio-summary-card"><div class="portfolio-summary-label">Invested</div><div class="portfolio-summary-value">${fmtINR(totalInvested)}</div></div>
            <div class="portfolio-summary-card"><div class="portfolio-summary-label">Gain/Loss</div><div class="portfolio-summary-value ${gc}">${sign}${fmtINR(gain)}</div></div>
            <div class="portfolio-summary-card"><div class="portfolio-summary-label">Return</div><div class="portfolio-summary-value ${gc}">${sign}${gainPct.toFixed(1)}%</div></div>
        </div>
        <div class="portfolio-table-wrapper"><table class="market-table">
            <thead><tr><th>Scheme</th><th>AMC</th><th class="right-align">Units</th><th class="right-align">NAV</th><th class="right-align">Value</th><th class="right-align">Return</th></tr></thead>
            <tbody>${holdings.map(h => {
                const g = h.value - h.invested; const gPct = h.invested > 0 ? (g/h.invested)*100 : 0;
                const hgc = g >= 0 ? 'val-green' : 'val-red'; const hs = g >= 0 ? '+' : '';
                return `<tr><td class="portfolio-scheme-name">${h.scheme}</td><td style="color:var(--text-secondary);font-size:0.8rem;">${h.amc}</td>
                    <td class="right-align" style="font-size:0.82rem;">${h.units.toLocaleString('en-IN',{maximumFractionDigits:3})}</td>
                    <td class="right-align">₹${h.nav.toLocaleString('en-IN',{maximumFractionDigits:2})}</td>
                    <td class="right-align" style="font-weight:600;">₹${Math.round(h.value).toLocaleString('en-IN')}</td>
                    <td class="right-align ${hgc}">${hs}${gPct.toFixed(1)}%</td></tr>`;
            }).join('')}</tbody>
        </table></div>`;
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
    const portfolioEl = document.getElementById('portfolio-content');
    const tableContainerEl = document.querySelector('.table-container');

    if (activeMainTab === 'Portfolio') {
        tableContainerEl.style.display = 'none';
        portfolioEl.style.display = 'block';
        document.getElementById('overview-extras').classList.remove('active');
        loadingOverlay.classList.remove('active');
        mfControls.style.display = 'none';
        if (casData) renderPortfolioData(casData);
        else renderPortfolioUpload();
        return;
    }

    tableContainerEl.style.display = '';
    portfolioEl.style.display = 'none';

    if (activeMainTab === 'Mutual Funds') {
        await fetchMFData();
        return;
    }

    // Set table headers based on active tab
    tableHead.innerHTML = activeMainTab === 'US ETFs' ? ETF_TABLE_HEAD : STOCK_TABLE_HEAD;
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
        tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 2rem; color: var(--text-secondary);">No symbols in this tab.</td></tr>`;
        return;
    }

    loadingOverlay.classList.add('active');

    try {
        const queryParams = encodeURIComponent(symbols.join(','));
        const response = await fetch(`/api/quotes?symbols=${queryParams}`);
        if (!response.ok) throw new Error('Network error');
        let quotes = await response.json();
        quotes.forEach(q => { if (q.name !== 'Fallback') quotesMap.set(q.symbol, q); });

        // 2. Filter quotes for the actual table (only show what's in the sub-tab)
        const tableSymbols = appState[activeMainTab]?.[activeSubTab] || [];
        const tableQuotes = quotes.filter(q => tableSymbols.includes(q.symbol));

        // Sort table quotes
        const symbolsMap = new Map(tableSymbols.map((s, i) => [s, i]));
        tableQuotes.sort((a, b) => (symbolsMap.get(a.symbol) ?? 999) - (symbolsMap.get(b.symbol) ?? 999));

        const currentRows = Array.from(tableBody.querySelectorAll('tr:not(.chart-row)'));
        const currentSymbols = currentRows.map(r => r.getAttribute('data-symbol'));
        const needsStructuralUpdate = JSON.stringify(currentSymbols) !== JSON.stringify(tableSymbols);

        if (activeMainTab === 'US ETFs') {
            tableBody.innerHTML = '';
            tableQuotes.forEach(q => tableBody.appendChild(createETFRow(q)));
        } else if (needsStructuralUpdate) {
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
        const ts = document.getElementById('last-updated');
        if (ts) ts.textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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

    content.innerHTML = `<div class="news-card-grid">${news.map(item => {
        let domain = '';
        try { domain = new URL(item.link).hostname.replace('www.', ''); } catch(e) {}
        const favicon = domain ? `<img class="news-favicon" src="https://www.google.com/s2/favicons?domain=${domain}&sz=16" alt="" onerror="this.style.display='none'">` : '';
        return `
        <a href="${item.link}" target="_blank" class="news-card" data-full-title="${escapeAttr(item.title)}">
            <div class="news-card-meta">${favicon}<span class="news-card-publisher">${item.publisher}</span><span class="news-card-date">${item.date || 'Just now'}</span></div>
            <div class="news-card-headline">${item.title}</div>
        </a>`;
    }).join('')}</div>`;
}

function createRow(q) {
    const tr = document.createElement('tr');
    tr.setAttribute('data-symbol', q.symbol);
    updateRow(tr, q);
    tr.addEventListener('click', (e) => {
        if (e.target.closest('.remove-btn')) return;
        if (e.target.closest('.mobile-expand-btn')) {
            e.stopPropagation();
            toggleMobileDetails(tr);
            return;
        }
        toggleChart(q.symbol, tr);
    });
    return tr;
}

function updateRow(tr, q) {
    tr._quoteData = q;
    const changeClass = getColorClass(q.change);
    const deltaHigh = q.fiftyTwoWeekHigh !== 0 ? ((q.currentPrice - q.fiftyTwoWeekHigh) / q.fiftyTwoWeekHigh) * 100 : 0;
    const deltaLow = q.fiftyTwoWeekLow !== 0 ? ((q.currentPrice - q.fiftyTwoWeekLow) / q.fiftyTwoWeekLow) * 100 : 0;
    const deltaClass = getColorClass(deltaHigh);
    const deltaLowClass = getColorClass(deltaLow);
    const signStr = q.change > 0 ? '+' : '';
    const deltaSignStr = deltaHigh > 0 ? '+' : '';
    const deltaLowSignStr = deltaLow > 0 ? '+' : '';

    const isDefaultSymbol = defaultState[activeMainTab]?.[activeSubTab]?.includes(q.symbol);
    const removeBtn = isDefaultSymbol ? '' : `<button class="remove-btn" onclick="removeSymbol('${q.symbol}')">×</button>`;
    const removeBtnHtml = `<td class="action-cell">${removeBtn}<button class="mobile-expand-btn" aria-label="Show details"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,4 6,8 10,4"/></svg></button></td>`;

    const dotHtml = activeMainTab === 'Overview'
        ? `<span class="market-dot market-dot-${getExchangeStatus(getSymbolExchange(q.symbol))}"></span>`
        : '';

    const ytdClass = getColorClass(q.ytdChange);
    const ytdSign = q.ytdChange > 0 ? '+' : '';
    const cagrClass = getColorClass(q.cagr1y);
    const cagrSign = q.cagr1y > 0 ? '+' : '';

    if (q.name === "Fallback") {
        tr.innerHTML = `
            <td class="symbol-col">${dotHtml}${q.symbol}</td>
            <td class="name-col val-red" colspan="9">Data Unavailable</td>
            ${removeBtnHtml}
        `;
    } else {
        tr.innerHTML = `
            <td class="symbol-col" data-name="${escapeAttr(q.name)}">${dotHtml}${q.symbol}</td>
            <td class="name-col hide-mobile">${q.name}</td>
            <td class="right-align price-col">${formatVal(q.currentPrice, q.currency)}</td>
            <td class="right-align price-col ${changeClass}"><span class="change-pct">${signStr}${q.percentChange.toFixed(2)}%</span><span class="change-abs">${signStr}${formatVal(q.change, q.currency)}</span></td>
            <td class="right-align name-col hide-mobile">${formatVal(q.fiftyTwoWeekHigh, q.currency)}</td>
            <td class="right-align name-col hide-mobile">${formatVal(q.fiftyTwoWeekLow, q.currency)}</td>
            <td class="right-align price-col ${deltaClass} hide-mobile">${deltaSignStr}${deltaHigh.toFixed(2)}%</td>
            <td class="right-align price-col ${deltaLowClass} hide-mobile">${deltaLowSignStr}${deltaLow.toFixed(2)}%</td>
            <td class="right-align price-col ${ytdClass} hide-mobile">${ytdSign}${q.ytdChange.toFixed(2)}%</td>
            <td class="right-align price-col ${cagrClass} hide-mobile">${cagrSign}${q.cagr1y.toFixed(2)}%</td>
            ${removeBtnHtml}
        `;
    }
}

function toggleMobileDetails(tr) {
    const btn = tr.querySelector('.mobile-expand-btn');
    const next = tr.nextElementSibling;
    if (next && next.classList.contains('mobile-details-row')) {
        next.remove();
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,4 6,8 10,4"/></svg>';
        return;
    }

    const q = tr._quoteData;
    if (!q || q.name === 'Fallback') return;

    const deltaHigh = q.fiftyTwoWeekHigh !== 0 ? ((q.currentPrice - q.fiftyTwoWeekHigh) / q.fiftyTwoWeekHigh) * 100 : 0;
    const deltaLow  = q.fiftyTwoWeekLow  !== 0 ? ((q.currentPrice - q.fiftyTwoWeekLow)  / q.fiftyTwoWeekLow)  * 100 : 0;

    const fmt = (v, sign) => `${sign && v > 0 ? '+' : ''}${v.toFixed(2)}%`;
    const cls = v => getColorClass(v);

    const detailsRow = document.createElement('tr');
    detailsRow.className = 'mobile-details-row';
    detailsRow.innerHTML = `
        <td colspan="15">
            <div class="mobile-details-grid">
                <div class="mobile-detail-item">
                    <span class="mobile-detail-label">52W High</span>
                    <span class="mobile-detail-value">${formatVal(q.fiftyTwoWeekHigh, q.currency)}</span>
                </div>
                <div class="mobile-detail-item">
                    <span class="mobile-detail-label">52W Low</span>
                    <span class="mobile-detail-value">${formatVal(q.fiftyTwoWeekLow, q.currency)}</span>
                </div>
                <div class="mobile-detail-item">
                    <span class="mobile-detail-label">Δ 52W H</span>
                    <span class="mobile-detail-value ${cls(deltaHigh)}">${fmt(deltaHigh, true)}</span>
                </div>
                <div class="mobile-detail-item">
                    <span class="mobile-detail-label">Δ 52W L</span>
                    <span class="mobile-detail-value ${cls(deltaLow)}">${fmt(deltaLow, true)}</span>
                </div>
                <div class="mobile-detail-item">
                    <span class="mobile-detail-label">YTD</span>
                    <span class="mobile-detail-value ${cls(q.ytdChange)}">${fmt(q.ytdChange, true)}</span>
                </div>
                <div class="mobile-detail-item">
                    <span class="mobile-detail-label">CAGR 1Y</span>
                    <span class="mobile-detail-value ${cls(q.cagr1y)}">${fmt(q.cagr1y, true)}</span>
                </div>
            </div>
        </td>
    `;
    tr.parentNode.insertBefore(detailsRow, tr.nextSibling);
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,8 6,4 10,8"/></svg>';
}

let activeChartSymbol = null;
const quotesMap = new Map(); // symbol → quote object, kept in sync on every fetch

async function toggleChart(symbol, tr) {
    // Close mobile details strip if open
    const maybeDetails = tr.nextElementSibling;
    if (maybeDetails && maybeDetails.classList.contains('mobile-details-row')) {
        maybeDetails.remove();
        tr.querySelector('.mobile-expand-btn').innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,4 6,8 10,4"/></svg>';
    }

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

    const candleToggleBtn = activeMainTab === 'Overview'
        ? `<button class="range-btn chart-type-btn" onclick="openCandleModal('${symbol}', '${canvasId}')">Candle</button>`
        : '';

    chartRow.innerHTML = `
        <td colspan="10">
            <div class="details-grid">
                <div class="chart-container">
                    <div class="range-selector">
                        <button class="range-btn" onclick="updateChart('${symbol}', '1d', '${canvasId}')">1D</button>
                        <button class="range-btn" onclick="updateChart('${symbol}', '5d', '${canvasId}')">5D</button>
                        <button class="range-btn" onclick="updateChart('${symbol}', '1mo', '${canvasId}')">1M</button>
                        <button class="range-btn" onclick="updateChart('${symbol}', '3mo', '${canvasId}')">3M</button>
                        <button class="range-btn" onclick="updateChart('${symbol}', '6mo', '${canvasId}')">6M</button>
                        <button class="range-btn active" onclick="updateChart('${symbol}', '1y', '${canvasId}')">1Y</button>
                        <button class="range-btn" onclick="updateChart('${symbol}', '3y', '${canvasId}')">3Y</button>
                        <button class="range-btn" onclick="updateChart('${symbol}', '5y', '${canvasId}')">5Y</button>
                        <button class="range-btn" onclick="updateChart('${symbol}', 'max', '${canvasId}')">MAX</button>
                        ${candleToggleBtn}
                    </div>
                    <div id="loading-${canvasId}" class="chart-loading">
                        <div class="spinner" style="width:24px; height:24px; margin-right:10px; margin-bottom:0;"></div>
                        Loading 1-Year History...
                    </div>
                    <canvas id="${canvasId}" style="display:none;"></canvas>
                </div>
                <div class="news-section">
                    <div class="metrics-collapse" id="metrics-collapse-${canvasId}">
                        <div class="metrics-collapse-header">
                            <span>Key Metrics</span>
                        </div>
                        <div class="metrics-collapse-body" id="metrics-content-${canvasId}">
                            <div class="metrics-loading">
                                <div class="spinner" style="width:16px; height:16px; margin-right:8px; margin-bottom:0;"></div>
                                Computing...
                            </div>
                        </div>
                    </div>
                    <div id="news-${canvasId}">
                        <div class="news-title">Related News</div>
                        <div class="chart-loading">
                            <div class="spinner" style="width:20px; height:20px; margin-right:10px; margin-bottom:0;"></div>
                            Fetching News...
                        </div>
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
    const INDEX_NEWS_TERMS = {
        '^BSESN': 'India stock market', '^NSEI': 'India stock market',
        '^DJI': 'US stock market', '^GSPC': 'US stock market', '^IXIC': 'US stock market Nasdaq',
        '^N225': 'Japan stock market Nikkei', '^FTSE': 'UK stock market FTSE',
        '^HSI': 'Hong Kong stock market Hang Seng', '399001.SZ': 'China stock market Shenzhen',
    };
    const companyName = (activeMainTab === 'Overview' && INDEX_NEWS_TERMS[symbol])
        ? INDEX_NEWS_TERMS[symbol]
        : tr.querySelector('.name-col').textContent.trim();
    fetch(`/api/news?symbol=${encodeURIComponent(symbol)}&name=${encodeURIComponent(companyName)}`)
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(newsData => renderNews(newsData, canvasId))
        .catch(() => renderNews(null, canvasId));
}


function computeAndRenderMetrics(prices, canvasId) {
    const metricsContent = document.getElementById(`metrics-content-${canvasId}`);
    if (!metricsContent) return;

    const validPrices = prices.filter(p => p !== null && p !== undefined);
    if (validPrices.length < 10) {
        metricsContent.innerHTML = '<span style="color:var(--text-secondary);font-size:0.85rem;">Not enough data.</span>';
        return;
    }

    const n = validPrices.length;
    const first = validPrices[0];
    const last = validPrices[n - 1];

    // Daily returns
    const dailyReturns = [];
    for (let i = 1; i < validPrices.length; i++) {
        if (validPrices[i - 1] !== 0) dailyReturns.push((validPrices[i] - validPrices[i - 1]) / validPrices[i - 1]);
    }

    // CAGR
    const years = n / 252;
    const cagr = Math.pow(last / first, 1 / years) - 1;

    // Annualized Volatility
    const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyReturns.length;
    const annualizedVol = Math.sqrt(variance) * Math.sqrt(252);

    // Sharpe Ratio (risk-free rate 5%)
    const sharpe = annualizedVol > 0 ? (cagr - 0.05) / annualizedVol : 0;

    // Max Drawdown
    let peak = validPrices[0], maxDrawdown = 0;
    for (const p of validPrices) {
        if (p > peak) peak = p;
        const dd = (peak - p) / peak;
        if (dd > maxDrawdown) maxDrawdown = dd;
    }

    // Best / Worst Day
    const bestDay = Math.max(...dailyReturns);
    const worstDay = Math.min(...dailyReturns);

    // Win Rate
    const winRate = dailyReturns.filter(r => r > 0).length / dailyReturns.length;

    const pct = (v, d = 1) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%`;
    const cls = (v) => v >= 0 ? 'positive' : 'negative';

    metricsContent.className = 'metrics-grid';
    metricsContent.innerHTML = `
        <div class="metric-card">
            <div class="metric-label">CAGR (1Y)</div>
            <div class="metric-value ${cls(cagr)}">${pct(cagr)}</div>
        </div>
        <div class="metric-card">
            <div class="metric-label">Sharpe Ratio</div>
            <div class="metric-value ${sharpe >= 1 ? 'positive' : sharpe >= 0 ? '' : 'negative'}">${sharpe.toFixed(2)}</div>
        </div>
        <div class="metric-card">
            <div class="metric-label">Annualized Vol</div>
            <div class="metric-value">${(annualizedVol * 100).toFixed(1)}%</div>
        </div>
        <div class="metric-card">
            <div class="metric-label">Max Drawdown</div>
            <div class="metric-value negative">-${(maxDrawdown * 100).toFixed(1)}%</div>
        </div>
        <div class="metric-card">
            <div class="metric-label">Best Day</div>
            <div class="metric-value positive">${pct(bestDay)}</div>
        </div>
        <div class="metric-card">
            <div class="metric-label">Worst Day</div>
            <div class="metric-value negative">${pct(worstDay)}</div>
        </div>
        <div class="metric-card">
            <div class="metric-label">Win Rate</div>
            <div class="metric-value ${winRate >= 0.5 ? 'positive' : 'negative'}">${(winRate * 100).toFixed(1)}%</div>
        </div>
        <div class="metric-card">
            <div class="metric-label">Trading Days</div>
            <div class="metric-value">${n}</div>
        </div>
    `;
}

const chartCache = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const chartCurrentRange = {}; // canvasId → range string (used by candle modal to open at same range)

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
    const result = chartData.chart.result[0];
    const timestamps = result.timestamp;
    const prices = result.indicators.quote[0].close;

    chartCurrentRange[canvasId] = range;

    const labels = timestamps.map(ts => {
        const date = new Date(ts * 1000);
        if (range === '1d' || range === '5d') {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        if (range === 'max' || range === '5y' || range === '3y') return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: (range === '1y' || range === '6mo') ? '2-digit' : undefined });
    });

    // Robust trend detection for Indices and Stocks
    const validPrices = prices.filter(p => p !== null && p !== undefined);
    let isUp = true;
    if (validPrices.length >= 2) {
        isUp = validPrices[validPrices.length - 1] >= validPrices[0];
    }

    renderChart(canvasId, labels, prices, symbol, range, isUp);
    loading.style.display = 'none';
    if (range === '1y') computeAndRenderMetrics(prices, canvasId);
}

function renderNews(newsData, canvasId) {
    const newsContainer = document.getElementById(`news-${canvasId}`);

    if (newsData && newsData.news && newsData.news.length > 0) {
        let newsHtml = '<div class="news-title">Related News</div>';
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
        newsContainer.innerHTML = '<div class="news-title">Related News</div><div style="color:var(--text-secondary); font-size:0.85rem; padding:1rem;">No news available for this symbol.</div>';
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

// ── Candle Modal ────────────────────────────────────────────────────────────

const CANDLE_INTERVALS = {
    '1d':  [{ label: '1m', value: '1m' }, { label: '5m', value: '5m' }, { label: '15m', value: '15m' }, { label: '30m', value: '30m' }, { label: '1H', value: '60m' }],
    '5d':  [{ label: '5m', value: '5m' }, { label: '15m', value: '15m' }, { label: '30m', value: '30m' }, { label: '1H', value: '60m' }],
    '1mo': [{ label: '1D', value: '1d' }],
    '3mo': [{ label: '1D', value: '1d' }, { label: '1W', value: '1wk' }],
    '6mo': [{ label: '1D', value: '1d' }, { label: '1W', value: '1wk' }],
    '1y':  [{ label: '1D', value: '1d' }, { label: '1W', value: '1wk' }],
    '3y':  [{ label: '1D', value: '1d' }, { label: '1W', value: '1wk' }, { label: '1M', value: '1mo' }],
    '5y':  [{ label: '1W', value: '1wk' }, { label: '1M', value: '1mo' }],
    'max': [{ label: '1M', value: '1mo' }],
};
const CANDLE_DEFAULT_INTERVAL = {
    '1d': '5m', '5d': '15m',
    '1mo': '1d', '3mo': '1d', '6mo': '1d', '1y': '1d',
    '3y': '1wk', '5y': '1mo', 'max': '1mo'
};
const CANDLE_RANGES = [
    { label: '1D', value: '1d' }, { label: '5D', value: '5d' },
    { label: '1M', value: '1mo' }, { label: '3M', value: '3mo' },
    { label: '6M', value: '6mo' }, { label: '1Y', value: '1y' },
    { label: '3Y', value: '3y' }, { label: '5Y', value: '5y' },
    { label: 'MAX', value: 'max' }
];

let candleModalSymbol = null;
let candleModalRange = '1y';
let candleModalInterval = '1d';
const candleChartCache = {};

window.openCandleModal = function(symbol, canvasId) {
    candleModalSymbol = symbol;
    candleModalRange = chartCurrentRange[canvasId] || '1y';
    candleModalInterval = CANDLE_DEFAULT_INTERVAL[candleModalRange];

    const modal = document.getElementById('candle-modal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const q = quotesMap.get(symbol);
    document.getElementById('candle-modal-symbol').textContent = symbol + (q ? ` — ${q.name}` : '');
    document.getElementById('candle-modal-price').textContent = q ? formatVal(q.currentPrice, q.currency) : '';

    renderCandleModalControls();
    fetchAndRenderCandleModal();
};

window.closeCandleModal = function() {
    document.getElementById('candle-modal').style.display = 'none';
    document.body.style.overflow = '';
    const existing = Chart.getChart('candle-modal-canvas');
    if (existing) existing.destroy();
};

function renderCandleModalControls() {
    document.getElementById('candle-range-btns').innerHTML = CANDLE_RANGES.map(r =>
        `<button class="range-btn${r.value === candleModalRange ? ' active' : ''}"
         onclick="setCandleRange('${r.value}')">${r.label}</button>`
    ).join('');
    renderCandleIntervalBtns();
}

function renderCandleIntervalBtns() {
    const intervals = CANDLE_INTERVALS[candleModalRange] || [];
    document.getElementById('candle-interval-btns').innerHTML = intervals.map(iv =>
        `<button class="range-btn candle-interval-btn${iv.value === candleModalInterval ? ' active' : ''}"
         onclick="setCandleInterval('${iv.value}')">${iv.label}</button>`
    ).join('');
}

window.setCandleRange = function(range) {
    candleModalRange = range;
    candleModalInterval = CANDLE_DEFAULT_INTERVAL[range];
    renderCandleModalControls();
    fetchAndRenderCandleModal();
};

window.setCandleInterval = function(interval) {
    candleModalInterval = interval;
    renderCandleIntervalBtns();
    fetchAndRenderCandleModal();
};

async function fetchAndRenderCandleModal() {
    const cacheKey = `${candleModalSymbol}-${candleModalRange}-${candleModalInterval}`;
    const loading = document.getElementById('candle-modal-loading');
    const canvas = document.getElementById('candle-modal-canvas');

    if (candleChartCache[cacheKey]) {
        renderCandleModalChart(candleChartCache[cacheKey]);
        return;
    }

    loading.style.display = 'flex';
    canvas.style.display = 'none';

    try {
        const res = await fetch(`/api/chart?symbol=${encodeURIComponent(candleModalSymbol)}&range=${candleModalRange}&interval=${candleModalInterval}`);
        const data = await res.json();
        if (data.chart?.result?.[0]) {
            candleChartCache[cacheKey] = data;
            renderCandleModalChart(data);
        } else {
            loading.innerHTML = `<span style="color:var(--val-red)">No data available for this range/interval.</span>`;
        }
    } catch(e) {
        loading.innerHTML = `<span style="color:var(--val-red)">Error loading chart data.</span>`;
    }
}

function renderCandleModalChart(chartData) {
    const loading = document.getElementById('candle-modal-loading');
    const canvas = document.getElementById('candle-modal-canvas');
    const result = chartData.chart.result[0];
    const timestamps = result.timestamp;
    const q = result.indicators.quote[0];

    const ohlcData = timestamps.map((ts, i) => ({
        x: ts * 1000,
        o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i]
    })).filter(d => d.o != null && d.h != null && d.l != null && d.c != null);

    const isIntraday = candleModalRange === '1d' || candleModalRange === '5d';
    const timeUnit = isIntraday ? 'hour'
        : (candleModalInterval === '1mo') ? 'month'
        : (candleModalInterval === '1wk') ? 'week'
        : 'day';

    loading.style.display = 'none';
    canvas.style.display = 'block';

    requestAnimationFrame(() => {
        const ctx = canvas.getContext('2d');
        const existing = Chart.getChart('candle-modal-canvas');
        if (existing) existing.destroy();

        new Chart(ctx, {
            type: 'candlestick',
            data: {
                datasets: [{
                    label: candleModalSymbol,
                    data: ohlcData,
                    color: { up: '#10b981', down: '#ef4444', unchanged: '#94a3b8' },
                    borderColor: { up: '#10b981', down: '#ef4444', unchanged: '#94a3b8' }
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 400, easing: 'easeOutQuart' },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#94a3b8',
                        bodyColor: '#f1f5f9',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: (ctx) => {
                                const d = ctx.raw;
                                if (!d) return '';
                                const fmt = v => v != null ? (v >= 1000 ? (v / 1000).toFixed(2) + 'k' : v.toFixed(2)) : '—';
                                return [`O: ${fmt(d.o)}`, `H: ${fmt(d.h)}`, `L: ${fmt(d.l)}`, `C: ${fmt(d.c)}`];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: timeUnit },
                        display: true,
                        grid: { display: false },
                        ticks: { color: '#64748b', maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }
                    },
                    y: {
                        display: true,
                        position: 'right',
                        beginAtZero: false,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: '#64748b',
                            callback: v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toLocaleString('en-IN')
                        }
                    }
                }
            }
        });
    });
}

// ── End Candle Modal ─────────────────────────────────────────────────────────

// ── Ticker Chart Modal ───────────────────────────────────────────────────────

const TICKER_MODAL_CANVAS_ID = 'ticker-modal-canvas';

window.openTickerModal = function(symbol, label, price, currency) {
    document.getElementById('ticker-modal-symbol').textContent = label;
    document.getElementById('ticker-modal-price').textContent = formatVal(price, currency);

    const cid = TICKER_MODAL_CANVAS_ID;
    document.getElementById('ticker-modal-chart-body').innerHTML = `
        <div class="range-selector">
            <button class="range-btn" onclick="updateChart('${symbol}', '1d', '${cid}')">1D</button>
            <button class="range-btn" onclick="updateChart('${symbol}', '5d', '${cid}')">5D</button>
            <button class="range-btn" onclick="updateChart('${symbol}', '1mo', '${cid}')">1M</button>
            <button class="range-btn" onclick="updateChart('${symbol}', '3mo', '${cid}')">3M</button>
            <button class="range-btn" onclick="updateChart('${symbol}', '6mo', '${cid}')">6M</button>
            <button class="range-btn active" onclick="updateChart('${symbol}', '1y', '${cid}')">1Y</button>
            <button class="range-btn" onclick="updateChart('${symbol}', '3y', '${cid}')">3Y</button>
            <button class="range-btn" onclick="updateChart('${symbol}', '5y', '${cid}')">5Y</button>
            <button class="range-btn" onclick="updateChart('${symbol}', 'max', '${cid}')">MAX</button>
            <button class="range-btn chart-type-btn" onclick="openCandleModal('${symbol}', '${cid}')">Candle</button>
        </div>
        <div id="loading-${cid}" class="chart-loading">
            <div class="spinner" style="width:24px;height:24px;margin-right:10px;margin-bottom:0;"></div>
            Loading 1-Year History...
        </div>
        <div class="ticker-modal-canvas-wrap">
            <canvas id="${cid}" style="display:none;"></canvas>
        </div>
    `;

    document.getElementById('ticker-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    updateChart(symbol, '1y', cid);
};

window.closeTickerModal = function() {
    document.getElementById('ticker-modal').style.display = 'none';
    document.body.style.overflow = '';
    const existing = Chart.getChart(TICKER_MODAL_CANVAS_ID);
    if (existing) existing.destroy();
};

// ── End Ticker Chart Modal ───────────────────────────────────────────────────

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
    'HKEX':  { tz: 'Asia/Hong_Kong',    open: 9.5,  close: 16   },
    'SSE':   { tz: 'Asia/Shanghai',     open: 9.5,  close: 15   },
    'CRYPTO':{ tz: 'UTC',               open: 0,    close: 24   },
};

const SYMBOL_EXCHANGE_MAP = {
    '^BSESN': 'BSE', '^NSEI': 'NSE', '^NSEBANK': 'NSE', '^NSEMDCP50': 'NSE',
    '^CNXIT': 'NSE', '^CNXAUTO': 'NSE', '^CNXFMCG': 'NSE', '^CNXMETAL': 'NSE',
    '^CNXPHARMA': 'NSE', '^CNXREALTY': 'NSE', 'BSE-MIDCAP.BO': 'BSE', 'BSE-SMLCAP.BO': 'BSE',
    '^DJI': 'NYSE', '^GSPC': 'NYSE', '^IXIC': 'NASDAQ',
    '^FTSE': 'LSE', '^N225': 'TSE', '^HSI': 'HKEX', '399001.SZ': 'SSE',
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
            const intensity = Math.min(Math.abs(q.percentChange) / 3, 1) * 0.18;
            const rgb = q.change >= 0 ? '16,185,129' : '239,68,68';
            const bgStyle = `background:rgba(${rgb},${intensity.toFixed(3)})`;
            return `<div class="ticker-item" style="${bgStyle}" onclick="openTickerModal('${q.symbol}', '${label}', ${q.currentPrice}, '${q.currency}')">
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
        <td class="symbol-col hide-mobile" style="font-size:0.8rem; color:var(--text-secondary);">${mf.schemeCode}</td>
        <td class="mf-scheme-name" title="${escapeAttr(mf.schemeName)}">${displayName}</td>
        <td class="right-align price-col">₹${navFmt}</td>
        <td class="right-align price-col ${changeClass}"><span class="change-pct">${pctFmt}</span><span class="change-abs">${changeFmt}</span></td>
        <td class="right-align price-col">${fmtCagr(mf.cagr1y)}</td>
        <td class="right-align price-col hide-mobile">${fmtCagr(mf.cagr3y)}</td>
        <td class="right-align price-col hide-mobile">${high52Fmt}</td>
        <td class="right-align price-col hide-mobile">${low52Fmt}</td>
        <td class="right-align price-col ${deltaHighClass} hide-mobile">${deltaHighFmt}</td>
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
        <div class="mf-compare-chart-section" id="mf-compare-chart-section">
            <div class="mf-compare-chart-toggle-row">
                <span class="mf-compare-chart-toggle-label">Performance Chart</span>
                <button class="glass-btn mf-compare-chart-toggle-btn" onclick="toggleCompareChart()">Hide ▴</button>
            </div>
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
        </div>
        <div class="mf-compare-metrics-section">
            ${buildCompareMetricsTable(compareFundsData)}
        </div>
    `;

    renderCompareChart(compareFundsData, compareRange);
}

window.toggleCompareChart = function () {
    const section = document.getElementById('mf-compare-chart-section');
    const btn = section.querySelector('.mf-compare-chart-toggle-btn');
    const isVisible = section.dataset.collapsed !== 'true';
    if (isVisible) {
        section.querySelector('.mf-compare-chart-wrap').style.display = 'none';
        section.querySelector('.mf-compare-range-row').style.display = 'none';
        btn.textContent = 'Show ▾';
        section.dataset.collapsed = 'true';
    } else {
        section.querySelector('.mf-compare-chart-wrap').style.display = '';
        section.querySelector('.mf-compare-range-row').style.display = '';
        btn.textContent = 'Hide ▴';
        section.dataset.collapsed = 'false';
    }
};

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
// US ETFs — Row + Compare
// =============================================================================

const selectedETFs   = new Map(); // symbol → quote object
const ETF_COMPARE_MAX = 5;
const ETF_RANGE_LABEL = { '3mo': '3M', '6mo': '6M', '1y': '1Y', '3y': '3Y' };
const ETF_RANGE_DAYS  = { '3mo': 90,   '6mo': 180,  '1y': 365,  '3y': 1095 };
let etfCompareRange = '1y';
let etfCompareFundsData = [];
let handleETFCompareEsc = null;
const etfChartCache = {};

function createETFRow(q) {
    const tr = document.createElement('tr');
    tr.setAttribute('data-symbol', q.symbol);

    const cbTd = document.createElement('td');
    cbTd.className = 'mf-cb-cell';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selectedETFs.has(q.symbol);
    cb.addEventListener('change', () => handleETFCheckboxChange(q, cb));
    cbTd.appendChild(cb);
    tr.appendChild(cbTd);

    // Reuse updateRow on a temp element then move cells across
    const temp = document.createElement('tr');
    updateRow(temp, q);
    while (temp.firstChild) tr.appendChild(temp.firstChild);

    tr.addEventListener('click', (e) => {
        if (e.target.closest('.mf-cb-cell') || e.target.closest('.remove-btn')) return;
        toggleChart(q.symbol, tr);
    });
    return tr;
}

function handleETFCheckboxChange(q, cb) {
    if (cb.checked) {
        if (selectedETFs.size >= ETF_COMPARE_MAX) { cb.checked = false; return; }
        selectedETFs.set(q.symbol, q);
    } else {
        selectedETFs.delete(q.symbol);
    }
    updateETFCompareBar();
}

function updateETFCompareBar() {
    const bar = document.getElementById('etf-compare-bar');
    const countEl = document.getElementById('etf-compare-count');
    const n = selectedETFs.size;
    if (n >= 2) {
        bar.style.display = 'flex';
        countEl.textContent = `${n} ETF${n > 1 ? 's' : ''} selected`;
    } else {
        bar.style.display = 'none';
    }
}

async function openETFCompareModal() {
    const modal = document.getElementById('etf-compare-modal');
    const body  = document.getElementById('etf-compare-dialog-body');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    body.innerHTML = `<div class="chart-loading" style="height:200px"><div class="spinner"></div></div>`;

    const etfs = Array.from(selectedETFs.values());
    etfCompareRange = '1y';

    try {
        await Promise.all(etfs.map(q => fetchETFChartData(q.symbol, q.name)));
    } catch (e) {
        body.innerHTML = `<p style="color:var(--val-red);padding:2rem;">Failed to load chart data.</p>`;
        return;
    }

    etfCompareFundsData = etfs.map(q => {
        const cached = etfChartCache[q.symbol] || null;
        return { q, chartData: cached, metrics: cached ? calcETFMetrics(cached.closes) : {} };
    });

    renderETFCompareModalContent(body);
    document.querySelector('#etf-compare-modal .etf-compare-backdrop').onclick = closeETFCompareModal;
    handleETFCompareEsc = (e) => { if (e.key === 'Escape') closeETFCompareModal(); };
    document.addEventListener('keydown', handleETFCompareEsc);
}

function closeETFCompareModal() {
    document.getElementById('etf-compare-modal').style.display = 'none';
    document.body.style.overflow = '';
    const existing = Chart.getChart('etf-compare-canvas');
    if (existing) existing.destroy();
    if (handleETFCompareEsc) {
        document.removeEventListener('keydown', handleETFCompareEsc);
        handleETFCompareEsc = null;
    }
}

async function fetchETFChartData(symbol, name) {
    if (etfChartCache[symbol]) return etfChartCache[symbol];
    const resp = await fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&range=5y`);
    if (!resp.ok) throw new Error('Network error');
    const json = await resp.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error('No data for ' + symbol);
    const timestamps = result.timestamp || [];
    const closes     = result.indicators?.quote?.[0]?.close || [];
    etfChartCache[symbol] = { timestamps, closes, symbol, name };
    return etfChartCache[symbol];
}

function calcETFMetrics(closes) {
    const prices = closes.filter(c => c != null && !isNaN(c));
    const n = prices.length;
    if (n < 2) return {};

    const dailyRets = [];
    for (let i = 1; i < n; i++) {
        if (prices[i] > 0 && prices[i - 1] > 0)
            dailyRets.push(Math.log(prices[i] / prices[i - 1]));
    }

    const mean = dailyRets.reduce((s, r) => s + r, 0) / dailyRets.length;
    const variance = dailyRets.reduce((s, r) => s + (r - mean) ** 2, 0) / dailyRets.length;
    const volatility = Math.sqrt(variance * 252) * 100;

    let peak = prices[0], maxDD = 0;
    for (const p of prices) {
        if (p > peak) peak = p;
        const dd = (peak - p) / peak;
        if (dd > maxDD) maxDD = dd;
    }

    const ret = (days) => n > days
        ? ((prices[n - 1] - prices[n - 1 - days]) / prices[n - 1 - days]) * 100
        : null;

    const years = n / 252;
    const annRet = prices[0] > 0 ? (Math.pow(prices[n - 1] / prices[0], 1 / years) - 1) * 100 : null;
    const sharpe = volatility > 0 && annRet != null ? annRet / volatility : null;

    return {
        ret1m: ret(21), ret3m: ret(63), ret6m: ret(126),
        ret1y: ret(252), ret3y: ret(756),
        volatility, maxDrawdown: maxDD * 100, sharpe
    };
}

function renderETFCompareModalContent(body) {
    const rangeButtons = Object.keys(ETF_RANGE_LABEL).map(r =>
        `<button class="range-btn${r === etfCompareRange ? ' active' : ''}" onclick="switchETFCompareRange('${r}')">${ETF_RANGE_LABEL[r]}</button>`
    ).join('');

    body.innerHTML = `
        <div class="mf-compare-chart-section" id="etf-compare-chart-section">
            <div class="mf-compare-chart-toggle-row">
                <span class="mf-compare-chart-toggle-label">Performance Chart</span>
                <button class="glass-btn mf-compare-chart-toggle-btn" onclick="toggleETFCompareChart()">Hide ▴</button>
            </div>
            <div class="mf-compare-range-row">
                <div class="range-selector">${rangeButtons}</div>
                <span class="mf-compare-range-note">Normalized to 100 at start of period</span>
            </div>
            <div class="mf-compare-chart-wrap">
                <div id="etf-compare-chart-loading" class="chart-loading">
                    <div class="spinner" style="width:22px;height:22px;margin-right:10px;margin-bottom:0;"></div>
                    Building comparison...
                </div>
                <canvas id="etf-compare-canvas" style="display:none;"></canvas>
            </div>
        </div>
        <div class="mf-compare-metrics-section">
            ${buildETFCompareMetricsTable(etfCompareFundsData)}
        </div>
    `;
    renderETFCompareChart(etfCompareFundsData, etfCompareRange);
}

window.switchETFCompareRange = function (range) {
    etfCompareRange = range;
    document.querySelectorAll('#etf-compare-dialog-body .range-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent === ETF_RANGE_LABEL[range]);
    });
    renderETFCompareChart(etfCompareFundsData, range);
};

window.toggleETFCompareChart = function () {
    const section = document.getElementById('etf-compare-chart-section');
    const btn = section.querySelector('.mf-compare-chart-toggle-btn');
    const isVisible = section.dataset.collapsed !== 'true';
    if (isVisible) {
        section.querySelector('.mf-compare-chart-wrap').style.display = 'none';
        section.querySelector('.mf-compare-range-row').style.display = 'none';
        btn.textContent = 'Show ▾';
        section.dataset.collapsed = 'true';
    } else {
        section.querySelector('.mf-compare-chart-wrap').style.display = '';
        section.querySelector('.mf-compare-range-row').style.display = '';
        btn.textContent = 'Hide ▴';
        section.dataset.collapsed = 'false';
    }
};

function renderETFCompareChart(fundsData, range) {
    const loading = document.getElementById('etf-compare-chart-loading');
    const canvas  = document.getElementById('etf-compare-canvas');
    if (!loading || !canvas) return;

    const days   = ETF_RANGE_DAYS[range] || 365;
    const cutoff = Date.now() / 1000 - days * 86400;
    const datasets = [];
    let sharedLabels = null;

    fundsData.forEach(({ q, chartData }, i) => {
        if (!chartData || !chartData.timestamps || chartData.timestamps.length === 0) return;

        const filtered = chartData.timestamps
            .map((t, idx) => ({ t, c: chartData.closes[idx] }))
            .filter(d => d.t >= cutoff && d.c != null);

        if (filtered.length === 0) return;

        if (!sharedLabels) {
            sharedLabels = filtered.map(d =>
                new Date(d.t * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
            );
        }

        const prices = filtered.map(d => d.c);
        const base   = prices[0] || 1;
        const normalized = prices.map(v => parseFloat(((v / base) * 100).toFixed(2)));
        const color = COMPARE_COLORS[i % COMPARE_COLORS.length];

        datasets.push({
            label: q.name || q.symbol,
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
        const existing = Chart.getChart('etf-compare-canvas');
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
                        display: true, position: 'top',
                        labels: { color: '#94a3b8', font: { size: 11, family: 'Inter' }, boxWidth: 20, padding: 14 }
                    },
                    tooltip: {
                        mode: 'index', intersect: false,
                        backgroundColor: 'rgba(15,23,42,0.95)',
                        titleColor: '#94a3b8', bodyColor: '#f1f5f9',
                        borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 10,
                        callbacks: {
                            label: ctx => {
                                const val  = ctx.parsed.y;
                                const gain = val - 100;
                                const sign = gain >= 0 ? '+' : '';
                                return `${ctx.dataset.label}: ${val.toFixed(2)} (${sign}${gain.toFixed(2)}%)`;
                            }
                        }
                    }
                },
                scales: {
                    x: { display: true, grid: { display: false }, ticks: { color: '#64748b', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
                    y: { display: true, beginAtZero: false, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', callback: v => v.toFixed(0) } }
                }
            }
        });
    });
}

function buildETFCompareMetricsTable(fundsData) {
    const fmtRet = v => v != null ? `<span class="${v > 0 ? 'val-green' : v < 0 ? 'val-red' : ''}">${v > 0 ? '+' : ''}${v.toFixed(2)}%</span>` : '<span class="mf-na">—</span>';
    const fmtPct = v => v != null ? `${v.toFixed(2)}%` : '<span class="mf-na">—</span>';
    const fmtNum = v => v != null ? v.toFixed(2) : '<span class="mf-na">—</span>';
    const fmtUSD = v => v != null ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '<span class="mf-na">—</span>';

    const METRICS = [
        { section: 'Current' },
        { label: 'Price (USD)',     get: d => d.q.currentPrice,    lowerBetter: false, fmt: fmtUSD },
        { label: 'Day Change %',    get: d => d.q.percentChange,   lowerBetter: false, fmt: fmtRet },
        { label: '52W High',        get: d => d.q.fiftyTwoWeekHigh, lowerBetter: false, fmt: fmtUSD, noHighlight: true },
        { label: '52W Low',         get: d => d.q.fiftyTwoWeekLow,  lowerBetter: false, fmt: fmtUSD, noHighlight: true },
        { label: '% from 52W High', get: d => d.q.fiftyTwoWeekHigh ? ((d.q.currentPrice - d.q.fiftyTwoWeekHigh) / d.q.fiftyTwoWeekHigh) * 100 : null, lowerBetter: false, fmt: fmtRet },
        { section: 'Returns' },
        { label: '1 Month',   get: d => d.metrics.ret1m,  lowerBetter: false, fmt: fmtRet },
        { label: '3 Months',  get: d => d.metrics.ret3m,  lowerBetter: false, fmt: fmtRet },
        { label: '6 Months',  get: d => d.metrics.ret6m,  lowerBetter: false, fmt: fmtRet },
        { label: '1 Year',    get: d => d.metrics.ret1y,  lowerBetter: false, fmt: fmtRet },
        { label: '3 Years',   get: d => d.metrics.ret3y,  lowerBetter: false, fmt: fmtRet },
        { section: 'Risk' },
        { label: 'Volatility (ann.)', get: d => d.metrics.volatility,   lowerBetter: true,  fmt: fmtPct },
        { label: 'Max Drawdown',      get: d => d.metrics.maxDrawdown,  lowerBetter: true,  fmt: v => v != null ? `<span class="val-red">${v.toFixed(2)}%</span>` : '<span class="mf-na">—</span>' },
        { label: 'Sharpe Ratio',      get: d => d.metrics.sharpe,       lowerBetter: false, fmt: v => v != null ? `<span class="${v >= 1 ? 'val-green' : v > 0 ? '' : 'val-red'}">${v.toFixed(2)}</span>` : '<span class="mf-na">—</span>' },
    ];

    const colCount = fundsData.length + 1;
    const headerCols = fundsData.map(({ q }, i) => {
        const color = COMPARE_COLORS[i % COMPARE_COLORS.length];
        return `<th class="fund-col" style="color:${color};">${q.name || q.symbol}</th>`;
    }).join('');

    const rows = METRICS.map(m => {
        if (m.section) return `<tr class="mf-compare-section-row"><td colspan="${colCount}">${m.section}</td></tr>`;

        const rawVals = fundsData.map(d => { const v = m.get(d); return (v != null && !isNaN(v)) ? v : null; });
        const nonNull = rawVals.filter(v => v !== null);
        let bestVal = null;
        if (!m.noHighlight && nonNull.length >= 2) {
            bestVal = m.lowerBetter ? Math.min(...nonNull) : Math.max(...nonNull);
        }

        const cells = fundsData.map((_, i) => {
            const v = rawVals[i];
            if (v === null) return `<td><span class="mf-na">—</span></td>`;
            const isBest = bestVal !== null && v === bestVal;
            return `<td${isBest ? ' class="mf-compare-best"' : ''}>${m.fmt(v)}</td>`;
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

document.getElementById('etf-compare-btn').addEventListener('click', openETFCompareModal);
document.getElementById('etf-compare-clear').addEventListener('click', () => {
    selectedETFs.clear();
    document.querySelectorAll('#table-body .mf-cb-cell input[type="checkbox"]').forEach(cb => cb.checked = false);
    updateETFCompareBar();
});
document.getElementById('etf-compare-close').addEventListener('click', closeETFCompareModal);

// Boot
updateMarketStatus();
renderTabs();
fetchQuotes();
initLiveTV();
setInterval(fetchQuotes, REFRESH_INTERVAL);
setInterval(updateMarketStatus, 60000);

