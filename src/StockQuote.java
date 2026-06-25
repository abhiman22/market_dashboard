public class StockQuote {
    private String symbol;
    private String name;
    private double currentPrice;
    private double change;
    private double percentChange;
    private double fiftyTwoWeekHigh;
    private double fiftyTwoWeekLow;
    private String currency;
    private double ytdChange;
    private double cagr1y;
    private double cagr3y;
    private double cagr5y;

    public StockQuote(String symbol, String name, double currentPrice, double change, double percentChange, double fiftyTwoWeekHigh, double fiftyTwoWeekLow, String currency, double ytdChange, double cagr1y, double cagr3y, double cagr5y) {
        this.symbol = symbol;
        this.name = name;
        this.currentPrice = currentPrice;
        this.change = change;
        this.percentChange = percentChange;
        this.fiftyTwoWeekHigh = fiftyTwoWeekHigh;
        this.fiftyTwoWeekLow = fiftyTwoWeekLow;
        this.currency = currency != null ? currency : "INR";
        this.ytdChange = ytdChange;
        this.cagr1y = cagr1y;
        this.cagr3y = cagr3y;
        this.cagr5y = cagr5y;
    }

    public String getSymbol() { return symbol; }
    public String getName() { return name; }
    public double getCurrentPrice() { return currentPrice; }
    public double getChange() { return change; }
    public double getPercentChange() { return percentChange; }
    public double getFiftyTwoWeekHigh() { return fiftyTwoWeekHigh; }
    public double getFiftyTwoWeekLow() { return fiftyTwoWeekLow; }
    public String getCurrency() { return currency; }
    public double getYtdChange() { return ytdChange; }
    public double getCagr1y() { return cagr1y; }
    public double getCagr3y() { return cagr3y; }
    public double getCagr5y() { return cagr5y; }

    @Override
    public String toString() {
        return String.format("%s (%s): %.2f (%.2f | %.2f%%) [52W High: %.2f, Low: %.2f]", name, symbol, currentPrice, change, percentChange, fiftyTwoWeekHigh, fiftyTwoWeekLow);
    }
}
