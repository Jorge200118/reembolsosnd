import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Money } from "./Money";

describe("Money", () => {
  it("formatea el monto sin usar float", () => {
    render(<Money monto="1234.5" />);
    expect(screen.getByText("$1,234.50")).toBeDefined();
  });
});
