import {
  Children,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";

const ROW_PX = 4;
const GAP_PX = 16;

interface MasonryProps {
  children: ReactNode;
}

export function Masonry({ children }: MasonryProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const wrappers = Array.from(container.children) as HTMLElement[];

    function measure() {
      for (const wrapper of wrappers) {
        const card = wrapper.firstElementChild;
        const height = card?.getBoundingClientRect().height ?? 0;
        wrapper.style.gridRowEnd = `span ${Math.max(1, Math.ceil((height + GAP_PX) / ROW_PX))}`;
      }
    }

    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    for (const wrapper of wrappers) {
      observer.observe(wrapper.firstElementChild ?? wrapper);
    }
    return () => observer.disconnect();
  }, [Children.count(children)]);

  return (
    <div
      className="grid min-w-0 gap-x-4 md:grid-cols-2"
      ref={containerRef}
      style={{ gridAutoRows: `${ROW_PX}px` }}
    >
      {Children.map(children, (child) => (
        <div className="min-w-0">{child}</div>
      ))}
    </div>
  );
}
