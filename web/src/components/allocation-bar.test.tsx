import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AllocationBar } from "./allocation-bar";

describe("AllocationBar", () => {
  it("describes every amount for screen readers and draws only the parts that have money", () => {
    render(<AllocationBar amounts={{ toAgenciesCents: 80_000, toNetworkCents: 20_000, heldCents: 0 }} />);

    const bar = screen.getByRole("img");
    expect(bar).toHaveAccessibleName("To agencies $800.00, To network $200.00, Held $0.00");
    expect(bar.children).toHaveLength(2);
    expect(bar.children[0]).toHaveStyle({ width: "80%" });
  });

  it("draws nothing when nothing was paid", () => {
    const { container } = render(<AllocationBar amounts={{ toAgenciesCents: 0, toNetworkCents: 0, heldCents: 0 }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
