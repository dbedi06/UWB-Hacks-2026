# VoiceMap AI Pipeline

OpenAI-based extraction: voice recording → structured `ExtractedReport`.

Two-step:

1. **Whisper** (`whisper-1`) transcribes audio bytes to text.
2. **GPT-4o** (`gpt-4o-2024-08-06`) extracts structured fields via `chat.completions.parse` with [models.py](models.py)`ExtractedReport` as the strict JSON-Schema response format.

## Layout

```
ai/
├── config.py              OpenAI key + model overrides (loaded from backend/.env)
├── models.py              ExtractedReport / Category / Severity
├── prompts/
│   └── extract.py         SYSTEM_PROMPT (categories, severity rubric, tag vocab, impact-summary rules)
├── extraction.py          AsyncOpenAI client, extract_report_from_audio / _text
└── tests/
    └── test_prompt_only.py   3-sample smoke test, no audio required
```

## Public API

```python
from ai.extraction import extract_report_from_audio, extract_report_from_text, ExtractionError

# from raw bytes
report = await extract_report_from_audio(audio_bytes, mime_type="audio/m4a")

# from a transcribed string (skips Whisper)
report = await extract_report_from_text("There's a broken streetlight at Oak and 5th...")
```

Both raise `ExtractionError` on OpenAI failure or unparseable output. Returned `ExtractedReport` is Pydantic-validated.

## Categories and severity

12 categories, 4 severity levels. See [models.py](models.py) for the full Literal enums and [prompts/extract.py](prompts/extract.py) for the rubric the LLM uses to pick.

`severity == "emergency"` is reserved for **immediate danger to life** (active fire, person hit by vehicle, medical emergency, violent crime in progress). The frontend should show a "call 911" modal on this value before storing the report.

## Testing

```bash
source ../backend/venv/bin/activate    # shared venv
python -m ai.tests.test_prompt_only    # 3 hardcoded transcripts; ~5 seconds total
```

For real-audio testing, see [../backend/tests/test_audio.py](../backend/tests/test_audio.py) — it lives in backend/ because it exercises the full pipeline including the route handler.

## Cost

Roughly **$0.007 per 30-second voice report**:
- Whisper: $0.006/minute → ~$0.003 for 30 sec
- GPT-4o: ~500 input tokens + ~300 output tokens → ~$0.004

About 15× cheaper than the alternative (`gpt-4o-audio-preview` single-call) at ~$0.09/report.
