FROM python:3.11-slim

WORKDIR /app

# System libraries required by OpenCV, PyTorch, Stockfish, and healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    stockfish \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Use the system-installed Stockfish binary
ENV STOCKFISH_PATH=/usr/bin/stockfish

CMD ["python", "server.py"]
