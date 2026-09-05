import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

import { AuthProvider } from "../auth/AuthProvider";
import { DataProvider } from "../data/DataProvider";

interface RenderWithRouterOptions extends Omit<RenderOptions, "wrapper"> {
  route?: string;
}

export function renderWithRouter(
  ui: ReactElement,
  { route = "/", ...options }: RenderWithRouterOptions = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>;
  }

  return render(ui, { wrapper: Wrapper, ...options });
}

export function renderPage(
  ui: ReactElement,
  options: Omit<RenderOptions, "wrapper"> = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter>
        <AuthProvider>
          <DataProvider>{children}</DataProvider>
        </AuthProvider>
      </MemoryRouter>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}
