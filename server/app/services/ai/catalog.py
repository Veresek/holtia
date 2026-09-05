from app.models.user_ai_settings import AiProvider
from app.schemas.ai import AiModelOption

PROVIDER_MODELS: dict[AiProvider, list[AiModelOption]] = {
    AiProvider.OPENAI: [
        AiModelOption(id="gpt-4o-mini", label="GPT-4o mini"),
        AiModelOption(id="gpt-4o", label="GPT-4o"),
        AiModelOption(id="gpt-4.1-mini", label="GPT-4.1 mini"),
        AiModelOption(id="gpt-4.1", label="GPT-4.1"),
    ],
    AiProvider.XAI: [
        AiModelOption(id="grok-4", label="Grok 4"),
        AiModelOption(id="grok-3-mini", label="Grok 3 mini"),
        AiModelOption(id="grok-3", label="Grok 3"),
    ],
    AiProvider.GEMINI: [
        AiModelOption(id="gemini-2.5-flash", label="Gemini 2.5 Flash"),
        AiModelOption(id="gemini-2.5-pro", label="Gemini 2.5 Pro"),
        AiModelOption(id="gemini-2.0-flash", label="Gemini 2.0 Flash"),
    ],
}

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
XAI_CHAT_URL = "https://api.x.ai/v1/chat/completions"
GEMINI_GENERATE_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)

PROPOSE_DAY_CHANGES = "propose_day_changes"

PROPOSE_DAY_CHANGES_PARAMETERS: dict[str, object] = {
    "type": "object",
    "properties": {
        "reply": {
            "type": "string",
            "description": (
                "Short message for the user. Ask a question when anything is unclear."
            ),
        },
        "tasks": {
            "type": "array",
            "description": "Tasks to create. Empty when asking a question.",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "date": {
                        "type": "string",
                        "description": "YYYY-MM-DD. Omit for an undated task.",
                    },
                },
                "required": ["title"],
            },
        },
        "notes": {
            "type": "array",
            "description": "Markdown notes to create. Empty when asking a question.",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "markdown": {"type": "string"},
                },
                "required": ["title"],
            },
        },
        "blocks": {
            "type": "array",
            "description": "One-off time blocks. Do not use recurrence.",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "date": {"type": "string", "description": "YYYY-MM-DD"},
                    "start": {"type": "string", "description": "HH:MM, 24-hour"},
                    "end": {"type": "string", "description": "HH:MM, 24-hour"},
                },
                "required": ["title", "date", "start", "end"],
            },
        },
    },
    "required": ["reply"],
}

OPENAI_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": PROPOSE_DAY_CHANGES,
            "description": (
                "Propose tasks, notes, and one-off time blocks. "
                "Use empty lists when asking a clarifying question."
            ),
            "parameters": PROPOSE_DAY_CHANGES_PARAMETERS,
        },
    }
]

GEMINI_TOOLS = [
    {
        "functionDeclarations": [
            {
                "name": PROPOSE_DAY_CHANGES,
                "description": (
                    "Propose tasks, notes, and one-off time blocks. "
                    "Use empty lists when asking a clarifying question."
                ),
                "parameters": PROPOSE_DAY_CHANGES_PARAMETERS,
            }
        ]
    }
]


def models_catalog() -> dict[AiProvider, list[AiModelOption]]:
    return {
        provider: [option.model_copy() for option in options]
        for provider, options in PROVIDER_MODELS.items()
    }


def is_supported_model(provider: AiProvider, model: str) -> bool:
    return any(option.id == model for option in PROVIDER_MODELS[provider])
