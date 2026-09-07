import account from "../assets/icons/account.svg?raw";
import anthropic from "../assets/icons/anthropic.svg?raw";
import calendar from "../assets/icons/calendar.svg?raw";
import chevronDown from "../assets/icons/chevron-down.svg?raw";
import chevronLeft from "../assets/icons/chevron-left.svg?raw";
import chevronRight from "../assets/icons/chevron-right.svg?raw";
import close from "../assets/icons/close.svg?raw";
import deepseek from "../assets/icons/deepseek.svg?raw";
import gemini from "../assets/icons/gemini.svg?raw";
import home from "../assets/icons/home.svg?raw";
import leaf from "../assets/icons/leaf.svg?raw";
import more from "../assets/icons/more.svg?raw";
import notes from "../assets/icons/notes.svg?raw";
import openai from "../assets/icons/openai.svg?raw";
import plus from "../assets/icons/plus.svg?raw";
import send from "../assets/icons/send.svg?raw";
import tasks from "../assets/icons/tasks.svg?raw";
import xai from "../assets/icons/xai.svg?raw";

const icons = {
  account,
  anthropic,
  calendar,
  chevronDown,
  chevronLeft,
  chevronRight,
  close,
  deepseek,
  gemini,
  home,
  leaf,
  more,
  notes,
  openai,
  plus,
  send,
  tasks,
  xai,
} as const;

export type IconName = keyof typeof icons;

interface IconProps {
  name: IconName;
  className?: string;
}

export function Icon({ name, className = "size-5" }: IconProps) {
  return (
    <span
      aria-hidden="true"
      className={`flex items-center justify-center text-current [&_svg]:block [&_svg]:size-full ${className}`}
      dangerouslySetInnerHTML={{ __html: icons[name] }}
    />
  );
}
