import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { stubPreviewOverflow } from "../test/preview";
import {
  ExpandableMarkdown,
  NOTE_PREVIEW_MAX_HEIGHT_REM,
  TASK_PREVIEW_MAX_HEIGHT_REM,
} from "./ExpandableMarkdown";

describe("ExpandableMarkdown", () => {
  it("shows the full short body without a chevron", () => {
    render(
      <ExpandableMarkdown
        label="Write report"
        maxHeightRem={TASK_PREVIEW_MAX_HEIGHT_REM}
        markdown="Draft the opening."
      />,
    );

    expect(screen.getByText("Draft the opening.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Show more of Write report" }),
    ).not.toBeInTheDocument();
  });

  it("clips overflowing content until the chevron expands it", () => {
    const spy = stubPreviewOverflow();
    const markdown = `${"Keep the first version small. ".repeat(20)}Then expand the rest.`;
    const { container } = render(
      <ExpandableMarkdown
        label="Launch notes"
        maxHeightRem={NOTE_PREVIEW_MAX_HEIGHT_REM}
        markdown={markdown}
      />,
    );

    const toggle = screen.getByRole("button", {
      name: "Show more of Launch notes",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector(".overflow-hidden")).toHaveStyle({
      maxHeight: `${NOTE_PREVIEW_MAX_HEIGHT_REM}rem`,
    });

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAccessibleName("Show less of Launch notes");
    expect(container.querySelector(".overflow-hidden")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector(".overflow-hidden")).toHaveStyle({
      maxHeight: `${NOTE_PREVIEW_MAX_HEIGHT_REM}rem`,
    });
    spy.mockRestore();
  });
});
