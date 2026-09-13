import { BLOCK_COLOR_PRESETS, DEFAULT_BLOCK_COLOR } from "./types";

const TOKEN_TO_HEX: Record<string, string> = {
  moss: "#3e513c",
  lichen: "#6a7d5c",
  rust: "#8c4a3e",
  ink: "#2a3128",
  slate: "#4d5f6b",
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function normalizeBlockColor(value: string | undefined | null): string {
  if (!value) {
    return DEFAULT_BLOCK_COLOR;
  }
  const fromToken = TOKEN_TO_HEX[value.trim().toLowerCase()];
  if (fromToken) {
    return fromToken;
  }
  const hex = value.trim();
  if (HEX_COLOR.test(hex)) {
    return hex.toLowerCase();
  }
  return DEFAULT_BLOCK_COLOR;
}

export function isPresetBlockColor(value: string): boolean {
  const hex = normalizeBlockColor(value);
  return BLOCK_COLOR_PRESETS.some((preset) => preset.value === hex);
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = normalizeBlockColor(hex);
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function blockColorFill(color: string | undefined): {
  backgroundColor: string;
  borderColor: string;
  borderLeftColor: string;
} {
  const hex = normalizeBlockColor(color);
  return {
    backgroundColor: hexToRgba(hex, 0.22),
    borderColor: hexToRgba(hex, 0.4),
    borderLeftColor: hex,
  };
}
