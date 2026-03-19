# Set the base image to Java 17
FROM openjdk:17-jdk-slim

# Set the working directory
WORKDIR /app

# Copy your source code, the json library and the frontend files into the container
COPY src/ /app/src/
COPY lib/ /app/lib/
COPY web/ /app/web/

# Compile the Java application 
RUN javac -cp "lib/gson.jar:src" src/*.java

# Run the application
CMD ["java", "-cp", "lib/gson.jar:src", "App"]
