from app.models.user_ai_settings import AiProvider
from app.schemas.ai import AiModelOption

PROVIDER_MODELS: dict[AiProvider, list[AiModelOption]] = {
    AiProvider.OPENAI: [
        AiModelOption(id="gpt-5.6-luna", label="GPT-5.6 Luna"),
        AiModelOption(id="gpt-5.6-terra", label="GPT-5.6 Terra"),
        AiModelOption(id="gpt-5.6-sol", label="GPT-5.6 Sol"),
        AiModelOption(id="gpt-4.1", label="GPT-4.1"),
    ],
    AiProvider.ANTHROPIC: [
        AiModelOption(id="claude-haiku-4-5", label="Claude Haiku 4.5"),
        AiModelOption(id="claude-sonnet-5", label="Claude Sonnet 5"),
        AiModelOption(id="claude-opus-5", label="Claude Opus 5"),
    ],
    AiProvider.GEMINI: [
        AiModelOption(id="gemini-3.8-flash", label="Gemini 3.8 Flash"),
        AiModelOption(id="gemini-3.5-flash-lite", label="Gemini 3.5 Flash-Lite"),
        AiModelOption(id="gemma-4-31b-it", label="Gemma 4 31B"),
        AiModelOption(id="gemini-3.7-flash", label="Gemini 3.7 Flash"),
        AiModelOption(id="gemini-3.5-flash", label="Gemini 3.5 Flash"),
        AiModelOption(id="gemini-3.1-pro-preview", label="Gemini 3.1 Pro"),
    ],
    AiProvider.DEEPSEEK: [
        AiModelOption(id="deepseek-v4-flash", label="DeepSeek V4 Flash"),
        AiModelOption(id="deepseek-v4-pro", label="DeepSeek V4 Pro"),
    ],
    AiProvider.XAI: [
        AiModelOption(id="grok-4.3", label="Grok 4.3"),
        AiModelOption(id="grok-4.5", label="Grok 4.5"),
        AiModelOption(id="grok-4.6", label="Grok 4.6"),
    ],
}

MODEL_ALIASES: dict[AiProvider, dict[str, str]] = {
    AiProvider.OPENAI: {
        "gpt-4o-mini": "gpt-5.6-luna",
        "gpt-4o": "gpt-5.6-terra",
        "gpt-4.1-mini": "gpt-5.6-luna",
    },
    AiProvider.XAI: {
        "grok-4": "grok-4.6",
        "grok-3-mini": "grok-4.3",
        "grok-3": "grok-4.3",
    },
    AiProvider.GEMINI: {
        "gemini-3.6-flash": "gemini-3.8-flash",
        "gemini-2.5-flash": "gemini-3.8-flash",
        "gemini-2.0-flash": "gemini-3.8-flash",
        "gemini-2.5-pro": "gemini-3.1-pro-preview",
    },
}

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
XAI_CHAT_URL = "https://api.x.ai/v1/chat/completions"
DEEPSEEK_CHAT_URL = "https://api.deepseek.com/chat/completions"
ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
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
                    "priority": {
                        "type": "string",
                        "enum": ["high", "medium", "low"],
                        "description": "Defaults to medium when omitted.",
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

ANTHROPIC_TOOLS = [
    {
        "name": PROPOSE_DAY_CHANGES,
        "description": (
            "Propose tasks, notes, and one-off time blocks. "
            "Use empty lists when asking a clarifying question."
        ),
        "input_schema": PROPOSE_DAY_CHANGES_PARAMETERS,
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

GEMINI_TOOL_CONFIG = {
    "functionCallingConfig": {
        "mode": "ANY",
        "allowedFunctionNames": [PROPOSE_DAY_CHANGES],
    }
}


def models_catalog() -> dict[AiProvider, list[AiModelOption]]:
    return {
        provider: [option.model_copy() for option in options]
        for provider, options in PROVIDER_MODELS.items()
    }


def resolve_model(provider: AiProvider, model: str) -> str:
    return MODEL_ALIASES.get(provider, {}).get(model, model)


def is_supported_model(provider: AiProvider, model: str) -> bool:
    if any(option.id == model for option in PROVIDER_MODELS[provider]):
        return True
    return model in MODEL_ALIASES.get(provider, {})
