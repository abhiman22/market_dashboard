# Set the base image to Java 17
FROM eclipse-temurin:17-jdk-jammy

# Set the working directory
WORKDIR /app

# Copy your source code, the json library and the frontend files into the container
COPY src/ /app/src/
COPY lib/ /app/lib/
COPY web/ /app/web/

# Compile the Java application
RUN mkdir -p bin && javac -cp "lib/gson.jar:lib/pdfbox-app-2.0.31.jar:src" src/*.java -d bin

# Run the application
CMD ["java", "-cp", "lib/gson.jar:lib/pdfbox-app-2.0.31.jar:bin", "App"]
