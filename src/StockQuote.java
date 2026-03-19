public class StockQuote {
    private String symbol;
    private String name;
    private double currentPrice;
    private double change;
    private double percentChange;
    private double fiftyTwoWeekHigh;
    private double fiftyTwoWeekLow;

    public StockQuote(String symbol, String name, double currentPrice, double change, double percentChange, double fiftyTwoWeekHigh, double fiftyTwoWeekLow) {
        this.symbol = symbol;
        this.name = name;
        this.currentPrice = currentPrice;
        this.change = change;
        this.percentChange = percentChange;
        this.fiftyTwoWeekHigh = fiftyTwoWeekHigh;
        this.fiftyTwoWeekLow = fiftyTwoWeekLow;
    }

    public String getSymbol() { return symbol; }
    public String getName() { return name; }
    public double getCurrentPrice() { return currentPrice; }
    public double getChange() { return change; }
    public double getPercentChange() { return percentChange; }
    public double getFiftyTwoWeekHigh() { return fiftyTwoWeekHigh; }
    public double getFiftyTwoWeekLow() { return fiftyTwoWeekLow; }

    @Override
    public String toString() {
        return String.format("%s (%s): %.2f (%.2f | %.2f%%) [52W High: %.2f, Low: %.2f]", name, symbol, currentPrice, change, percentChange, fiftyTwoWeekHigh, fiftyTwoWeekLow);
    }
}
