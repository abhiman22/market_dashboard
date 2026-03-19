import javax.swing.*;
import javax.swing.table.DefaultTableModel;
import javax.swing.table.DefaultTableCellRenderer;
import java.awt.*;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

public class StockDashboardUI extends JFrame {
    private final StockAPIClient apiClient;
    private final Map<String, List<String>> sectorSymbols;
    private final Map<String, DefaultTableModel> sectorModels;

    private JTabbedPane tabbedPane;
    private JButton refreshBtn;
    private JTextField symbolInput;
    private JButton addSymbolBtn;

    public StockDashboardUI() {
        super("BSE / NSE Stock Tracker - Sectors & Large Cap 30");
        this.apiClient = new StockAPIClient();
        this.sectorSymbols = new LinkedHashMap<>();
        this.sectorModels = new LinkedHashMap<>();
        
        setupData();
        initUI();
        refreshData();
    }

    private void setupData() {
        sectorSymbols.put("Indices", new ArrayList<>(List.of("^BSESN", "^NSEI", "BSE-SMLCAP.BO", "^NSEMDCP50")));
        sectorSymbols.put("Financials", new ArrayList<>(List.of("HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "KOTAKBANK.NS", "AXISBANK.NS", "INDUSINDBK.NS", "BAJFINANCE.NS", "BAJAJFINSV.NS")));
        sectorSymbols.put("IT", new ArrayList<>(List.of("TCS.NS", "INFY.NS", "HCLTECH.NS", "WIPRO.NS", "TECHM.NS")));
        sectorSymbols.put("Energy & Utilities", new ArrayList<>(List.of("RELIANCE.NS", "NTPC.NS", "POWERGRID.NS")));
        sectorSymbols.put("FMCG & Consumer", new ArrayList<>(List.of("ITC.NS", "HINDUNILVR.NS", "NESTLEIND.NS", "ASIANPAINT.NS", "TITAN.NS")));
        sectorSymbols.put("Automobile", new ArrayList<>(List.of("MARUTI.NS", "M&M.NS", "TATAMOTORS.NS", "BAJAJAUTO.NS")));
        sectorSymbols.put("Industrial, Pharma & Metals", new ArrayList<>(List.of("LT.NS", "BHARTIARTL.NS", "SUNPHARMA.NS", "TATASTEEL.NS", "ULTRACEMCO.NS", "JSWSTEEL.NS", "ADANIPORTS.NS")));
    }

    private void initUI() {
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setSize(950, 600);
        setLocationRelativeTo(null);
        setLayout(new BorderLayout(10, 10));

        Font mainFont = new Font("Segoe UI", Font.PLAIN, 14);
        Font boldFont = new Font("Segoe UI", Font.BOLD, 14);

        // Top Panel
        JPanel topPanel = new JPanel(new FlowLayout(FlowLayout.LEFT, 15, 10));
        topPanel.setBorder(BorderFactory.createEmptyBorder(10, 10, 0, 10));

        JLabel addLabel = new JLabel("Add Symbol to current tab (.NS for NSE, .BO for BSE): ");
        addLabel.setFont(boldFont);
        topPanel.add(addLabel);
        
        symbolInput = new JTextField(12);
        symbolInput.setFont(mainFont);
        symbolInput.addActionListener(e -> addSymbol());
        topPanel.add(symbolInput);
        
        addSymbolBtn = new JButton("Add");
        addSymbolBtn.setFont(mainFont);
        addSymbolBtn.setBackground(new Color(41, 128, 185));
        addSymbolBtn.setForeground(Color.WHITE);
        addSymbolBtn.setFocusPainted(false);
        addSymbolBtn.addActionListener(e -> addSymbol());
        topPanel.add(addSymbolBtn);

        refreshBtn = new JButton("Refresh Quotes");
        refreshBtn.setFont(mainFont);
        refreshBtn.setBackground(new Color(39, 174, 96));
        refreshBtn.setForeground(Color.WHITE);
        refreshBtn.setFocusPainted(false);
        refreshBtn.addActionListener(e -> refreshData());
        
        topPanel.add(Box.createHorizontalStrut(20));
        topPanel.add(refreshBtn);

        add(topPanel, BorderLayout.NORTH);

        tabbedPane = new JTabbedPane();
        tabbedPane.setFont(boldFont);

        // Custom Cell Renderer for colors
        DefaultTableCellRenderer colorRenderer = new DefaultTableCellRenderer() {
            @Override
            public Component getTableCellRendererComponent(JTable table, Object value, boolean isSelected, boolean hasFocus, int row, int column) {
                Component c = super.getTableCellRendererComponent(table, value, isSelected, hasFocus, row, column);
                if (value != null) {
                    String strValue = value.toString();
                    if (strValue.startsWith("-")) {
                        c.setForeground(new Color(192, 57, 43)); // Red
                    } else if (strValue.equals("0.00") || strValue.equals("0.00%")) {
                        c.setForeground(Color.BLACK);
                    } else if (column >= 3 && !strValue.isEmpty()) {
                        c.setForeground(new Color(39, 174, 96)); // Green
                    } else {
                        c.setForeground(Color.BLACK);
                    }
                }
                if (isSelected) c.setForeground(Color.BLACK);
                return c;
            }
        };

        String[] columns = {"Symbol", "Company Name", "Current Price (₹)", "Change", "% Change", "52W High", "52W Low", "Δ 52W High"};

        for (String sector : sectorSymbols.keySet()) {
            DefaultTableModel model = new DefaultTableModel(columns, 0) {
                @Override
                public boolean isCellEditable(int row, int column) {
                    return false;
                }
            };
            sectorModels.put(sector, model);

            JTable table = new JTable(model);
            table.setFillsViewportHeight(true);
            table.setFont(mainFont);
            table.setRowHeight(30);
            table.getTableHeader().setFont(boldFont);
            table.getTableHeader().setBackground(new Color(236, 240, 241));
            table.setSelectionBackground(new Color(189, 195, 199));
            
            table.getColumnModel().getColumn(3).setCellRenderer(colorRenderer);
            table.getColumnModel().getColumn(4).setCellRenderer(colorRenderer);
            table.getColumnModel().getColumn(7).setCellRenderer(colorRenderer);

            JScrollPane scrollPane = new JScrollPane(table);
            scrollPane.setBorder(BorderFactory.createEmptyBorder(5, 5, 5, 5));
            tabbedPane.addTab(sector, scrollPane);
        }

        add(tabbedPane, BorderLayout.CENTER);
    }

    private void addSymbol() {
        String sym = symbolInput.getText().trim().toUpperCase();
        if (sym.isEmpty()) return;

        int selectedIndex = tabbedPane.getSelectedIndex();
        if (selectedIndex >= 0) {
            String sector = tabbedPane.getTitleAt(selectedIndex);
            List<String> symbols = sectorSymbols.get(sector);
            if (!symbols.contains(sym)) {
                symbols.add(sym);
                symbolInput.setText("");
                refreshData();
            }
        }
    }

    private void refreshData() {
        refreshBtn.setEnabled(false);
        addSymbolBtn.setEnabled(false);
        setCursor(Cursor.getPredefinedCursor(Cursor.WAIT_CURSOR));
        
        for (DefaultTableModel model : sectorModels.values()) {
            model.setRowCount(0);
        }

        List<CompletableFuture<Void>> futures = new ArrayList<>();

        for (Map.Entry<String, List<String>> entry : sectorSymbols.entrySet()) {
            List<String> symbols = entry.getValue();
            DefaultTableModel model = sectorModels.get(entry.getKey());

            for (String symbol : symbols) {
                CompletableFuture<Void> future = CompletableFuture.supplyAsync(() -> {
                    try {
                        return apiClient.getQuote(symbol);
                    } catch (Exception e) {
                        System.err.println("Error fetching " + symbol + ": " + e.getMessage());
                        return new StockQuote(symbol, "Error / Not Found", 0.0, 0.0, 0.0, 0.0, 0.0);
                    }
                }).thenAcceptAsync(quote -> {
                    double highDelta = quote.getFiftyTwoWeekHigh() != 0 ? ((quote.getCurrentPrice() - quote.getFiftyTwoWeekHigh()) / quote.getFiftyTwoWeekHigh()) * 100 : 0.0;
                    Object[] rowData = {
                        quote.getSymbol(),
                        quote.getName(),
                        String.format("%.2f", quote.getCurrentPrice()),
                        (quote.getChange() > 0 ? "+" : "") + String.format("%.2f", quote.getChange()),
                        (quote.getPercentChange() > 0 ? "+" : "") + String.format("%.2f%%", quote.getPercentChange()),
                        String.format("%.2f", quote.getFiftyTwoWeekHigh()),
                        String.format("%.2f", quote.getFiftyTwoWeekLow()),
                        String.format("%.2f%%", highDelta)
                    };
                    model.addRow(rowData);
                }, SwingUtilities::invokeLater);
                
                futures.add(future);
            }
        }

        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).thenRun(() -> {
            SwingUtilities.invokeLater(() -> {
                refreshBtn.setEnabled(true);
                addSymbolBtn.setEnabled(true);
                setCursor(Cursor.getDefaultCursor());
            });
        });
    }
}
