# Web Application Creation & Deployment Summary

## Engineering Process Overview

The transition from a localized Java Swing desktop tracker to a globally accessible Cloud Native web dashboard involved three primary phases:

### 1. Backend REST API Refactoring
- **Terminated Desktop GUI (`SwingDashboardUI`)**: Eliminated all `javax.swing` libraries for memory optimization.
- **Bootstrapped `HttpServer`**: Modified `App.java` to act as an embedded Local HTTP web server on port 8080 (or process standard `PORT` environment variables provided by AWS, GCP, or Render).
- **Stateless Proxy Implementation**: Introduced `ApiHandler.java` as a REST proxy. The server extracts data from the `StockAPIClient`, injects the `52-Week High/Low` data structure, and serializes the list into lightweight JSON objects utilizing `gson.jar`.
- **Search Proxy API**: Embedded `https://query2.finance.yahoo.com` into our server to avoid strict browser CORS limitations, powering our dynamic front-end dropdowns on `api/search`.

### 2. Frontend User Interface Transformation
- **Hierarchical Structuring (`index.html`)**: Established an architecture supporting dynamic Main Tabs (Indices/Equities) partitioning into cascading Sub-tabs (Small Cap/Fintech).
- **Aesthetic Design (`style.css`)**: Used deep space styling (dark mode, translucent frost `#0c0e15`), vivid dynamic texts with `linear-gradient` clipping to provide an ultra-modern user experience. 
- **Dynamic JavaScript Engine (`script.js`)**: Shifted application state from the Java server to Browser `localStorage`, enabling caching and state-persistence. Programmed dynamic DOM mutations allowing 🗑️ deletions and auto-completed search additions.

### 3. Cloud Native Deployment Architecture
- **Dockerization (`Dockerfile`)**: Composed an image layered on `eclipse-temurin:17-jdk-jammy` allowing zero-configuration cloud hosting.
- **Git Ignoring (`.gitignore`)**: Obfuscated binaries (like `.class`) to ensure cleaner code repositories.

---

## Terminal Command Execution Log

Below is the chronological log of all meaningful terminal interactions utilized to develop, debug, configure, and ship the application.

### Compilation & Local Testing
We utilized a unified command to dynamically feed GSON dependencies to the Java compiler (`javac`) during hot-reloads:
```bash
# Compiles all .java files associating the explicit lib folder, then launches the server
javac -cp "lib/gson.jar:src" src/*.java && java -cp "lib/gson.jar:src" App
```

### Temporary Web Tunnel Access
Prior to creating the GitHub repository, we temporarily pushed port 8080 traffic to a secure public URL (Serveo):
```bash
ssh -o StrictHostKeyChecking=no -R 80:localhost:8080 serveo.net
```

### Git Version Control & GitHub Integration
We staged, committed, and forcefully published local files to an empty remote repository online:
```bash
# Initialize a Git environment within your codebase
git init

# Configure user identity
git config user.name "Vanguard User"
git config user.email "user@vanguard.local"

# Stage all files (.java, .html, Dockerfile, lib)
git add .

# Snapshot our source-code in history
git commit -m "Initial commit of Web Vanguard Dashboard"

# Link our terminal git to the URL you generated 
git remote add origin https://github.com/abhiman22/market_dashboard.git

# Establish main branch
git branch -M main

# Force Push (Overwriting the empty GitHub README blockages with our robust code)
git push -u origin main --force
```
