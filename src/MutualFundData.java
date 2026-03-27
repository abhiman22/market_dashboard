public class MutualFundData {
    // Core identity & current NAV
    private int schemeCode;
    private String schemeName;
    private String fundHouse;
    private String schemeCategory;
    private double latestNav;
    private String navDate;

    // 1-day change
    private double change;
    private double percentChange;

    // 52-week range
    private double high52w;
    private double low52w;
    private double deltaHigh; // % distance from 52W high (negative = below high)

    // Point-to-point returns (simple %) — 0 means insufficient history
    private double ret1w;
    private double ret1m;
    private double ret3m;
    private double ret6m;

    // Compounded Annual Growth Rate — 0 means insufficient history
    private double cagr1y;
    private double cagr3y;
    private double cagr5y;
    private double cagrSinceInception;

    // Risk metrics — 0 means insufficient history
    private double volatility;         // annualised std dev of log returns, 1Y window (%)
    private double maxDrawdown;        // max peak-to-trough decline (%, negative value)
    private double downsideDeviation;  // annualised std dev of negative returns, 1Y window (%)
    private double sharpe;             // (CAGR_1Y − 6.5% risk-free) / volatility
    private double sortino;            // (CAGR_1Y − 6.5% risk-free) / downsideDeviation

    public MutualFundData(int schemeCode, String schemeName, String fundHouse,
                          String schemeCategory, double latestNav, String navDate,
                          double change, double percentChange,
                          double high52w, double low52w, double deltaHigh) {
        this.schemeCode = schemeCode;
        this.schemeName = schemeName;
        this.fundHouse = fundHouse;
        this.schemeCategory = schemeCategory;
        this.latestNav = latestNav;
        this.navDate = navDate;
        this.change = change;
        this.percentChange = percentChange;
        this.high52w = high52w;
        this.low52w = low52w;
        this.deltaHigh = deltaHigh;
    }

    // --- Getters for core fields ---
    public int getSchemeCode()        { return schemeCode; }
    public String getSchemeName()     { return schemeName; }
    public String getFundHouse()      { return fundHouse; }
    public String getSchemeCategory() { return schemeCategory; }
    public double getLatestNav()      { return latestNav; }
    public String getNavDate()        { return navDate; }
    public double getChange()         { return change; }
    public double getPercentChange()  { return percentChange; }
    public double getHigh52w()        { return high52w; }
    public double getLow52w()         { return low52w; }
    public double getDeltaHigh()      { return deltaHigh; }

    // --- Getters & setters for computed metrics ---
    public double getRet1w()              { return ret1w; }
    public double getRet1m()              { return ret1m; }
    public double getRet3m()              { return ret3m; }
    public double getRet6m()              { return ret6m; }
    public double getCagr1y()             { return cagr1y; }
    public double getCagr3y()             { return cagr3y; }
    public double getCagr5y()             { return cagr5y; }
    public double getCagrSinceInception() { return cagrSinceInception; }
    public double getVolatility()         { return volatility; }
    public double getMaxDrawdown()        { return maxDrawdown; }
    public double getDownsideDeviation()  { return downsideDeviation; }
    public double getSharpe()             { return sharpe; }
    public double getSortino()            { return sortino; }

    public void setRet1w(double v)               { ret1w = v; }
    public void setRet1m(double v)               { ret1m = v; }
    public void setRet3m(double v)               { ret3m = v; }
    public void setRet6m(double v)               { ret6m = v; }
    public void setCagr1y(double v)              { cagr1y = v; }
    public void setCagr3y(double v)              { cagr3y = v; }
    public void setCagr5y(double v)              { cagr5y = v; }
    public void setCagrSinceInception(double v)  { cagrSinceInception = v; }
    public void setVolatility(double v)          { volatility = v; }
    public void setMaxDrawdown(double v)         { maxDrawdown = v; }
    public void setDownsideDeviation(double v)   { downsideDeviation = v; }
    public void setSharpe(double v)              { sharpe = v; }
    public void setSortino(double v)             { sortino = v; }
}
