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

# Fetch the Whisper weights at build time rather than on the first job: the
# alternative is every fresh replica downloading hundreds of megabytes while an
# admin watches the studio wait for words.
ARG WHISPER_MODEL=small.en
ENV WHISPER_MODEL=${WHISPER_MODEL} \
    HF_HOME=/home/worker/.cache/huggingface
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8')"
ENTRYPOINT ["python", "-m", "shadowline.worker"]
