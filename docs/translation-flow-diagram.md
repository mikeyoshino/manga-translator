# Translation Task Flow

Sequence diagram showing how a single image translation request is processed end-to-end.

---

## Single Image Translation

```mermaid
sequenceDiagram
    participant Client as Browser (React)
    participant API as FastAPI API Server
    participant Redis as Redis
    participant Worker as GPU Worker

    Note over Client,Worker: 1. Submit Translation Request

    Client->>API: POST /translate/json (image + config)
    API->>Redis: SET task:{id}:image <bytes> EX 3600
    API->>Redis: XADD tasks:translate {task_id, config, user_id}
    API->>Redis: SUBSCRIBE progress:{task_id}

    Note over Client,Worker: 2. Worker Picks Up Job

    Worker->>Redis: XREADGROUP tasks:translate workers (blocking)
    Redis-->>Worker: Message {task_id, config}
    Worker->>Redis: GET task:{id}:image
    Redis-->>Worker: Image bytes

    Note over Client,Worker: 3. ML Pipeline Executes

    Worker->>Worker: Detection (DBNET/CTD)
    Worker->>Redis: PUBLISH progress:{id} [code=1, "detection"]
    Redis-->>API: Frame [code=1, "detection"]

    Worker->>Worker: OCR
    Worker->>Redis: PUBLISH progress:{id} [code=1, "ocr"]
    Redis-->>API: Frame [code=1, "ocr"]

    Worker->>Worker: Text Line Merge
    Worker->>Redis: PUBLISH progress:{id} [code=1, "textline_merge"]
    Redis-->>API: Frame [code=1, "textline_merge"]

    Worker->>Worker: Mask Generation
    Worker->>Redis: PUBLISH progress:{id} [code=1, "mask-generation"]
    Redis-->>API: Frame [code=1, "mask-generation"]

    Worker->>Worker: Inpainting (LaMa/SD)
    Worker->>Redis: PUBLISH progress:{id} [code=1, "inpainting"]
    Redis-->>API: Frame [code=1, "inpainting"]

    Worker->>Worker: Translation (OpenAI/DeepL/etc.)
    Worker->>Redis: PUBLISH progress:{id} [code=1, "translating"]
    Redis-->>API: Frame [code=1, "translating"]

    Worker->>Worker: Rendering
    Worker->>Redis: PUBLISH progress:{id} [code=1, "rendering"]
    Redis-->>API: Frame [code=1, "rendering"]

    Note over Client,Worker: 4. Return Result

    Worker->>Redis: SET result:{id} <pickled Context> EX 3600
    Worker->>Redis: PUBLISH progress:{id} [code=0, <pickled Context>]
    Worker->>Redis: XACK tasks:translate workers {msg_id}
    Redis-->>API: Frame [code=0, <pickled Context>]
    API-->>Client: JSON response (translations, inpainted image, etc.)
```

---

## Streaming Translation

When the client uses a streaming endpoint, progress frames are forwarded in real-time:

```mermaid
sequenceDiagram
    participant Client as Browser (React)
    participant API as FastAPI API Server
    participant Redis as Redis
    participant Worker as GPU Worker

    Client->>API: POST /translate/json/stream
    API->>Redis: XADD tasks:translate {task_id, config}
    API->>Redis: SUBSCRIBE progress:{task_id}

    Note over API,Client: StreamingResponse opened

    Worker->>Redis: XREADGROUP (picks up job)
    Worker->>Redis: GET task:{id}:image

    loop Each pipeline stage
        Worker->>Worker: Execute stage
        Worker->>Redis: PUBLISH progress:{id} [code=1, stage_name]
        Redis-->>API: Frame [code=1, stage_name]
        API-->>Client: Binary frame (forwarded as-is)
        Note over Client: Update progress bar
    end

    Worker->>Redis: SET result:{id} <pickled Context>
    Worker->>Redis: PUBLISH progress:{id} [code=0, result]
    Worker->>Redis: XACK
    Redis-->>API: Frame [code=0, result]
    API->>API: Unpickle Context, transform to JSON
    API-->>Client: Final binary frame (translated result)
    Note over Client: Render translated image
```

---

## Project Image Translation (Batch)

When translating multiple images in a project:

```mermaid
sequenceDiagram
    participant Client as Browser (React)
    participant API as FastAPI API Server
    participant Redis as Redis
    participant W1 as GPU Worker A
    participant W2 as GPU Worker B

    Client->>API: POST /projects/{id}/images/{img1}/translate
    Client->>API: POST /projects/{id}/images/{img2}/translate
    Client->>API: POST /projects/{id}/images/{img3}/translate

    API->>Redis: XADD job_1
    API->>Redis: XADD job_2
    API->>Redis: XADD job_3
    API->>Redis: SUBSCRIBE progress:{job_1}
    API->>Redis: SUBSCRIBE progress:{job_2}
    API->>Redis: SUBSCRIBE progress:{job_3}

    Note over Redis,W2: Redis distributes jobs across workers

    Redis-->>W1: job_1
    Redis-->>W2: job_2

    par Worker A processes job_1
        W1->>Redis: PUBLISH progress:{job_1} [code=1, stages...]
        Redis-->>API: Progress frames
        API-->>Client: Stream frames for img1
        W1->>Redis: PUBLISH progress:{job_1} [code=0, result]
        W1->>Redis: XACK job_1
    and Worker B processes job_2
        W2->>Redis: PUBLISH progress:{job_2} [code=1, stages...]
        Redis-->>API: Progress frames
        API-->>Client: Stream frames for img2
        W2->>Redis: PUBLISH progress:{job_2} [code=0, result]
        W2->>Redis: XACK job_2
    end

    Note over Redis,W2: job_3 picked up by whichever worker finishes first

    Redis-->>W1: job_3
    W1->>Redis: PUBLISH progress:{job_3} [code=1, stages...]
    W1->>Redis: PUBLISH progress:{job_3} [code=0, result]
    W1->>Redis: XACK job_3
    Redis-->>API: Result frame
    API-->>Client: Stream frames for img3

    Client->>API: Save results to Supabase Storage
```

---

## RunPod Serverless Mode

When `WORKER_MODE=runpod`, the API bypasses Redis and talks directly to RunPod's HTTP API. Smart routing on the worker auto-selects the best translator chain.

```mermaid
sequenceDiagram
    participant Client as Browser (React)
    participant API as FastAPI API Server (Contabo)
    participant RunPod as RunPod Serverless API
    participant Worker as GPU Worker (runpod_handler.py)

    Note over Client,Worker: 1. Submit Translation Request

    Client->>API: POST /translate/json { image, config: { target_lang: "THA" } }
    API->>API: Encode image to base64, serialize config to JSON

    Note over Client,Worker: 2. Submit to RunPod

    API->>RunPod: POST /v2/{endpoint}/run { input: { image_b64, config_json } }
    RunPod-->>API: { id: "job_abc123", status: "IN_QUEUE" }

    Note over Client,Worker: 3. RunPod Queues & Dispatches to Worker

    RunPod->>Worker: handler(event) with { image_b64, config_json }

    Note over Worker: 4. Smart Routing

    Worker->>Worker: apply_smart_routing(config)
    Note over Worker: target_lang="THA" → translator_chain="sugoi:ENG;chatgpt:THA"

    Note over Worker: 5. ML Pipeline Executes

    Worker->>Worker: Detection (DBNET/CTD)
    Worker->>Worker: OCR → detects source: JPN
    Worker->>Worker: Text merge + Mask generation
    Worker->>Worker: Inpainting (LaMa)
    Worker->>Worker: Translation: Sugoi JPN→ENG, then ChatGPT ENG→THA
    Worker->>Worker: Rendering (Kanit font for THA)

    Worker-->>RunPod: TranslationResponse JSON

    Note over Client,Worker: 6. API Polls for Result

    loop Exponential backoff (1s → 5s max)
        API->>RunPod: GET /v2/{endpoint}/status/job_abc123
        RunPod-->>API: { status: "IN_PROGRESS" }
    end

    API->>RunPod: GET /v2/{endpoint}/status/job_abc123
    RunPod-->>API: { status: "COMPLETED", output: TranslationResponse }

    Note over Client,Worker: 7. Return to Client

    API-->>Client: JSON response (translations, inpainted image)
```

### RunPod Streaming Mode

No real-time progress is available from RunPod. The API sends a placeholder frame while polling:

```mermaid
sequenceDiagram
    participant Client as Browser
    participant API as FastAPI API Server
    participant RunPod as RunPod Serverless

    Client->>API: POST /translate/json/stream
    Note over API,Client: StreamingResponse opened

    API-->>Client: Binary frame [code=1, "Processing on GPU..."]

    API->>RunPod: POST /v2/{endpoint}/run
    RunPod-->>API: job_id

    loop Poll until complete
        API->>RunPod: GET /status/{job_id}
        RunPod-->>API: IN_PROGRESS
    end

    RunPod-->>API: COMPLETED + TranslationResponse

    API-->>Client: Binary frame [code=0, TranslationResponse JSON]
    Note over Client: Render translated image
```

---

## Worker Failure & Recovery

```mermaid
sequenceDiagram
    participant API as FastAPI API Server
    participant Redis as Redis
    participant W1 as GPU Worker A (dies)
    participant W2 as GPU Worker B

    API->>Redis: XADD job_1
    Redis-->>W1: job_1 delivered

    W1->>Redis: PUBLISH progress:{job_1} [code=1, "detection"]
    W1->>Redis: PUBLISH progress:{job_1} [code=1, "ocr"]

    Note over W1: Worker A crashes! (no XACK sent)

    Note over Redis: Message stays in Pending Entries List (PEL)

    Note over W1: Heartbeat key expires after 30s
    API->>Redis: Check workers:active → stale worker removed

    Note over W2: Worker B starts or claims pending message

    W2->>Redis: XREADGROUP (or XCLAIM stale message)
    Redis-->>W2: job_1 (redelivered)
    W2->>Redis: GET task:{id}:image
    W2->>Worker: Full pipeline from scratch

    W2->>Redis: PUBLISH progress:{job_1} [code=0, result]
    W2->>Redis: XACK job_1
    Redis-->>API: Result frame
```

---

## Binary Frame Format

```
┌──────────────┬────────────────────┬──────────────────────┐
│   1 byte     │     4 bytes        │     N bytes          │
│ status code  │ payload length     │ payload              │
│              │ (big-endian)       │                      │
├──────────────┼────────────────────┼──────────────────────┤
│ 0 = result   │                    │ Pickled Context      │
│ 1 = progress │                    │ "detection", "ocr"…  │
│ 2 = error    │                    │ Error message string │
│ 3 = queue    │                    │ Position number      │
│ 4 = waiting  │                    │ (empty)              │
└──────────────┴────────────────────┴──────────────────────┘
```
