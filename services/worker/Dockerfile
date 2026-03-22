FROM pytorch/pytorch:2.5.1-cuda11.8-cudnn9-runtime

WORKDIR /app

# Install shared package
COPY packages/shared /app/packages/shared

# Install pip dependencies
COPY services/worker/requirements.txt /app/services/worker/requirements.txt

RUN export TZ=Etc/UTC \
        && apt update --yes \
        && apt install g++ wget ffmpeg libsm6 libxext6 gimp libvulkan1 --yes \
        && wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb \
        && dpkg -i cuda-keyring_1.1-1_all.deb \
        && rm -f cuda-keyring_1.1-1_all.deb \
        && apt update --yes \
        && apt install -y libcudnn8=8*-1+cuda11.8 libcudnn8-dev=8*-1+cuda11.8 \
        && pip install /app/packages/shared \
        && pip install -r /app/services/worker/requirements.txt \
        && apt remove g++ wget --yes \
        && apt autoremove --yes \
        && rm -rf /var/cache/apt

# Copy application code
COPY manga_translator /app/manga_translator
COPY server /app/server
COPY services/worker /app/services/worker
COPY fonts /app/fonts

# Prepare models
COPY docker_prepare.py /app/docker_prepare.py
RUN --mount=type=cache,target=/.cache/models \
    cp -rn /.cache/models/. /app/models/ || true && \
    python -u docker_prepare.py --continue-on-error && \
    cp -rn /app/models/. /.cache/models/ || true

RUN rm -rf /tmp && mkdir /tmp && chmod 1777 /tmp

ENV PYTHONPATH="/app:/app/services/worker"

CMD ["python", "-m", "worker.main", "--use-gpu", "--verbose"]
