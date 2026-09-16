FROM python:3.12-slim

# ffmpeg decodes what MediaRecorder sends; libsndfile backs soundfile.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg libsndfile1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shadowline ./shadowline
RUN useradd -u 10001 -m worker
USER worker
ENTRYPOINT ["python", "-m", "shadowline.worker"]
